// One thing the learner got wrong, kept in their notebook and brought back on a Leitner schedule:
// every correct answer moves it up a box (longer gap), a wrong answer sends it back to the first box.
import { Calendar } from "./Calendar";
import type { MistakeKind, MistakeRecord, MistakeSource } from "./records";

export interface MistakeProgress {
  box: number;
  dueOn: string;
  reviewCount: number;
  lastResult: boolean;
  resolved: boolean;
  lastReviewedAt: string;
}

export class Mistake {
  /** Days until the next practice, per box. Box 1 is where every new or missed item starts. */
  static readonly BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
  static readonly FIRST_BOX = 1;
  static readonly LAST_BOX = Mistake.BOX_INTERVAL_DAYS.length - 1;

  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly topicId: string | null,
    readonly topicTitle: string,
    readonly source: MistakeSource,
    readonly kind: MistakeKind,
    readonly prompt: string,
    readonly answer: string,
    readonly explanation: string,
    readonly options: string[],
    readonly correctOption: number | null,
    readonly box: number,
    readonly dueOn: string,
    readonly reviewCount: number,
    readonly lastResult: boolean | null,
    readonly resolved: boolean,
    readonly lastReviewedAt: string | null,
    readonly createdAt: string,
  ) {}

  static fromRecord(record: MistakeRecord): Mistake {
    return new Mistake(
      record.id, record.user_id, record.topic_id, record.topic_title ?? "", record.source, record.kind, record.prompt,
      record.answer ?? "", record.explanation ?? "", record.options ?? [], record.correct_option, record.box, record.due_on,
      record.reviews, record.last_result, record.resolved, record.last_reviewed_at, record.created_at,
    );
  }

  /** Two mistakes are the same if they are about the same topic and say the same thing, ignoring spacing and case. */
  static fingerprint(topicId: string | null, prompt: string): string {
    return `${topicId ?? "-"}|${prompt.trim().toLowerCase().replace(/\s+/g, " ")}`;
  }

  get fingerprint(): string { return Mistake.fingerprint(this.topicId, this.prompt); }
  get isChoice(): boolean { return this.kind === "choice" && this.options.length > 1 && this.correctOption != null; }

  isDue(today = Calendar.today()): boolean {
    return !this.resolved && this.dueOn <= today;
  }

  /** Where it goes after the learner answers it in practice. Answering right from the last box retires it. */
  progressAfterAnswer(correct: boolean, now = new Date()): MistakeProgress {
    const box = correct ? Math.min(this.box + 1, Mistake.LAST_BOX + 1) : Mistake.FIRST_BOX;
    const resolved = box > Mistake.LAST_BOX;
    const intervalDays = Mistake.BOX_INTERVAL_DAYS[Math.min(box, Mistake.LAST_BOX)];
    return {
      box: Math.min(box, Mistake.LAST_BOX),
      dueOn: Calendar.daysFromToday(Math.max(intervalDays, Mistake.BOX_INTERVAL_DAYS[Mistake.FIRST_BOX])),
      reviewCount: this.reviewCount + 1,
      lastResult: correct,
      resolved,
      lastReviewedAt: now.toISOString(),
    };
  }

  /** The same mistake made again: back to the first box, due tomorrow, and out of the "resolved" pile. */
  static repeatedProgress(previous: Mistake, now = new Date()): MistakeProgress {
    return {
      box: Mistake.FIRST_BOX,
      dueOn: Calendar.daysFromToday(Mistake.BOX_INTERVAL_DAYS[Mistake.FIRST_BOX]),
      reviewCount: previous.reviewCount,
      lastResult: false,
      resolved: false,
      lastReviewedAt: previous.lastReviewedAt ?? now.toISOString(),
    };
  }

  withProgress(progress: MistakeProgress): Mistake {
    return new Mistake(
      this.id, this.userId, this.topicId, this.topicTitle, this.source, this.kind, this.prompt, this.answer, this.explanation,
      this.options, this.correctOption, progress.box, progress.dueOn, progress.reviewCount, progress.lastResult, progress.resolved,
      progress.lastReviewedAt, this.createdAt,
    );
  }
}

/** A new notebook entry, before it has an id. */
export interface NewMistake {
  topicId: string | null;
  topicTitle: string;
  source: MistakeSource;
  kind: MistakeKind;
  prompt: string;
  answer: string;
  explanation: string;
  options?: string[];
  correctOption?: number | null;
}
