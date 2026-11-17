// The AI engine as the browser sees it. Long work (plans, lessons, grading) runs as background jobs on the
// server; chat turns stream. Each job kind has a typed contract: what the browser sends and what comes back.
// The browser sends ids and choices only; the server loads everything else itself.
import type { FormatId } from "@shared/catalog";
import type {
  CustomTopicsDraft, JobAnalysis, LessonRecord, OnboardingAnswers, PlacementQuiz, PlanDraft, Scorecard, TestOutcome, Track,
} from "@/domain/records";

export type TestKind = "quiz" | "code" | "architecture" | "practical";

/** Why the format was chosen, stored with the lesson (the bandit's numbers, rounded). */
export interface FormatChoiceRecord {
  reason: string;
  manual: boolean;
  table: { format: string; n: number; mean: number; sampled: number }[];
}

export interface JobContracts {
  diagnostic: { args: { answers: OnboardingAnswers }; result: PlacementQuiz };
  plan: { args: { track: Track; existing_titles?: string[] }; result: PlanDraft };
  lesson: { args: { topicId: string; format: FormatId; manual: boolean; choice: FormatChoiceRecord }; result: { lesson: LessonRecord; source: string } };
  complete: { args: { lessonId: string; kind: TestKind; submission: Record<string, unknown>; minutes: number }; result: TestOutcome };
  debrief: { args: { interviewId: string }; result: Scorecard };
  jd: { args: { text: string }; result: JobAnalysis };
  custom: { args: { request: string; existing_titles: string[] }; result: CustomTopicsDraft };
}
export type JobKind = keyof JobContracts;
export type JobArgs<K extends JobKind> = JobContracts[K]["args"];
export type JobResult<K extends JobKind> = JobContracts[K]["result"];

export type ChatMode = "interview" | "pair" | "tutor";
export interface ChatRequest {
  mode: ChatMode;
  messages: { role: "user" | "assistant"; content: string }[];
  type?: string;
  config?: Record<string, unknown>;
  topic?: { title: string };
  workspace?: string;
}

export interface AiEngine {
  runJob<K extends JobKind>(kind: K, args: JobArgs<K>): Promise<JobResult<K>>;
  /** One streamed chat turn. `onText` gets the whole text so far; resolves with the final text. */
  chat(request: ChatRequest, onText: (textSoFar: string) => void): Promise<string>;
}

/** A request id per call, sent as x-request-id: the server logs it on every line, usage row and error. */
export const newRequestId = (): string => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** First 8 characters of a request id: short enough for a learner to quote to support. */
export const supportCode = (requestId: string): string => requestId.slice(0, 8);
