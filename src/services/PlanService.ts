// Building and growing a learner's study plan: the AI drafts topics, the repositories store them.
import type { AiEngine } from "@/ai/AiEngine";
import type { PlanRepository } from "@/data/repositories/PlanRepository";
import type { TopicRepository } from "@/data/repositories/TopicRepository";
import type { PlanDraft, SuggestedTopic, Track } from "@/domain/records";
import type { StudyPlan } from "@/domain/StudyPlan";
import { TopicList } from "@/domain/TopicList";

/** The server reads at most this many existing titles when looking for new topics. */
const MAX_EXISTING_TITLES = 300;
const CUSTOM_TOPICS_MODULE = "נושאים שהוספתי";

export class PlanService {
  constructor(private readonly ai: AiEngine, private readonly plans: PlanRepository, private readonly topics: TopicRepository) {}

  /** The active plan for a track and its topics, or null when the learner has none yet. */
  async loadActivePlan(userId: string, track: Track): Promise<{ plan: StudyPlan; topics: TopicList } | null> {
    const plan = await this.plans.findActive(userId, track);
    if (!plan) return null;
    return { plan, topics: new TopicList(await this.topics.listForPlan(plan.id)) };
  }

  /** Build (or rebuild) the plan for a track. Topics already studied in the old plan stay as history. */
  async createPlan(userId: string, track: Track): Promise<StudyPlan> {
    const draft = await this.ai.runJob("plan", { track });
    const previous = await this.plans.findActive(userId, track);
    if (previous) {
      await this.plans.deactivate(previous.id);
      await this.topics.deleteUnstudied(previous.id);
    }
    const plan = await this.plans.create(userId, track, {
      roleKey: draft.role_key, title: draft.title,
      details: {
        summary: draft.summary, market_notes: draft.market_notes, sources: draft.sources, map_refreshed_at: draft.map_refreshed_at,
        trends: draft.trends, interview_format_notes: draft.interview_format_notes, excellence: draft.excellence,
      },
    });
    await this.topics.addToPlan(plan, PlanService.flattenModules(draft), 0);
    return plan;
  }

  /** Ask whether the market moved, and add any new topics to the plan. Returns how many were added. */
  async refreshFromMarket(plan: StudyPlan, current: TopicList): Promise<number> {
    const draft = await this.ai.runJob("plan", { track: plan.track, existing_titles: current.titles.slice(0, MAX_EXISTING_TITLES) });
    const newTopics = current.withoutExisting(PlanService.flattenModules(draft));
    await this.topics.addToPlan(plan, newTopics, current.size);
    await this.plans.updateDetails(plan.id, {
      ...plan.details,
      market_notes: draft.market_notes?.length ? draft.market_notes : plan.marketNotes,
      map_refreshed_at: draft.map_refreshed_at, trends: draft.trends, sources: draft.sources,
    });
    return newTopics.length;
  }

  /** "What else do you want to learn?": the AI turns the wish into topics added at the end of the plan. */
  async addRequestedTopics(plan: StudyPlan, current: TopicList, request: string): Promise<{ note: string; addedCount: number }> {
    const draft = await this.ai.runJob("custom", { request, existing_titles: current.titles.slice(0, MAX_EXISTING_TITLES) });
    const moduleName = draft.module || CUSTOM_TOPICS_MODULE;
    const newTopics = current.withoutExisting(draft.topics).map((topic) => ({ ...topic, module: moduleName }));
    await this.topics.addToPlan(plan, newTopics, current.size);
    return { note: draft.note, addedCount: newTopics.length };
  }

  /**
   * Add suggested topics (from a job analysis or an interview scorecard) to the main plan, at high priority.
   * Returns false when the learner has no main plan yet.
   */
  async addSuggestions(userId: string, suggestions: SuggestedTopic[], moduleName: string): Promise<boolean> {
    const plan = await this.plans.findActive(userId, "main");
    if (!plan) return false;
    const existing = await this.topics.listForPlan(plan.id);
    await this.topics.addToPlan(plan, suggestions.map((topic) => ({ ...topic, module: moduleName, priority: 1 })), existing.length);
    return true;
  }

  private static flattenModules(draft: PlanDraft): (SuggestedTopic & { module: string })[] {
    return draft.modules.flatMap((module) => module.topics.map((topic) => ({ ...topic, module: module.name })));
  }
}
