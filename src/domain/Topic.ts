// A topic in a learner's plan, with its spaced-repetition progress.
import { KIND_LABEL, TEST_FOR_KIND, TEST_LABEL, type TestType, type TopicKind } from "@shared/catalog";
import { Calendar } from "./Calendar";
import { MasteryLevel } from "./MasteryLevel";
import type { TopicRecord, TopicStatus, Track } from "./records";

/** The fields a test result changes. */
export interface TopicProgress {
  mastery: number;
  lastScore: number;
  reviewCount: number;
  reviewIntervalDays: number;
  nextReviewDate: string;
  status: TopicStatus;
}

export class Topic {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly planId: string,
    readonly track: Track,
    readonly moduleName: string,
    readonly title: string,
    readonly description: string,
    readonly kind: TopicKind,
    readonly catalogKey: string | null,
    readonly order: number,
    readonly priority: number,
    readonly estimatedMinutes: number,
    readonly status: TopicStatus,
    readonly mastery: number,
    readonly reviewCount: number,
    readonly reviewIntervalDays: number,
    readonly nextReviewDate: string | null,
    readonly lastScore: number | null,
  ) {}

  static fromRecord(record: TopicRecord): Topic {
    return new Topic(
      record.id, record.user_id, record.plan_id, record.track, record.module, record.title, record.description ?? "",
      record.kind, record.topic_key ?? null, record.ord, record.priority, record.est_minutes, record.status,
      record.mastery, record.reviews, record.interval_days, record.next_review, record.last_score,
    );
  }

  get isStudied(): boolean { return this.reviewCount > 0; }
  get isHighPriority(): boolean { return this.priority === 1; }
  get testType(): TestType { return TEST_FOR_KIND[this.kind]; }
  get kindLabel(): string { return KIND_LABEL[this.kind]; }
  get testLabel(): string { return TEST_LABEL[this.testType]; }
  get masteryLevel(): MasteryLevel { return MasteryLevel.of(this.mastery, this.reviewCount); }
  /** Priority 1 counts three times as much as priority 3 towards interview readiness. */
  get importanceWeight(): number { return 4 - this.priority; }
  get planPath(): string { return this.track === "ai" ? "/plan?track=ai" : "/plan"; }

  isDueForReview(today = Calendar.today()): boolean {
    return this.isStudied && !!this.nextReviewDate && this.nextReviewDate <= today;
  }

  withProgress(progress: TopicProgress): Topic {
    return new Topic(
      this.id, this.userId, this.planId, this.track, this.moduleName, this.title, this.description, this.kind, this.catalogKey,
      this.order, this.priority, this.estimatedMinutes, progress.status, progress.mastery, progress.reviewCount,
      progress.reviewIntervalDays, progress.nextReviewDate, progress.lastScore,
    );
  }
}
