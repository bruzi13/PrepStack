// Background function (up to 15 minutes): validates a job request, creates the job row itself, runs it,
// and writes the result. The browser sends a job id it generated, the kind and validated arguments; it then
// watches the row (RLS lets a learner read only their own jobs).
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, underDailyLimit, userFrom } from "./_lib/auth";
import { buildRoleMap } from "./_lib/jobs";
import { asFeature, log, withRequest } from "./_core/context";
import { json, publicMessage, report, UserError } from "./_core/errors";
import { createServices, runJob } from "./_core/registry";
import { JobArgs, JobRequest, type JobKind } from "./_core/schemas";

const ROLE_MAP_MAX_AGE_MS = 7 * 86_400_000;
const ROLE_MAPS_PER_REFRESH = 4;

/** Weekly refresh, called by the scheduled function: re-research stale role maps and mark weak lessons stale. */
async function weeklyRefresh(db: SupabaseClient): Promise<Response> {
  const cutoff = new Date(Date.now() - ROLE_MAP_MAX_AGE_MS).toISOString();
  const { data: staleMaps } = await db.from("prep_role_maps").select("role_key, role_title").lt("refreshed_at", cutoff).order("refreshed_at").limit(ROLE_MAPS_PER_REFRESH);
  for (const roleMap of staleMaps ?? []) {
    // Role keys look like "main:<role-slug>:<level>:v2" or "ai:agents:all:v2".
    const [track, , levelBucket] = String(roleMap.role_key).split(":");
    try { await buildRoleMap(db, roleMap.role_key, roleMap.role_title ?? "Software Engineer", levelBucket ?? "mid", track === "ai" ? "ai" : "main"); }
    catch (failure) { await report(failure, "refresh.role_map", { role_key: roleMap.role_key }); }
  }
  const { data: templatesMarkedStale } = await db.rpc("prep_mark_stale_templates");
  log("info", "refresh.done", { role_maps: staleMaps?.length ?? 0, templates_marked_stale: templatesMarkedStale });
  return json({ refreshed: staleMaps?.length ?? 0, stale_templates: templatesMarkedStale });
}

export default (req: Request) => withRequest(req, "ai-job", async (requestContext) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  requestContext.db = db;
  const body = await req.json().catch(() => ({}));

  if (body.refresh === true) {
    if (req.headers.get("x-internal") !== process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "forbidden" }, 403);
    return weeklyRefresh(db);
  }

  const userId = await userFrom(req, db);
  if (!userId) return json({ error: "unauthorized" }, 401);
  requestContext.userId = userId;

  const request = JobRequest.safeParse(body);
  if (!request.success) { log("warn", "job.bad_request", { issues: request.error.issues.slice(0, 3) }); return json({ error: "bad request" }, 400); }
  const { jobId, kind } = request.data;
  const args = JobArgs[kind].safeParse(request.data.args);

  const { error: insertError } = await db.from("prep_jobs").insert({ id: jobId, user_id: userId, kind, input: request.data.args, status: "running", request_id: requestContext.requestId });
  if (insertError) { log("warn", "job.duplicate_or_bad_id", { jobId, message: insertError.message }); return json({ error: "bad job id" }, 409); }
  const finishJob = (fields: Record<string, unknown>) => db.from("prep_jobs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", jobId);

  if (!args.success) {
    await finishJob({ status: "error", error: "הבקשה לא תקינה." });
    log("warn", "job.bad_args", { kind, issues: args.error.issues.slice(0, 3) });
    return json({ ok: false });
  }
  if (!(await underDailyLimit(db, userId))) {
    await finishJob({ status: "error", error: "הגעתם למכסת בקשות ה-AI היומית. נסו שוב מחר." });
    return json({ ok: false });
  }

  const startedAt = Date.now();
  try {
    const outcome = await asFeature(kind, () => runJob(kind as JobKind, args.data as never, { db, userId, services: createServices(db) }));
    await finishJob({ status: "done", result: outcome.result });
    log("info", "job.done", { kind, ms: Date.now() - startedAt });
    if (outcome.after) await outcome.after().catch((failure) => report(failure, "job.after", { kind }));
  } catch (failure) {
    if (!(failure instanceof UserError)) await report(failure, "job.failed", { kind, ms: Date.now() - startedAt });
    await finishJob({ status: "error", error: publicMessage(failure) });
  }
  return json({ ok: true });
});
