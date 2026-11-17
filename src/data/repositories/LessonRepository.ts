import { Lesson } from "@/domain/Lesson";
import type { FormatPrior, LessonRecord } from "@/domain/records";
import { Repository } from "./Repository";

/** Lessons and attempts are written by the server; the browser reads them and may delete an unfinished lesson. */
export class LessonRepository extends Repository<LessonRecord, Lesson> {
  protected readonly table = "prep_lessons";
  protected toModel(record: LessonRecord): Lesson { return Lesson.fromRecord(record); }

  listForUser(userId: string, newestFirst = false): Promise<Lesson[]> {
    return this.findMany({ where: { user_id: userId }, orderBy: "created_at", ascending: !newestFirst });
  }

  /** The newest lesson for a topic that was started but whose test was not submitted yet. */
  async findUnfinished(topicId: string): Promise<Lesson | null> {
    const [lesson] = await this.findMany({ where: { topic_id: topicId, status: "ready" }, orderBy: "created_at", ascending: false, limit: 1 });
    return lesson ?? null;
  }

  deleteUnfinished(lessonId: string): Promise<void> {
    return this.database.delete(this.table, { id: lessonId });
  }

  /** Anonymous averages across all learners, per format and kind of topic. */
  formatPriors(): Promise<FormatPrior[]> {
    return this.database.callFunction<FormatPrior[]>("prep_format_priors", []);
  }
}
