// A lesson a learner received for a topic: its content, test, and (once finished) the result.
import { formatById, type FormatId, type TopicKind } from "@shared/catalog";
import type { LessonContent, LessonRecord, LessonStatus, LessonTest, PersonalNote } from "./records";

export class Lesson {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly topicId: string,
    readonly topicKind: TopicKind,
    readonly format: FormatId,
    readonly content: LessonContent,
    readonly status: LessonStatus,
    readonly score: number | null,
    readonly minutesSpent: number | null,
    readonly completedAt: string | null,
    readonly createdAt: string,
    readonly personalNote: PersonalNote | null,
  ) {}

  static fromRecord(record: LessonRecord): Lesson {
    return new Lesson(
      record.id, record.user_id, record.topic_id, record.topic_kind ?? "concept", record.format, record.content, record.status,
      record.score, record.minutes, record.completed_at, record.created_at, record.personal ?? null,
    );
  }

  get isCompleted(): boolean { return this.status === "done" && this.completedAt != null; }
  get hasScore(): boolean { return this.status === "done" && this.score != null; }
  get formatName(): string { return formatById(this.format).name; }
  get test(): LessonTest { return this.content.test; }
  get title(): string { return this.content.title; }

  completedSince(isoTimestamp: string): boolean {
    return this.isCompleted && this.completedAt! >= isoTimestamp;
  }
}

/** Finished lessons, for weekly and all-time summaries. */
export class LessonHistory {
  constructor(readonly lessons: readonly Lesson[]) {}

  completed(): Lesson[] { return this.lessons.filter((lesson) => lesson.isCompleted); }
  completedSince(isoTimestamp: string): Lesson[] { return this.lessons.filter((lesson) => lesson.completedSince(isoTimestamp)); }

  static averageScore(lessons: Lesson[]): number | null {
    return lessons.length ? Math.round(lessons.reduce((sum, lesson) => sum + (lesson.score ?? 0), 0) / lessons.length) : null;
  }

  static totalMinutes(lessons: Lesson[]): number {
    return Math.round(lessons.reduce((sum, lesson) => sum + (lesson.minutesSpent ?? 0), 0));
  }
}
