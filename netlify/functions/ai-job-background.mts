// Background function (up to 15 minutes): runs one AI job and writes the result into prep_jobs.
// The site inserts a queued row, calls this with the row id, then watches the row.
import { admin, json, underDailyLimit, userFrom } from "./_lib/auth";
import { buildRoleMap, runJob } from "./_lib/jobs";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();
  const body = await req.json().catch(() => ({}));

  // Weekly refresh, called by the scheduled function: re-research the role maps that have gone stale.
  if (body.refresh === true) {
    if (req.headers.get("x-internal") !== process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "forbidden" }, 403);
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: stale } = await db.from("prep_role_maps").select("role_key, role_title").lt("refreshed_at", cutoff).order("refreshed_at").limit(4);
    for (const m of stale ?? []) {
      const [track, , bucket] = String(m.role_key).split(":");
      try { await buildRoleMap(db, m.role_key, m.role_title ?? "Software Engineer", bucket ?? "mid", track === "ai" ? "ai" : "main"); }
      catch (e) { console.error("refresh failed", m.role_key, e); }
    }
    return json({ refreshed: stale?.length ?? 0 });
  }

  const userId = await userFrom(req, db);
  if (!userId) return json({ error: "unauthorized" }, 401);
  const { data: job } = await db.from("prep_jobs").select("*").eq("id", body.jobId).maybeSingle();
  if (!job || job.user_id !== userId || job.status !== "queued") return json({ error: "job not found" }, 404);

  const finish = (patch: Record<string, unknown>) =>
    db.from("prep_jobs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", job.id);

  if (!(await underDailyLimit(db, userId))) {
    await finish({ status: "error", error: "הגעתם למכסת בקשות ה-AI היומית. נסו שוב מחר." });
    return json({ ok: false });
  }
  await db.from("prep_jobs").update({ status: "running" }).eq("id", job.id);
  try {
    const result = await runJob(job.kind, job.input ?? {}, db);
    await finish({ status: "done", result });
  } catch (e) {
    console.error("job failed", job.kind, e);
    await finish({ status: "error", error: e instanceof Error ? e.message.slice(0, 500) : "שגיאה לא צפויה" });
  }
  return json({ ok: true });
};
