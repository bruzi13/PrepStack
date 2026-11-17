// Browser half of error monitoring: the site posts uncaught errors here and they land in ops_events, next to
// server errors, on the maintainer board. Accepts anonymous reports (an error can happen before sign-in),
// stores no free-form personal data beyond the message, and caps volume per user.
import { admin, userFrom } from "./_lib/auth";
import { log, withRequest } from "./_core/context";
import { json } from "./_core/errors";
import { ErrorReport } from "./_core/schemas";

const PER_HOUR = 30;

export default (req: Request) => withRequest(req, "report-error", async (c) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  const parsed = ErrorReport.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false }, 400);
  const userId = await userFrom(req, db).catch(() => null);
  c.userId = userId ?? undefined;

  if (userId) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("ops_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "web").gte("created_at", since);
    if ((count ?? 0) >= PER_HOUR) return json({ ok: true, dropped: true });
  }
  const r = parsed.data;
  log("warn", "web.error", { kind: r.kind, message: r.message, path: r.path });
  await db.from("ops_events").insert({
    level: "error", source: "web", event: `web.${r.kind}`, message: r.message,
    detail: { stack: r.stack, path: r.path, ua: req.headers.get("user-agent")?.slice(0, 200) },
    user_id: userId, request_id: r.requestId ?? c.requestId,
  });
  return json({ ok: true });
});
