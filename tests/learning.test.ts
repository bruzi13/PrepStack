import { describe, expect, it } from "vitest";
import { afterTest, levelOf } from "@/learning/srs";
import { chooseFormat } from "@/learning/adapt";
import type { Topic } from "@/types";

const topic = (over: Partial<Topic> = {}): Topic => ({
  id: "t", user_id: "u", plan_id: "p", track: "main", module: "m", title: "x", description: "", kind: "concept", ord: 0, priority: 1,
  est_minutes: 30, status: "todo", mastery: 0, reviews: 0, interval_days: 0, next_review: null, last_score: null, created_at: "", ...over,
});

describe("spaced repetition", () => {
  it("a first strong test sets mastery and a long interval", () => {
    const p = afterTest(topic(), 90);
    expect(p.mastery).toBe(90);
    expect(p.interval_days).toBeGreaterThanOrEqual(4);
    expect(p.status).toBe("done");
  });
  it("a weak test brings the topic back tomorrow", () => {
    expect(afterTest(topic({ reviews: 2, mastery: 80, interval_days: 10 }), 40).interval_days).toBe(1);
  });
  it("intervals never exceed 60 days", () => {
    expect(afterTest(topic({ reviews: 5, mastery: 95, interval_days: 50 }), 100).interval_days).toBe(60);
  });
  it("an unstudied topic reads as not learned", () => {
    expect(levelOf(0, 0).label).toBe("לא נלמד");
  });
});

describe("format choice", () => {
  it("always returns a known format and a reason", () => {
    const c = chooseFormat([], "concept");
    expect(c.format).toBeTruthy();
    expect(c.reason.length).toBeGreaterThan(0);
  });
  it("respects excluded formats", () => {
    for (let i = 0; i < 20; i++) expect(chooseFormat([], "coding", [], ["socratic"]).format).not.toBe("socratic");
  });
});
