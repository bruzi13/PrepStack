// Background function (up to 15 minutes): validates a job request, creates the job row itself, runs it,
// and writes the result. The browser sends a job id it generated, the kind and validated arguments; it then
// watches the row (RLS lets a learner read only their own jobs).
import { admin, underDailyLimit, userFrom } from "./_lib/auth";
import { buildRoleMap } from "./_lib/jobs";
import { asFeature, log, withRequest } from "./_core/context";
import { json, publicMessage, report, UserError } from "./_core/errors";
import { JOBS, services } from "./_core/registry";
import { JobArgs, JobRequest } from "./_core/schemas";

export default (req: Request) => withRequest(req, "ai-job", async (c) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  c.db = db;
  const body = await req.json().catch(() => ({}));

  // Weekly refresh, called by the scheduled function: re-research stale role maps and mark weak lessons stale.
  if (body.refresh === true) {
    if (req.headers.get("x-internal") !== process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "forbidden" }, 403);
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: stale } = await db.from("prep_role_maps").select("role_key, role_title").lt("refreshed_at", cutoff).order("refreshed_at").limit(4);
    for (const m of stale ?? []) {
      const [track, , bucket] = String(m.role_key).split(":");
      try { await buildRoleMap(db, m.role_key, m.role_title ?? "Software Engineer", bucket ?? "mid", track === "ai" ? "ai" : "main"); }
      catch (e) { await report(e, "refresh.role_map", { role_key: m.role_key }); }
    }
    const { data: marked } = await db.rpc("prep_mark_stale_templates");
    log("info", "refresh.done", { role_maps: stale?.length ?? 0, templates_marked_stale: marked });
    return json({ refreshed: stale?.length ?? 0, stale_templates: marked });
  }

  const userId = await userFrom(req, db);
  if (!userId) return json({ error: "unauthorized" }, 401);
  c.userId = userId;

  const parsed = JobRequest.safeParse(body);
  if (!parsed.success) { log("warn", "job.bad_request", { issues: parsed.error.issues.slice(0, 3) }); return json({ error: "bad request" }, 400); }
  const { jobId, kind } = parsed.data;
  const args = JobArgs[kind].safeParse(parsed.data.args);

  const { error: insertError } = await db.from("prep_jobs").insert({ id: jobId, user_id: userId, kind, input: parsed.data.args, status: "running", request_id: c.requestId });
  if (insertError) { log("warn", "job.duplicate_or_bad_id", { jobId, message: insertError.message }); return json({ error: "bad job id" }, 409); }
  const finish = (patch: Record<string, unknown>) => db.from("prep_jobs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", jobId);

  if (!args.success) {
    await finish({ status: "error", error: "הבקשה לא תקינה." });
    log("warn", "job.bad_args", { kind, issues: args.error.issues.slice(0, 3) });
    return json({ ok: false });
  }
  if (!(await underDailyLimit(db, userId))) {
    await finish({ status: "error", error: "הגעתם למכסת בקשות ה-AI היומית. נסו שוב מחר." });
    return json({ ok: false });
  }

  const started = Date.now();
  try {
    const handler = JOBS[kind] as { run: (a: unknown, env: Parameters<(typeof JOBS)["plan"]["run"]>[1]) => ReturnType<(typeof JOBS)["plan"]["run"]> };
    const out = await asFeature(kind, () => handler.run(args.data, { db, userId, services: services(db) }));
    await finish({ status: "done", result: out.result });
    log("info", "job.done", { kind, ms: Date.now() - started });
    // Work that may happen after the learner has their result (refreshing a stale shared lesson).
    if (out.after) await out.after().catch((e) => report(e, "job.after", { kind }));
  } catch (e) {
    if (!(e instanceof UserError)) await report(e, "job.failed", { kind, ms: Date.now() - started });
    await finish({ status: "error", error: publicMessage(e) });
  }
  return json({ ok: true });
});
