import { describe, expect, it } from "vitest";
import { Calendar } from "@/domain/Calendar";
import { DailyPractice } from "@/domain/DailyPractice";
import { Lesson } from "@/domain/Lesson";
import { Mistake } from "@/domain/Mistake";
import type { LessonBlock, LessonRecord, MistakeRecord } from "@/domain/records";

function mistakeRecord(overrides: Partial<MistakeRecord> = {}): MistakeRecord {
  return {
    id: "m1", user_id: "u", topic_id: "t1", topic_title: "Caching", source: "test", kind: "recall", prompt: "What is a cache stampede?",
    answer: "Many requests rebuild the same key at once", explanation: "", options: null, correct_option: null, box: 1,
    due_on: Calendar.today(), reviews: 0, last_result: false, resolved: false, last_reviewed_at: null, created_at: "", ...overrides,
  };
}
const mistake = (overrides: Partial<MistakeRecord> = {}) => Mistake.fromRecord(mistakeRecord(overrides));

const block = (overrides: Partial<LessonBlock>): LessonBlock => ({
  type: "text", title: "", md: "", mermaid: "", question: "", options: [], answer: 0, explain: "", steps: [], cards: [], ...overrides,
});
function lesson(id: string, topicId: string, blocks: LessonBlock[], status: "ready" | "done" = "done"): Lesson {
  return Lesson.fromRecord({
    id, user_id: "u", topic_id: topicId, topic_kind: "concept", format: "worked_examples", choice: null, status, score: 80, minutes: 20,
    completed_at: status === "done" ? "2026-11-10T10:00:00Z" : null, created_at: "",
    content: { title: `Lesson ${id}`, intro: "", blocks, takeaways: [], interview_tips: [], test: {} as LessonRecord["content"]["test"] },
  } as LessonRecord);
}
const fixedRandom = () => 0.42;

describe("Mistake", () => {
  it("climbs a box on a right answer and waits longer", () => {
    const progress = mistake({ box: 2 }).progressAfterAnswer(true);
    expect(progress.box).toBe(3);
    expect(progress.dueOn).toBe(Calendar.daysFromToday(Mistake.BOX_INTERVAL_DAYS[3]));
    expect(progress.resolved).toBe(false);
  });

  it("goes back to the first box, due tomorrow, on a wrong answer", () => {
    const progress = mistake({ box: 4 }).progressAfterAnswer(false);
    expect(progress.box).toBe(Mistake.FIRST_BOX);
    expect(progress.dueOn).toBe(Calendar.daysFromToday(1));
    expect(progress.lastResult).toBe(false);
  });

  it("is retired after a right answer from the last box", () => {
    const progress = mistake({ box: Mistake.LAST_BOX }).progressAfterAnswer(true);
    expect(progress.resolved).toBe(true);
    expect(progress.box).toBe(Mistake.LAST_BOX);
  });

  it("is due only when not resolved and its day has come", () => {
    expect(mistake({ due_on: Calendar.today() }).isDue()).toBe(true);
    expect(mistake({ due_on: Calendar.daysFromToday(2) }).isDue()).toBe(false);
    expect(mistake({ resolved: true }).isDue()).toBe(false);
  });

  it("treats the same prompt with different spacing or case as the same mistake", () => {
    expect(Mistake.fingerprint("t1", "  What IS  a cache? ")).toBe(Mistake.fingerprint("t1", "what is a cache?"));
    expect(Mistake.fingerprint("t1", "x")).not.toBe(Mistake.fingerprint("t2", "x"));
  });
});

describe("DailyPractice", () => {
  const cards = (count: number) => block({ type: "flashcards", cards: Array.from({ length: count }, (_, index) => ({ q: `Q${index}`, a: `A${index}` })) });

  it("puts due mistakes in the session and leaves out ones that are not due", () => {
    const session = DailyPractice.build([mistake({ id: "due" }), mistake({ id: "later", prompt: "later", due_on: Calendar.daysFromToday(3) })], [], Calendar.today(), fixedRandom);
    expect(session.items.map((item) => item.mistakeId)).toEqual(["due"]);
  });

  it("tops up with cards from finished lessons only, up to the session size", () => {
    const session = DailyPractice.build([], [lesson("a", "t1", [cards(6)]), lesson("b", "t2", [cards(6)]), lesson("c", "t3", [cards(6)], "ready")], Calendar.today(), fixedRandom);
    expect(session.items).toHaveLength(DailyPractice.SESSION_SIZE);
    expect(session.items.every((item) => item.topicId !== "t3")).toBe(true);
  });

  it("mixes topics instead of giving one topic's cards in a row", () => {
    const session = DailyPractice.build([], [lesson("a", "t1", [cards(4)]), lesson("b", "t2", [cards(4)])], Calendar.today(), fixedRandom);
    const topics = session.items.map((item) => item.topicId);
    expect(topics.some((topic, index) => index > 0 && topic === topics[index - 1])).toBe(false);
  });

  it("turns in-lesson check questions into multiple-choice items", () => {
    const check = block({ type: "check", question: "O(1)?", options: ["yes", "no"], answer: 0, explain: "hash map" });
    const [item] = DailyPractice.build([], [lesson("a", "t1", [check])], Calendar.today(), fixedRandom).items;
    expect(item).toMatchObject({ kind: "choice", correctOption: 0, answer: "yes", origin: "lesson" });
  });

  it("does not repeat a lesson card that is already in the notebook", () => {
    const notebook = [mistake({ prompt: "Q0", topic_id: "t1", due_on: Calendar.daysFromToday(5) })];
    const session = DailyPractice.build(notebook, [lesson("a", "t1", [cards(1)])], Calendar.today(), fixedRandom);
    expect(session.isEmpty).toBe(true);
  });
});
