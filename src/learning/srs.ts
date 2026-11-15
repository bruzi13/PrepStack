// Spaced repetition: after every test we update how well the topic is known and when to practise it again.
import type { Topic } from "@/types";

/** A calendar date in the learner's own time zone (toISOString would give the UTC date, which is a day off around midnight). */
export const localDate = (d: Date | string = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + Math.round(n)); return localDate(d); };

export function afterTest(t: Topic, score: number): Partial<Topic> {
  const mastery = t.reviews === 0 ? score : Math.round(0.55 * t.mastery + 0.45 * score);
  const prev = t.interval_days || 0;
  const interval = score >= 85 ? Math.max(4, prev * 2.5) : score >= 70 ? Math.max(2, prev * 1.6) : 1;
  return {
    mastery, last_score: score, reviews: t.reviews + 1, interval_days: Math.min(interval, 60),
    next_review: addDays(Math.min(interval, 60)), status: mastery >= 70 ? "done" : "learning",
  };
}

export const isDue = (t: Topic) => !!t.next_review && t.reviews > 0 && t.next_review <= localDate();

export function levelOf(mastery: number, reviews: number): { label: string; tone: string } {
  if (!reviews) return { label: "לא נלמד", tone: "muted" };
  if (mastery >= 85) return { label: "חזק", tone: "good" };
  if (mastery >= 70) return { label: "מוכן לראיון", tone: "ok" };
  if (mastery >= 40) return { label: "מתפתח", tone: "warn" };
  return { label: "צריך חיזוק", tone: "bad" };
}

/** Start of the current week (Sunday), as an ISO timestamp. */
export function weekStart(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
  return d.toISOString();
}

/** Consecutive days (ending today or yesterday) with at least one finished lesson or interview. */
export function streak(dates: string[]): number {
  const days = new Set(dates.map((d) => localDate(d)));
  const d = new Date(); let n = 0;
  if (!days.has(localDate(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
