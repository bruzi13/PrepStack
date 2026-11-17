// How well a topic is known, as a label and a colour tone for the UI.
export type MasteryTone = "muted" | "good" | "ok" | "warn" | "bad";

export class MasteryLevel {
  private constructor(readonly label: string, readonly tone: MasteryTone) {}

  static readonly NOT_STUDIED = new MasteryLevel("לא נלמד", "muted");
  static readonly STRONG = new MasteryLevel("חזק", "good");
  static readonly INTERVIEW_READY = new MasteryLevel("מוכן לראיון", "ok");
  static readonly DEVELOPING = new MasteryLevel("מתפתח", "warn");
  static readonly NEEDS_WORK = new MasteryLevel("צריך חיזוק", "bad");

  static of(mastery: number, reviewCount: number): MasteryLevel {
    if (reviewCount === 0) return MasteryLevel.NOT_STUDIED;
    if (mastery >= 85) return MasteryLevel.STRONG;
    if (mastery >= 70) return MasteryLevel.INTERVIEW_READY;
    if (mastery >= 40) return MasteryLevel.DEVELOPING;
    return MasteryLevel.NEEDS_WORK;
  }
}
