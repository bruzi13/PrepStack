// What a learner said about a lesson after finishing it.
import type { FormatId } from "@shared/catalog";
import type { FeedbackRecord } from "./records";

export class LessonFeedback {
  private constructor(
    readonly lessonId: string,
    readonly format: FormatId,
    readonly rating: number,
    readonly difficulty: number | null,
  ) {}

  static fromRecord(record: FeedbackRecord): LessonFeedback {
    return new LessonFeedback(record.lesson_id, record.format, record.rating, record.difficulty);
  }
}

/** A new feedback entry, as the feedback form collects it. */
export interface LessonFeedbackInput {
  rating: number;
  difficulty: number | null;
  wantedNextTime: string[];
  comment: string;
  reportsContentError: boolean;
}
