// Browser half of error monitoring: the site posts uncaught errors here and they land in ops_events, next to
// server errors, on the maintainer board. Accepts anonymous reports (an error can happen before sign-in),
// stores no free-form personal data beyond the message, and caps volume per user.
import { admin, userFrom } from "./_lib/auth";
import { log, withRequest } from "./_core/context";
import { json } from "./_core/errors";
import { ErrorReport } from "./_core/schemas";

const MAX_REPORTS_PER_USER_PER_HOUR = 30;

export default (req: Request) => withRequest(req, "report-error", async (requestContext) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  const parsed = ErrorReport.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false }, 400);
  const userId = await userFrom(req, db).catch(() => null);
  requestContext.userId = userId ?? undefined;

  if (userId) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("ops_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "web").gte("created_at", since);
    if ((count ?? 0) >= MAX_REPORTS_PER_USER_PER_HOUR) return json({ ok: true, dropped: true });
  }
  const errorReport = parsed.data;
  log("warn", "web.error", { kind: errorReport.kind, message: errorReport.message, path: errorReport.path });
  await db.from("ops_events").insert({
    level: "error", source: "web", event: `web.${errorReport.kind}`, message: errorReport.message,
    detail: { stack: errorReport.stack, path: errorReport.path, ua: req.headers.get("user-agent")?.slice(0, 200) },
    user_id: userId, request_id: errorReport.requestId ?? requestContext.requestId,
  });
  return json({ ok: true });
});
