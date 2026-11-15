// Which lesson format should this learner get next?
// A contextual Thompson-sampling bandit: every format is an "arm", the reward is how the learner
// actually did on the test after a lesson in that format (blended with what they said about it),
// and the context is the kind of topic. Formats we know little about keep getting tried now and then;
// formats that keep producing good results get picked more and more.
import { FORMATS, KIND_LABEL, type FormatId, type TopicKind } from "@shared/catalog";
import type { Feedback, Lesson } from "@/types";
import type { Prior } from "@/services/ai";

export interface Obs { format: FormatId; kind: TopicKind; score: number; rating: number | null }
export interface ArmRow { format: FormatId; n: number; mean: number; sampled: number; avgScore: number | null; avgRating: number | null }
export interface Choice { format: FormatId; reason: string; table: ArmRow[] }

const PRIOR_MEAN = 0.62, PRIOR_WEIGHT = 1.5, NOISE = 0.22, OTHER_KIND_WEIGHT = 0.4;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

export function observations(lessons: Lesson[], feedback: Feedback[]): Obs[] {
  return lessons.filter((l) => l.status === "done" && l.score != null).map((l) => ({
    format: l.format, kind: l.topic_kind ?? "concept", score: l.score!,
    rating: feedback.find((f) => f.lesson_id === l.id)?.rating ?? null,
  }));
}

/** Test result counts three times as much as the learner's own rating: feeling good about a lesson is not the same as learning from it. */
const reward = (o: Obs) => (o.rating == null ? o.score / 100 : 0.75 * (o.score / 100) + 0.25 * ((o.rating - 1) / 4));

export function chooseFormat(obs: Obs[], kind: TopicKind, priors: Prior[] = [], exclude: FormatId[] = []): Choice {
  // Some kinds of topic are simply harder. Remove that effect so a format isn't punished for being used on hard topics.
  const overall = avg(obs.map(reward)) ?? PRIOR_MEAN;
  const kindMean = (k: TopicKind) => { const xs = obs.filter((o) => o.kind === k).map(reward); return xs.length >= 2 ? avg(xs)! : overall; };

  const table: ArmRow[] = FORMATS.map((f) => {
    const mine = obs.filter((o) => o.format === f.id);
    const p = priors.find((x) => x.format === f.id && x.topic_kind === kind);
    const m0 = p ? Math.min(0.9, Math.max(0.3, p.avg_score / 100)) : PRIOR_MEAN;
    let w = PRIOR_WEIGHT, sum = PRIOR_WEIGHT * m0;
    for (const o of mine) {
      const wi = o.kind === kind ? 1 : OTHER_KIND_WEIGHT;
      w += wi; sum += wi * (reward(o) - kindMean(o.kind) + overall);
    }
    const mean = sum / w;
    return {
      format: f.id, n: mine.length, mean,
      sampled: mean + gauss() * (NOISE / Math.sqrt(w)),
      avgScore: avg(mine.map((o) => o.score)),
      avgRating: avg(mine.filter((o) => o.rating != null).map((o) => o.rating!)),
    };
  });

  const pool = table.filter((r) => !exclude.includes(r.format));
  const pick = pool.reduce((a, b) => (b.sampled > a.sampled ? b : a));
  const best = pool.reduce((a, b) => (b.mean > a.mean ? b : a));
  const reason = pick.n === 0
    ? "עוד לא ניסינו איתך את הפורמט הזה. כדי לדעת מה עובד לך הכי טוב צריך לנסות כמה סוגים."
    : pick.format === best.format
      ? `עד עכשיו זה הפורמט שהביא לך את התוצאות הטובות ביותר${obs.some((o) => o.kind === kind) ? ` בנושאי ${KIND_LABEL[kind]}` : ""}.`
      : "יש לנו עדיין מעט מידע על הפורמט הזה אצלך, אז בודקים אותו שוב לפני שמסיקים מסקנות.";
  return { format: pick.format, reason, table };
}

/** For the insights page: how each format has done for this learner, and where feeling and results disagree. */
export function formatInsights(obs: Obs[]) {
  const rows = FORMATS.map((f) => {
    const mine = obs.filter((o) => o.format === f.id);
    return { format: f.id, n: mine.length, avgScore: avg(mine.map((o) => o.score)), avgRating: avg(mine.filter((o) => o.rating != null).map((o) => o.rating!)) };
  });
  const tried = rows.filter((r) => r.n >= 2 && r.avgScore != null);
  const bestByScore = tried.length ? tried.reduce((a, b) => (b.avgScore! > a.avgScore! ? b : a)) : null;
  const rated = tried.filter((r) => r.avgRating != null);
  const bestByRating = rated.length ? rated.reduce((a, b) => (b.avgRating! > a.avgRating! ? b : a)) : null;
  return { rows, bestByScore, bestByRating, mismatch: !!bestByScore && !!bestByRating && bestByScore.format !== bestByRating.format };
}
