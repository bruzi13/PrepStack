// Small helpers that turn AI results into rows.
import { runJob } from "@/services/ai";
import { db, type User } from "@/services/store";
import type { Plan, Profile, Topic } from "@/types";
import type { TopicKind } from "@shared/catalog";

interface PlanResult {
  title: string; summary: string; market_notes: string[]; role_key: string;
  modules: { name: string; why: string; topics: { title: string; description: string; kind: TopicKind; priority: number; est_minutes: number }[] }[];
  sources: { title: string; url: string }[]; map_refreshed_at?: string; trends?: Plan["data"]["trends"]; interview_format_notes?: string[]; excellence?: Plan["data"]["excellence"];
}

/** What the AI needs to know about the learner, without ids. */
export const profileBrief = (p: Profile | null) => (p ? { name: p.display_name, ...p.answers } : {});

export async function addTopics(user: User, plan: Plan, items: { module: string; title: string; description: string; kind: TopicKind; priority?: number; est_minutes?: number }[], startOrd: number) {
  if (!items.length) return [];
  return db.insert<Topic>("prep_topics", items.map((t, i) => ({
    user_id: user.id, plan_id: plan.id, track: plan.track, module: t.module, title: t.title, description: t.description,
    kind: t.kind, ord: startOrd + i, priority: t.priority ?? 2, est_minutes: t.est_minutes ?? 30,
    status: "todo", mastery: 0, reviews: 0, interval_days: 0, next_review: null, last_score: null,
  })));
}

/** Build (or rebuild) the learner's plan for a track. */
export async function createPlan(user: User, profile: Profile, track: "main" | "ai"): Promise<Plan> {
  const r = await runJob<PlanResult>("plan", { profile: profileBrief(profile), diagnostic: profile.answers.diagnostic ?? {}, track }, user.id);
  for (const old of await db.list<Plan>("prep_plans", { eq: { user_id: user.id, track, active: true } })) {
    await db.update("prep_plans", old.id, { active: false });
    await db.remove("prep_topics", { plan_id: old.id, reviews: 0 }); // keep topics the learner already studied
  }
  const [plan] = await db.insert<Plan>("prep_plans", {
    user_id: user.id, track, role_key: r.role_key, title: r.title, active: true,
    data: { summary: r.summary, market_notes: r.market_notes, sources: r.sources, map_refreshed_at: r.map_refreshed_at, trends: r.trends, interview_format_notes: r.interview_format_notes, excellence: r.excellence },
  });
  await addTopics(user, plan, r.modules.flatMap((m) => m.topics.map((t) => ({ ...t, module: m.name }))), 0);
  return plan;
}

/** Ask the engine whether the market moved, and add any new topics to the existing plan. Returns how many were added. */
export async function refreshPlan(user: User, profile: Profile, plan: Plan, topics: Topic[]): Promise<number> {
  const r = await runJob<PlanResult>("plan", { profile: profileBrief(profile), diagnostic: profile.answers.diagnostic ?? {}, track: plan.track, existing_titles: topics.map((t) => t.title) }, user.id);
  const have = new Set(topics.map((t) => t.title));
  const fresh = r.modules.flatMap((m) => m.topics.map((t) => ({ ...t, module: m.name }))).filter((t) => !have.has(t.title));
  await addTopics(user, plan, fresh, topics.length);
  await db.update("prep_plans", plan.id, { data: { ...plan.data, market_notes: r.market_notes?.length ? r.market_notes : plan.data.market_notes, map_refreshed_at: r.map_refreshed_at, trends: r.trends, sources: r.sources } });
  return fresh.length;
}

/** "What else do you want to learn?": the engine turns the wish into topics added at the end of the plan. */
export async function addCustomTopics(user: User, profile: Profile, plan: Plan, topics: Topic[], request: string): Promise<{ note: string; added: number }> {
  const r = await runJob<{ note: string; module: string; topics: { title: string; description: string; kind: TopicKind; priority: number; est_minutes: number }[] }>(
    "custom", { request, profile: profileBrief(profile), existing_titles: topics.map((t) => t.title) }, user.id);
  const have = new Set(topics.map((t) => t.title));
  const fresh = r.topics.filter((t) => !have.has(t.title)).map((t) => ({ ...t, module: r.module || "נושאים שהוספתי" }));
  await addTopics(user, plan, fresh, topics.length);
  return { note: r.note, added: fresh.length };
}
