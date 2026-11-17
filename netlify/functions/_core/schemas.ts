// Validation at the boundaries: what the browser may send, and what the model must return before it is stored.
import { z } from "zod";

const trimmedText = (maxLength: number) => z.string().trim().max(maxLength);
const uuid = z.string().uuid();

/** Arguments per job kind. The server loads everything else (topic, profile, lesson) itself. */
export const JobArgs = {
  // Onboarding runs the placement quiz before the profile is saved, so the in-progress answers come along.
  diagnostic: z.object({ answers: z.record(z.unknown()).refine((value) => JSON.stringify(value).length <= 8000, "answers too large").default({}) }).strict(),
  plan: z.object({ track: z.enum(["main", "ai"]), existing_titles: z.array(trimmedText(200)).max(300).optional() }).strict(),
  lesson: z.object({
    topicId: uuid,
    format: z.enum(["worked_examples", "visual_story", "scenario_sim", "drill_repetition", "deep_reference", "socratic"]),
    manual: z.boolean().default(false),
    choice: z.unknown().optional().refine((value) => JSON.stringify(value ?? null).length <= 4000, "choice too large"),
  }).strict(),
  complete: z.object({
    lessonId: uuid,
    kind: z.enum(["quiz", "code", "architecture", "practical"]),
    submission: z.record(z.unknown()).refine((value) => JSON.stringify(value).length <= 60_000, "submission too large"),
    minutes: z.number().min(0).max(600),
  }).strict(),
  debrief: z.object({ interviewId: uuid }).strict(),
  jd: z.object({ text: trimmedText(20_000).min(80) }).strict(),
  custom: z.object({ request: trimmedText(2000).min(2), existing_titles: z.array(trimmedText(200)).max(300) }).strict(),
} as const;
export type JobKind = keyof typeof JobArgs;

export const JobRequest = z.object({
  jobId: uuid,
  kind: z.enum(Object.keys(JobArgs) as [JobKind, ...JobKind[]]),
  args: z.record(z.unknown()).default({}),
});

/** Chat turn sent by the browser. */
export const ChatRequest = z.object({
  mode: z.enum(["interview", "pair", "tutor"]).default("interview"),
  type: trimmedText(40).optional(),
  config: z.record(z.unknown()).optional(),
  topic: z.object({ title: trimmedText(200) }).optional(),
  workspace: trimmedText(12_000).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: trimmedText(12_000) })).min(1).max(60),
});

/** Browser error report. */
export const ErrorReport = z.object({
  message: trimmedText(500), stack: trimmedText(2000).optional(), path: trimmedText(200).optional(), kind: z.enum(["error", "unhandledrejection", "react"]),
  requestId: trimmedText(64).optional(),
});

/* ---------- model output ---------- */
const LessonBlock = z.object({
  type: z.enum(["text", "example", "diagram", "check", "scenario", "flashcards"]),
  title: z.string(), md: z.string(), mermaid: z.string(), question: z.string(), options: z.array(z.string()), answer: z.number().int(), explain: z.string(),
  steps: z.array(z.unknown()), cards: z.array(z.object({ q: z.string(), a: z.string() })),
}).passthrough();

export const LessonBody = z.object({
  title: z.string().min(1), intro: z.string(), blocks: z.array(LessonBlock).min(2), takeaways: z.array(z.string()), interview_tips: z.array(z.string()),
}).passthrough();

export const LessonTest = z.object({ type: z.enum(["quiz", "code", "architecture", "practical"]) }).passthrough();

export const Review = z.object({
  score: z.number().min(0).max(100), verdict: z.string(), strengths: z.array(z.string()),
  issues: z.array(z.object({ severity: z.enum(["critical", "major", "minor"]), point: z.string(), fix: z.string() })),
  dimensions: z.array(z.object({ name: z.string(), score: z.number(), comment: z.string() })), model_answer: z.string(), next_steps: z.array(z.string()),
}).passthrough();

/** Parse or throw a readable error naming the first bad field (for logs; learners see a generic message). */
export function check<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  throw new Error(`${what} failed validation at ${first?.path.join(".") || "(root)"}: ${first?.message}`);
}
