// The maintainer board's API. Only users listed in prep_maintainers get past the check.
// GET: numbers for the board. POST: the few actions a maintainer takes (rollout share, topic-request review).
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { topicKey } from "../../shared/lessonKeys";
import { admin, userFrom } from "./_lib/auth";
import { log, withRequest } from "./_core/context";
import { json, report } from "./_core/errors";

const DAY = 86400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_rollout"), percent: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal("review_request"), id: z.string().uuid(), decision: z.enum(["approve", "reject"]), title: z.string().trim().min(2).max(200).optional(), description: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("mark_stale"), templateId: z.string().uuid() }),
]);

async function isMaintainer(db: SupabaseClient, userId: string) {
  const { data } = await db.from("prep_maintainers").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

async function stats(db: SupabaseClient) {
  const count = async (table: string, f?: (q: any) => any) => {
    const q = db.from(table).select("*", { count: "exact", head: true });
    const { count: n } = await (f ? f(q) : q);
    return n ?? 0;
  };
  const [usersTotal, usersNew7, lessons7, lessonsCached7, templatesReady, templatesStale, templatesGenerating, testsActive, maintainersN] = await Promise.all([
    count("prep_profiles"), count("prep_profiles", (q) => q.gte("created_at", iso(7 * DAY))),
    count("prep_lessons", (q) => q.gte("created_at", iso(7 * DAY))), count("prep_lessons", (q) => q.gte("created_at", iso(7 * DAY)).not("template_id", "is", null)),
    count("prep_lesson_templates", (q) => q.eq("status", "ready")), count("prep_lesson_templates", (q) => q.eq("status", "stale")),
    count("prep_lesson_templates", (q) => q.eq("status", "generating")), count("prep_test_bank", (q) => q.eq("status", "active")),
    count("prep_maintainers"),
  ]);

  const { data: active } = await db.from("prep_jobs").select("user_id").gte("created_at", iso(7 * DAY)).limit(20000);
  const { data: usage } = await db.from("ops_ai_usage").select("created_at,feature,model,cost_usd,user_id,input_tokens,output_tokens,cache_read_tokens").gte("created_at", iso(30 * DAY)).limit(50000);
  const u = (usage ?? []).map((r) => ({ ...r, cost: Number(r.cost_usd) }));
  const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 30 }, (_, i) => new Date(startOfToday.getTime() - (29 - i) * DAY).toISOString().slice(0, 10));
  const byDay = groupSum(u, (r) => r.created_at.slice(0, 10), (r) => r.cost);
  const topUserIds = groupSum(u.filter((r) => r.user_id), (r) => r.user_id!, (r) => r.cost).slice(0, 8);
  const { data: names } = topUserIds.length ? await db.from("prep_profiles").select("id,display_name").in("id", topUserIds.map((x) => x.name)) : { data: [] };

  const { data: jobs7 } = await db.from("prep_jobs").select("kind,status").gte("created_at", iso(7 * DAY)).limit(50000);
  const { data: failed } = await db.from("prep_jobs").select("kind,error,created_at,request_id").eq("status", "error").order("created_at", { ascending: false }).limit(10);
  const { data: events } = await db.from("ops_events").select("source,event,message,created_at,request_id").order("created_at", { ascending: false }).limit(20);
  const { data: requests } = await db.from("prep_topic_requests").select("id,request,title,description,kind,created_at").eq("status", "pending").order("created_at").limit(50);
  const { data: setting } = await db.from("ops_settings").select("value").eq("key", "lesson_cache_percent").maybeSingle();
  const { data: tpls } = await db.from("prep_lesson_templates").select("id,topic_key,format,level_band,variant,uses,status").in("status", ["ready", "stale"]).order("uses", { ascending: false }).limit(10);

  const lessonJobs = (jobs7 ?? []).filter((j) => j.kind !== "chat");
  return {
    generated_at: new Date().toISOString(),
    users: { total: usersTotal, new_7d: usersNew7, active_7d: new Set((active ?? []).map((r) => r.user_id)).size, maintainers: maintainersN },
    cost: {
      today: sum(u.filter((r) => r.created_at >= startOfToday.toISOString()).map((r) => r.cost)),
      d7: sum(u.filter((r) => r.created_at >= iso(7 * DAY)).map((r) => r.cost)),
      d30: sum(u.map((r) => r.cost)),
      by_day: days.map((d) => ({ day: d, value: byDay.find((x) => x.name === d)?.value ?? 0 })),
      by_feature: groupSum(u, (r) => r.feature, (r) => r.cost),
      by_model: groupSum(u, (r) => r.model, (r) => r.cost),
      top_users: topUserIds.map((x) => ({ ...x, name: (names ?? []).find((n) => n.id === x.name)?.display_name ?? x.name.slice(0, 8) })),
      tokens_30d: { input: sum(u.map((r) => r.input_tokens)), output: sum(u.map((r) => r.output_tokens)), cache_read: sum(u.map((r) => r.cache_read_tokens)) },
    },
    lessons: { created_7d: lessons7, cached_7d: lessonsCached7, templates_ready: templatesReady, templates_stale: templatesStale, templates_generating: templatesGenerating, tests_active: testsActive, top_templates: tpls ?? [] },
    jobs: { total_7d: lessonJobs.length, failed_7d: lessonJobs.filter((j) => j.status === "error").length, by_kind: groupSum(lessonJobs, (j) => j.kind, () => 1), recent_failures: failed ?? [] },
    errors: events ?? [],
    requests: requests ?? [],
    rollout_percent: Number(setting?.value ?? 0),
  };
}

export default (req: Request) => withRequest(req, "admin", async (c) => {
  const db = admin();
  c.db = db;
  const userId = await userFrom(req, db);
  if (!userId) return json({ error: "unauthorized" }, 401);
  c.userId = userId;
  if (!(await isMaintainer(db, userId))) { log("warn", "admin.forbidden"); return json({ error: "forbidden" }, 403); }

  try {
    if (req.method === "GET") return json(await stats(db), 200, c.requestId);
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const parsed = Action.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "bad request" }, 400);
    const a = parsed.data;
    log("info", "admin.action", { action: a.action });

    if (a.action === "set_rollout") {
      await db.from("ops_settings").upsert({ key: "lesson_cache_percent", value: a.percent, updated_at: new Date().toISOString() });
    } else if (a.action === "mark_stale") {
      await db.from("prep_lesson_templates").update({ status: "stale" }).eq("id", a.templateId).eq("status", "ready");
    } else {
      const { data: r } = await db.from("prep_topic_requests").select("*").eq("id", a.id).eq("status", "pending").maybeSingle();
      if (!r) return json({ error: "not found" }, 404);
      if (a.decision === "reject") {
        await db.from("prep_topic_requests").update({ status: "rejected", decided_by: userId }).eq("id", a.id);
      } else {
        // The maintainer's wording becomes the canonical topic; the requester's matching topics join the cache.
        const title = a.title ?? r.title ?? r.request.slice(0, 80);
        const key = topicKey(title);
        await db.from("prep_topic_catalog").upsert({ topic_key: key, title, description: a.description ?? r.description ?? "", kind: r.kind ?? "concept", origin: "learner_request" }, { onConflict: "topic_key", ignoreDuplicates: true });
        await db.from("prep_topic_requests").update({ status: "approved", topic_key: key, decided_by: userId }).eq("id", a.id);
        if (r.title) await db.from("prep_topics").update({ topic_key: key }).eq("user_id", r.user_id).eq("title", r.title).is("topic_key", null);
      }
    }
    return json({ ok: true }, 200, c.requestId);
  } catch (e) {
    await report(e, "admin.failed");
    return json({ error: "failed" }, 500, c.requestId);
  }
});
