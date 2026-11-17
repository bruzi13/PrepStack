import { describe, expect, it, vi } from "vitest";
import { GradingService, quizPercent } from "../netlify/functions/_services/gradingService";
import { JobArgs, JobRequest } from "../netlify/functions/_core/schemas";
import { costUsd } from "../shared/pricing";
import { levelBand, pickTest, topicKey } from "../shared/lessonKeys";

const quizLesson = { id: "l1", topic_id: "t1", status: "ready", content: { test: { type: "quiz", quiz: [{ answer: 0 }, { answer: 2 }, { answer: 1 }, { answer: 3 }], open_question: "", open_rubric: "" } } };

function grading(lesson: Record<string, any> | null = quizLesson) {
  const store = { lesson: vi.fn(async () => lesson as any), topicTitle: vi.fn(async () => "Hash tables"), learner: vi.fn(async () => ({ display_name: "x", answers: {} })), saveResult: vi.fn(async () => undefined) };
  const grader = { grade: vi.fn(async () => ({ score: 80, verdict: "", strengths: [], issues: [], dimensions: [], model_answer: "", next_steps: [] })) };
  return { store, grader, svc: new GradingService(store, grader) };
}

describe("GradingService", () => {
  it("scores multiple choice from the stored answer key, ignoring any percentage the browser sends", async () => {
    const { svc, store } = grading();
    const r = await svc.complete("u1", { lessonId: "l1", kind: "quiz", submission: { answers: [0, 2, 0, 0], mcq_percent: 100 }, minutes: 12 });
    expect(r.score).toBe(50);
    expect(store.saveResult).toHaveBeenCalledWith("u1", quizLesson, expect.objectContaining({ score: 50, kind: "quiz" }));
  });

  it("uses the grader's score for code and reports the browser's test counts as text only", async () => {
    const code = { ...quizLesson, content: { test: { type: "code", code: { title: "t", statement: "s", reference_js: "r" } } } };
    const { svc } = grading(code);
    const r = await svc.complete("u1", { lessonId: "l1", kind: "code", submission: { code: "x", passed: 5, total: 5 }, minutes: 3 });
    expect(r.score).toBe(80);
    expect(r.extra).toBe("5/5 בדיקות עברו");
  });

  it("refuses a second submission and a wrong test kind", async () => {
    await expect(grading({ ...quizLesson, status: "done" }).svc.complete("u1", { lessonId: "l1", kind: "quiz", submission: {}, minutes: 1 })).rejects.toThrow("כבר הוגש");
    await expect(grading().svc.complete("u1", { lessonId: "l1", kind: "code", submission: {}, minutes: 1 })).rejects.toThrow("לא תואם");
  });

  it("quizPercent handles missing answers", () => {
    expect(quizPercent([{ answer: 1 }], undefined)).toBe(0);
    expect(quizPercent([], [1])).toBe(0);
  });
});

describe("request validation", () => {
  it("rejects unknown job kinds and extra fields such as a client-written profile", () => {
    expect(JobRequest.safeParse({ jobId: crypto.randomUUID(), kind: "steal", args: {} }).success).toBe(false);
    const extra = JobArgs.lesson.safeParse({ topicId: crypto.randomUUID(), format: "socratic", profile: { level: "staff" } });
    expect(extra.success).toBe(false);
  });
  it("accepts a well-formed lesson request", () => {
    expect(JobArgs.lesson.safeParse({ topicId: crypto.randomUUID(), format: "socratic" }).success).toBe(true);
  });
  it("caps job-description length", () => {
    expect(JobArgs.jd.safeParse({ text: "x".repeat(20_001) }).success).toBe(false);
  });
});

describe("shared helpers", () => {
  it("maps onboarding levels to three bands", () => {
    expect(["student", "junior", "mid", "senior", "staff", undefined].map(levelBand)).toEqual(["junior", "junior", "mid", "senior", "senior", "junior"]);
  });
  it("makes stable topic keys, Hebrew included", () => {
    expect(topicKey("Caching ו-CDN!")).toBe("caching-ו-cdn");
    expect(topicKey("  Caching   ו-CDN ")).toBe(topicKey("caching ו-cdn"));
  });
  it("prices a response from the token counts", () => {
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3, 6);
    expect(costUsd("unknown-model", { input_tokens: 5 })).toBe(0);
  });
  it("picks an unseen test, then grows the bank, then reuses the oldest", () => {
    expect(pickTest(["a", "b"], ["a"])).toEqual({ id: "b" });
    expect(pickTest(["a", "b"], ["a", "b"])).toEqual({ generate: true });
    expect(pickTest(["a", "b", "c", "d", "e", "f"], ["c", "a", "b", "d", "e", "f"])).toEqual({ id: "c" });
  });
});
