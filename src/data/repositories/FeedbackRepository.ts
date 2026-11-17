import { LessonFeedback, type LessonFeedbackInput } from "@/domain/LessonFeedback";
import type { Lesson } from "@/domain/Lesson";
import type { FeedbackRecord } from "@/domain/records";
import { Repository } from "./Repository";

export class FeedbackRepository extends Repository<FeedbackRecord, LessonFeedback> {
  protected readonly table = "prep_feedback";
  protected toModel(record: FeedbackRecord): LessonFeedback { return LessonFeedback.fromRecord(record); }

  listForUser(userId: string): Promise<LessonFeedback[]> {
    return this.findMany({ where: { user_id: userId } });
  }

  async create(userId: string, lesson: Lesson, input: LessonFeedbackInput): Promise<void> {
    await this.database.insert(this.table, {
      user_id: userId, lesson_id: lesson.id, topic_kind: lesson.topicKind, format: lesson.format,
      rating: input.rating, difficulty: input.difficulty, wanted: input.wantedNextTime.join(", "),
      comment: input.comment, content_error: input.reportsContentError,
    });
  }
}
