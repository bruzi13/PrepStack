import { Topic, type TopicProgress } from "@/domain/Topic";
import type { StudyPlan } from "@/domain/StudyPlan";
import type { SuggestedTopic, TopicRecord } from "@/domain/records";
import { Repository } from "./Repository";

export const DEFAULT_TOPIC_PRIORITY = 2;
export const DEFAULT_TOPIC_MINUTES = 30;

export class TopicRepository extends Repository<TopicRecord, Topic> {
  protected readonly table = "prep_topics";
  protected toModel(record: TopicRecord): Topic { return Topic.fromRecord(record); }

  listForUser(userId: string): Promise<Topic[]> {
    return this.findMany({ where: { user_id: userId }, orderBy: "ord" });
  }

  listForPlan(planId: string): Promise<Topic[]> {
    return this.findMany({ where: { plan_id: planId }, orderBy: "ord" });
  }

  /** Append topics to the end of a plan, in the order given. */
  async addToPlan(plan: StudyPlan, suggestions: (SuggestedTopic & { module: string })[], firstOrder: number): Promise<Topic[]> {
    if (!suggestions.length) return [];
    const records = await this.database.insert<TopicRecord>(this.table, suggestions.map((suggestion, index) => ({
      user_id: plan.userId, plan_id: plan.id, track: plan.track, module: suggestion.module,
      title: suggestion.title, description: suggestion.description, kind: suggestion.kind, topic_key: suggestion.topic_key ?? null,
      ord: firstOrder + index, priority: suggestion.priority ?? DEFAULT_TOPIC_PRIORITY, est_minutes: suggestion.est_minutes ?? DEFAULT_TOPIC_MINUTES,
      status: "todo", mastery: 0, reviews: 0, interval_days: 0, next_review: null, last_score: null,
    })));
    return records.map((record) => this.toModel(record));
  }

  async saveProgress(topic: Topic, progress: TopicProgress): Promise<Topic> {
    await this.database.update(this.table, topic.id, {
      mastery: progress.mastery, last_score: progress.lastScore, reviews: progress.reviewCount,
      interval_days: progress.reviewIntervalDays, next_review: progress.nextReviewDate, status: progress.status,
    });
    return topic.withProgress(progress);
  }

  /** Remove a plan's topics the learner never studied (studied ones stay as history). */
  deleteUnstudied(planId: string): Promise<void> {
    return this.database.delete(this.table, { plan_id: planId, reviews: 0 });
  }
}
