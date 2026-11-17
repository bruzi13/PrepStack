// Spaced repetition: after every test, how well the topic is known and when to practise it again.
import { Calendar } from "./Calendar";
import type { Topic, TopicProgress } from "./Topic";

export class SpacedRepetitionScheduler {
  static readonly MAX_INTERVAL_DAYS = 60;
  /** How much the previous mastery counts against the new score once a topic has been tested before. */
  static readonly MEMORY_WEIGHT = 0.55;
  static readonly MASTERED_AT = 70;

  progressAfterTest(topic: Topic, score: number): TopicProgress {
    const mastery = topic.isStudied
      ? Math.round(SpacedRepetitionScheduler.MEMORY_WEIGHT * topic.mastery + (1 - SpacedRepetitionScheduler.MEMORY_WEIGHT) * score)
      : score;
    const intervalDays = Math.min(this.nextInterval(topic.reviewIntervalDays || 0, score), SpacedRepetitionScheduler.MAX_INTERVAL_DAYS);
    return {
      mastery,
      lastScore: score,
      reviewCount: topic.reviewCount + 1,
      reviewIntervalDays: intervalDays,
      nextReviewDate: Calendar.daysFromToday(intervalDays),
      status: mastery >= SpacedRepetitionScheduler.MASTERED_AT ? "done" : "learning",
    };
  }

  /** A strong result stretches the gap, a passing one grows it a little, a weak one brings the topic back tomorrow. */
  private nextInterval(previousDays: number, score: number): number {
    if (score >= 85) return Math.max(4, previousDays * 2.5);
    if (score >= 70) return Math.max(2, previousDays * 1.6);
    return 1;
  }
}
