import { Mistake, type MistakeProgress, type NewMistake } from "@/domain/Mistake";
import type { MistakeRecord } from "@/domain/records";
import { Calendar } from "@/domain/Calendar";
import { Repository } from "./Repository";

/** The learner's mistakes notebook. Rows belong to the learner, who may also remove them. */
export class MistakeRepository extends Repository<MistakeRecord, Mistake> {
  protected readonly table = "prep_mistakes";
  protected toModel(record: MistakeRecord): Mistake { return Mistake.fromRecord(record); }

  listForUser(userId: string): Promise<Mistake[]> {
    return this.findMany({ where: { user_id: userId }, orderBy: "created_at", ascending: false });
  }

  async create(userId: string, entries: NewMistake[]): Promise<Mistake[]> {
    if (!entries.length) return [];
    const records = await this.database.insert<MistakeRecord>(this.table, entries.map((entry) => ({
      user_id: userId, topic_id: entry.topicId, topic_title: entry.topicTitle, source: entry.source, kind: entry.kind,
      prompt: entry.prompt, answer: entry.answer, explanation: entry.explanation, options: entry.options ?? null,
      correct_option: entry.correctOption ?? null, box: Mistake.FIRST_BOX,
      due_on: Calendar.daysFromToday(Mistake.BOX_INTERVAL_DAYS[Mistake.FIRST_BOX]), reviews: 0, last_result: false, resolved: false,
      last_reviewed_at: null,
    })));
    return records.map((record) => this.toModel(record));
  }

  async saveProgress(mistake: Mistake, progress: MistakeProgress): Promise<Mistake> {
    await this.database.update(this.table, mistake.id, {
      box: progress.box, due_on: progress.dueOn, reviews: progress.reviewCount, last_result: progress.lastResult,
      resolved: progress.resolved, last_reviewed_at: progress.lastReviewedAt,
    });
    return mistake.withProgress(progress);
  }

  async setResolved(mistake: Mistake, resolved: boolean): Promise<void> {
    await this.database.update(this.table, mistake.id, { resolved });
  }

  remove(mistakeId: string): Promise<void> {
    return this.database.delete(this.table, { id: mistakeId });
  }
}
