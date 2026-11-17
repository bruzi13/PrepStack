// The maintainer board's API. Only users listed in prep_maintainers get past the check.
// GET: numbers for the board (shape: shared/maintainerBoard.ts). POST: the few actions a maintainer takes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { topicKey } from "../../shared/lessonKeys";
import type { MaintainerAction, MaintainerBoardStats, NamedAmount } from "../../shared/maintainerBoard";
import { admin, userFrom } from "./_lib/auth";
import { log, withRequest } from "./_core/context";
import { json, report } from "./_core/errors";

const DAY_MS = 86_400_000;
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();
const CACHE_PERCENT_SETTING = "lesson_cache_percent";

const MaintainerActionSchema: z.ZodType<MaintainerAction> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_rollout"), percent: z.number().int().min(0).max(100) }),
  z.object({
    action: z.literal("review_request"), requestId: z.string().uuid(), decision: z.enum(["approve", "reject"]),
    title: z.string().trim().min(2).max(200).optional(), description: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("mark_stale"), templateId: z.string().uuid() }),
]);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Totals per group, largest first. */
function totalsBy<T>(rows: T[], groupOf: (row: T) => string, amountOf: (row: T) => number): NamedAmount[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(groupOf(row), (totals.get(groupOf(row)) ?? 0) + amountOf(row));
  return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

class MaintainerBoard {
  constructor(private readonly db: SupabaseClient) {}

  async isMaintainer(userId: string): Promise<boolean> {
    const { data } = await this.db.from("prep_maintainers").select("user_id").eq("user_id", userId).maybeSingle();
    return !!data;
  }

  private async count(table: string, narrow?: (query: any) => any): Promise<number> {
    const query = this.db.from(table).select("*", { count: "exact", head: true });
    const { count } = await (narrow ? narrow(query) : query);
    return count ?? 0;
  }

  async stats(): Promise<MaintainerBoardStats> {
    const weekAgo = isoAgo(7 * DAY_MS);
    const [totalUsers, newUsers, lessonsThisWeek, cachedLessonsThisWeek, templatesReady, templatesStale, templatesGenerating, activeBankTests, maintainerCount] = await Promise.all([
      this.count("prep_profiles"),
      this.count("prep_profiles", (query) => query.gte("created_at", weekAgo)),
      this.count("prep_lessons", (query) => query.gte("created_at", weekAgo)),
      this.count("prep_lessons", (query) => query.gte("created_at", weekAgo).not("template_id", "is", null)),
      this.count("prep_lesson_templates", (query) => query.eq("status", "ready")),
      this.count("prep_lesson_templates", (query) => query.eq("status", "stale")),
      this.count("prep_lesson_templates", (query) => query.eq("status", "generating")),
      this.count("prep_test_bank", (query) => query.eq("status", "active")),
      this.count("prep_maintainers"),
    ]);

    const { data: recentJobUsers } = await this.db.from("prep_jobs").select("user_id").gte("created_at", weekAgo).limit(20000);
    const { data: usageRows } = await this.db.from("ops_ai_usage")
      .select("created_at,feature,model,cost_usd,user_id,input_tokens,output_tokens,cache_read_tokens").gte("created_at", isoAgo(30 * DAY_MS)).limit(50000);
    const usage = (usageRows ?? []).map((row) => ({ ...row, cost: Number(row.cost_usd) }));
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const last30Days = Array.from({ length: 30 }, (_, index) => new Date(startOfToday.getTime() - (29 - index) * DAY_MS).toISOString().slice(0, 10));
    const costByDay = totalsBy(usage, (row) => row.created_at.slice(0, 10), (row) => row.cost);
    const topSpenders = totalsBy(usage.filter((row) => row.user_id), (row) => row.user_id!, (row) => row.cost).slice(0, 8);
    const { data: spenderProfiles } = topSpenders.length
      ? await this.db.from("prep_profiles").select("id,display_name").in("id", topSpenders.map((spender) => spender.name))
      : { data: [] };

    const { data: jobsThisWeek } = await this.db.from("prep_jobs").select("kind,status").gte("created_at", weekAgo).limit(50000);
    const { data: failedJobs } = await this.db.from("prep_jobs").select("kind,error,created_at,request_id").eq("status", "error").order("created_at", { ascending: false }).limit(10);
    const { data: events } = await this.db.from("ops_events").select("source,event,message,created_at,request_id").order("created_at", { ascending: false }).limit(20);
    const { data: requests } = await this.db.from("prep_topic_requests").select("id,request,title,description,kind,created_at").eq("status", "pending").order("created_at").limit(50);
    const { data: rolloutSetting } = await this.db.from("ops_settings").select("value").eq("key", CACHE_PERCENT_SETTING).maybeSingle();
    const { data: templates } = await this.db.from("prep_lesson_templates").select("id,topic_key,format,level_band,variant,uses,status")
      .in("status", ["ready", "stale"]).order("uses", { ascending: false }).limit(10);

    // Chat turns are counted as jobs for the daily limit, but they are not background jobs.
    const backgroundJobs = (jobsThisWeek ?? []).filter((job) => job.kind !== "chat");
    return {
      generatedAt: new Date().toISOString(),
      users: { total: totalUsers, newThisWeek: newUsers, activeThisWeek: new Set((recentJobUsers ?? []).map((row) => row.user_id)).size, maintainers: maintainerCount },
      cost: {
        today: sum(usage.filter((row) => row.created_at >= startOfToday.toISOString()).map((row) => row.cost)),
        last7Days: sum(usage.filter((row) => row.created_at >= weekAgo).map((row) => row.cost)),
        last30Days: sum(usage.map((row) => row.cost)),
        byDay: last30Days.map((day) => ({ day, usd: costByDay.find((entry) => entry.name === day)?.value ?? 0 })),
        byFeature: totalsBy(usage, (row) => row.feature, (row) => row.cost),
        byModel: totalsBy(usage, (row) => row.model, (row) => row.cost),
        topUsers: topSpenders.map((spender) => ({
          ...spender, name: (spenderProfiles ?? []).find((profile) => profile.id === spender.name)?.display_name ?? spender.name.slice(0, 8),
        })),
        tokens30Days: { input: sum(usage.map((row) => row.input_tokens)), output: sum(usage.map((row) => row.output_tokens)), cacheRead: sum(usage.map((row) => row.cache_read_tokens)) },
      },
      lessons: {
        createdThisWeek: lessonsThisWeek, servedFromCacheThisWeek: cachedLessonsThisWeek,
        templatesReady, templatesStale, templatesGenerating, activeBankTests,
        topTemplates: (templates ?? []).map((template) => ({
          id: template.id, topicKey: template.topic_key, format: template.format, levelBand: template.level_band,
          variant: template.variant, uses: template.uses, status: template.status,
        })),
      },
      jobs: {
        totalThisWeek: backgroundJobs.length,
        failedThisWeek: backgroundJobs.filter((job) => job.status === "error").length,
        byKind: totalsBy(backgroundJobs, (job) => job.kind, () => 1),
        recentFailures: (failedJobs ?? []).map((job) => ({ kind: job.kind, error: job.error, createdAt: job.created_at, requestId: job.request_id })),
      },
      errors: (events ?? []).map((event) => ({ source: event.source, event: event.event, message: event.message, createdAt: event.created_at, requestId: event.request_id })),
      pendingTopicRequests: (requests ?? []).map((request) => ({
        id: request.id, request: request.request, title: request.title, description: request.description, kind: request.kind, createdAt: request.created_at,
      })),
      cacheRolloutPercent: Number(rolloutSetting?.value ?? 0),
    };
  }

  /** Returns false when the action's target does not exist (or was already handled). */
  async perform(action: MaintainerAction, maintainerId: string): Promise<boolean> {
    switch (action.action) {
      case "set_rollout":
        await this.db.from("ops_settings").upsert({ key: CACHE_PERCENT_SETTING, value: action.percent, updated_at: new Date().toISOString() });
        return true;
      case "mark_stale":
        await this.db.from("prep_lesson_templates").update({ status: "stale" }).eq("id", action.templateId).eq("status", "ready");
        return true;
      case "review_request":
        return this.reviewTopicRequest(action, maintainerId);
    }
  }

  private async reviewTopicRequest(action: Extract<MaintainerAction, { action: "review_request" }>, maintainerId: string): Promise<boolean> {
    const { data: request } = await this.db.from("prep_topic_requests").select("*").eq("id", action.requestId).eq("status", "pending").maybeSingle();
    if (!request) return false;
    if (action.decision === "reject") {
      await this.db.from("prep_topic_requests").update({ status: "rejected", decided_by: maintainerId }).eq("id", action.requestId);
      return true;
    }
    // The maintainer's wording becomes the canonical topic; the requester's matching topics join the shared cache.
    const title = action.title ?? request.title ?? request.request.slice(0, 80);
    const key = topicKey(title);
    await this.db.from("prep_topic_catalog").upsert(
      { topic_key: key, title, description: action.description ?? request.description ?? "", kind: request.kind ?? "concept", origin: "learner_request" },
      { onConflict: "topic_key", ignoreDuplicates: true },
    );
    await this.db.from("prep_topic_requests").update({ status: "approved", topic_key: key, decided_by: maintainerId }).eq("id", action.requestId);
    if (request.title) await this.db.from("prep_topics").update({ topic_key: key }).eq("user_id", request.user_id).eq("title", request.title).is("topic_key", null);
    return true;
  }
}

export default (req: Request) => withRequest(req, "admin", async (requestContext) => {
  const db = admin();
  requestContext.db = db;
  const userId = await userFrom(req, db);
  if (!userId) return json({ error: "unauthorized" }, 401);
  requestContext.userId = userId;
  const board = new MaintainerBoard(db);
  if (!(await board.isMaintainer(userId))) { log("warn", "admin.forbidden"); return json({ error: "forbidden" }, 403); }

  try {
    if (req.method === "GET") return json(await board.stats(), 200, requestContext.requestId);
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const action = MaintainerActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!action.success) return json({ error: "bad request" }, 400);
    log("info", "admin.action", { action: action.data.action });
    if (!(await board.perform(action.data, userId))) return json({ error: "not found" }, 404);
    return json({ ok: true }, 200, requestContext.requestId);
  } catch (failure) {
    await report(failure, "admin.failed");
    return json({ error: "failed" }, 500, requestContext.requestId);
  }
});
