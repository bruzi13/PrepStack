// Which lesson format should this learner get next?
// A contextual Thompson-sampling bandit: every format is an "arm", the reward is how the learner actually did on
// the test after a lesson in that format (blended with how they rated it), and the context is the kind of topic.
// Formats we know little about keep getting tried now and then; formats that keep producing good results get
// picked more and more.
import { FORMATS, KIND_LABEL, type FormatId, type TopicKind } from "@shared/catalog";
import type { Lesson } from "./Lesson";
import type { LessonFeedback } from "./LessonFeedback";
import type { FormatPrior } from "./records";

/** One finished lesson as the bandit sees it. */
export interface FormatObservation { format: FormatId; topicKind: TopicKind; score: number; rating: number | null }

export interface FormatArm {
  format: FormatId;
  lessonCount: number;
  /** Estimated reward, 0-1, adjusted for topic difficulty. */
  estimatedReward: number;
  /** A draw from the arm's posterior; the highest draw wins. */
  sampledReward: number;
  averageScore: number | null;
  averageRating: number | null;
}

export interface FormatChoice { format: FormatId; reason: string; arms: FormatArm[] }

export interface FormatSummary { format: FormatId; lessonCount: number; averageScore: number | null; averageRating: number | null }
export interface FormatInsights {
  rows: FormatSummary[];
  bestByScore: FormatSummary | null;
  bestByRating: FormatSummary | null;
  /** True when the format the learner likes most is not the one they score best after. */
  feelingDiffersFromResults: boolean;
}

const average = (values: number[]): number | null => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const standardNormal = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

export class FormatSelector {
  static readonly PRIOR_MEAN = 0.62;
  static readonly PRIOR_WEIGHT = 1.5;
  static readonly EXPLORATION_NOISE = 0.22;
  /** A lesson on a different kind of topic counts this much as evidence. */
  static readonly OTHER_KIND_WEIGHT = 0.4;
  /** The test result counts three times as much as the learner's rating. */
  static readonly SCORE_WEIGHT = 0.75;

  constructor(private readonly observations: FormatObservation[], private readonly priors: FormatPrior[] = []) {}

  static fromHistory(lessons: Lesson[], feedback: LessonFeedback[], priors: FormatPrior[] = []): FormatSelector {
    const ratingByLesson = new Map(feedback.map((entry) => [entry.lessonId, entry.rating]));
    const observations = lessons.filter((lesson) => lesson.hasScore).map((lesson) => ({
      format: lesson.format, topicKind: lesson.topicKind, score: lesson.score!, rating: ratingByLesson.get(lesson.id) ?? null,
    }));
    return new FormatSelector(observations, priors);
  }

  /** Feeling good about a lesson is not the same as learning from it, so the score dominates. */
  private reward(observation: FormatObservation): number {
    const scoreReward = observation.score / 100;
    if (observation.rating == null) return scoreReward;
    return FormatSelector.SCORE_WEIGHT * scoreReward + (1 - FormatSelector.SCORE_WEIGHT) * ((observation.rating - 1) / 4);
  }

  choose(topicKind: TopicKind, excludedFormats: FormatId[] = []): FormatChoice {
    // Some kinds of topic are simply harder. Remove that effect so a format isn't punished for being used on hard topics.
    const overallReward = average(this.observations.map((observation) => this.reward(observation))) ?? FormatSelector.PRIOR_MEAN;
    const kindReward = (kind: TopicKind) => {
      const rewards = this.observations.filter((observation) => observation.topicKind === kind).map((observation) => this.reward(observation));
      return rewards.length >= 2 ? average(rewards)! : overallReward;
    };

    const arms: FormatArm[] = FORMATS.map((format) => {
      const ownLessons = this.observations.filter((observation) => observation.format === format.id);
      const prior = this.priors.find((entry) => entry.format === format.id && entry.topic_kind === topicKind);
      const priorMean = prior ? Math.min(0.9, Math.max(0.3, prior.avg_score / 100)) : FormatSelector.PRIOR_MEAN;
      let totalWeight = FormatSelector.PRIOR_WEIGHT;
      let weightedSum = FormatSelector.PRIOR_WEIGHT * priorMean;
      for (const observation of ownLessons) {
        const weight = observation.topicKind === topicKind ? 1 : FormatSelector.OTHER_KIND_WEIGHT;
        totalWeight += weight;
        weightedSum += weight * (this.reward(observation) - kindReward(observation.topicKind) + overallReward);
      }
      const estimatedReward = weightedSum / totalWeight;
      return {
        format: format.id,
        lessonCount: ownLessons.length,
        estimatedReward,
        sampledReward: estimatedReward + standardNormal() * (FormatSelector.EXPLORATION_NOISE / Math.sqrt(totalWeight)),
        averageScore: average(ownLessons.map((observation) => observation.score)),
        averageRating: average(ownLessons.filter((observation) => observation.rating != null).map((observation) => observation.rating!)),
      };
    });

    const candidates = arms.filter((arm) => !excludedFormats.includes(arm.format));
    const picked = candidates.reduce((best, arm) => (arm.sampledReward > best.sampledReward ? arm : best));
    const bestKnown = candidates.reduce((best, arm) => (arm.estimatedReward > best.estimatedReward ? arm : best));
    return { format: picked.format, reason: this.explain(picked, bestKnown, topicKind), arms };
  }

  private explain(picked: FormatArm, bestKnown: FormatArm, topicKind: TopicKind): string {
    if (picked.lessonCount === 0) return "עוד לא ניסינו איתך את הפורמט הזה. כדי לדעת מה עובד לך הכי טוב צריך לנסות כמה סוגים.";
    if (picked.format !== bestKnown.format) return "יש לנו עדיין מעט מידע על הפורמט הזה אצלך, אז בודקים אותו שוב לפני שמסיקים מסקנות.";
    const sameKindSeen = this.observations.some((observation) => observation.topicKind === topicKind);
    return `עד עכשיו זה הפורמט שהביא לך את התוצאות הטובות ביותר${sameKindSeen ? ` בנושאי ${KIND_LABEL[topicKind]}` : ""}.`;
  }

  /** For the insights page: how each format has done, and whether feeling and results disagree. */
  insights(): FormatInsights {
    const rows: FormatSummary[] = FORMATS.map((format) => {
      const ownLessons = this.observations.filter((observation) => observation.format === format.id);
      return {
        format: format.id,
        lessonCount: ownLessons.length,
        averageScore: average(ownLessons.map((observation) => observation.score)),
        averageRating: average(ownLessons.filter((observation) => observation.rating != null).map((observation) => observation.rating!)),
      };
    });
    const triedEnough = rows.filter((row) => row.lessonCount >= 2 && row.averageScore != null);
    const bestByScore = triedEnough.length ? triedEnough.reduce((best, row) => (row.averageScore! > best.averageScore! ? row : best)) : null;
    const rated = triedEnough.filter((row) => row.averageRating != null);
    const bestByRating = rated.length ? rated.reduce((best, row) => (row.averageRating! > best.averageRating! ? row : best)) : null;
    return { rows, bestByScore, bestByRating, feelingDiffersFromResults: !!bestByScore && !!bestByRating && bestByScore.format !== bestByRating.format };
  }
}
