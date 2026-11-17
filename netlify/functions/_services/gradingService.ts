// Finishing a lesson's test. The server computes and saves the score, so a learner cannot write their own
// (and the cross-learner format statistics are built only from these rows).
import { UserError } from "../_core/errors";
import type { Json, Learner } from "./ports";
import { learnerBrief } from "./lessonService";

export interface GradingStore {
  lesson(userId: string, lessonId: string): Promise<{ id: string; topic_id: string; status: string; content: Json } | null>;
  topicTitle(topicId: string): Promise<string>;
  learner(userId: string): Promise<Learner>;
  saveResult(userId: string, lesson: { id: string; topic_id: string }, r: { kind: string; submission: Json; score: number; review: Json | null; minutes: number }): Promise<void>;
}
export interface Grader { grade(input: Json): Promise<Json> }

export interface CompleteArgs { lessonId: string; kind: "quiz" | "code" | "architecture" | "practical"; submission: Json; minutes: number }
export interface CompleteResult { score: number; review: Json | null; extra?: string }

/** The part of the test the grader needs, per kind (same as the browser sent before). */
export function testFor(test: Json, kind: string): Json {
  if (kind === "quiz") return { open_question: test.open_question, open_rubric: test.open_rubric };
  if (kind === "code") return { title: test.code?.title, statement: test.code?.statement, reference_js: test.code?.reference_js };
  return kind === "architecture" ? test.architecture : test.practical;
}

/** Multiple-choice percentage against the stored answer key, never a number the browser sent. */
export function quizPercent(quiz: { answer: number }[], answers: unknown): number {
  const a = Array.isArray(answers) ? answers : [];
  if (!quiz.length) return 0;
  return (quiz.filter((q, i) => a[i] === q.answer).length / quiz.length) * 100;
}

export class GradingService {
  constructor(private store: GradingStore, private grader: Grader) {}

  async complete(userId: string, args: CompleteArgs): Promise<CompleteResult> {
    const lesson = await this.store.lesson(userId, args.lessonId);
    if (!lesson) throw new UserError("השיעור לא נמצא.", 404);
    if (lesson.status !== "ready") throw new UserError("המבחן של השיעור הזה כבר הוגש.", 409);
    const test = (lesson.content?.test ?? {}) as Json;
    if (test.type && test.type !== args.kind) throw new UserError("סוג המבחן לא תואם לשיעור.", 400);

    const grade = async () => this.grader.grade({
      kind: args.kind, topic: { title: await this.store.topicTitle(lesson.topic_id) }, profile: learnerBrief(await this.store.learner(userId)),
      test: testFor(test, args.kind), submission: args.submission,
    });

    let score: number, review: Json | null = null, extra: string | undefined;
    if (args.kind === "quiz") {
      const mcq = quizPercent(test.quiz ?? [], args.submission.answers);
      const open = typeof args.submission.open === "string" ? args.submission.open.trim() : "";
      if (test.open_question && open) {
        review = await grade();
        score = 0.7 * mcq + 0.3 * Number(review.score);
        extra = `שאלות אמריקאיות: ${Math.round(mcq)} · שאלה פתוחה: ${review.score}`;
      } else {
        score = test.open_question ? 0.7 * mcq : mcq;
        if (test.open_question) extra = "לא ענית על השאלה הפתוחה (30% מהציון).";
      }
    } else {
      review = await grade();
      score = Number(review.score);
      if (args.kind === "code") extra = `${Number(args.submission.passed) || 0}/${Number(args.submission.total) || 0} בדיקות עברו`;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    await this.store.saveResult(userId, lesson, { kind: args.kind, submission: args.submission, score, review, minutes: args.minutes });
    return { score, review, extra };
  }
}
