// Data shapes exactly as they are stored: database rows (snake_case columns) and the JSON the AI engine
// returns. Screens never use these directly; repositories turn rows into the domain models next to this file.
import type { FormatId, TestType, TopicKind } from "@shared/catalog";

export type Track = "main" | "ai";
export type TopicStatus = "todo" | "learning" | "done";
export type LessonStatus = "ready" | "done";
export type InterviewStatus = "live" | "done";

/* ---------------- database rows ---------------- */

export interface OnboardingAnswers {
  occupation?: string; level?: string; role?: string; role_title?: string;
  years?: string; stack?: string; improve?: string[]; improve_note?: string;
  interview_date?: string; hours_per_week?: number; interview_lang?: string;
  new_stack?: string; target_level?: string; self?: Record<string, number>; diagnostic?: Record<string, number>; onboarded?: boolean;
}

export interface ProfileRecord {
  id: string; user_id: string; display_name: string; role_key: string | null;
  answers: OnboardingAnswers; created_at?: string; updated_at?: string;
}

export interface PlanDetails {
  summary?: string; market_notes?: string[]; sources?: SourceLink[]; map_refreshed_at?: string;
  trends?: MarketTrend[]; interview_format_notes?: string[]; excellence?: ExcellenceNote[];
}
export interface SourceLink { title: string; url: string }
export interface MarketTrend { title: string; what_changed: string; why_it_matters: string }
export interface ExcellenceNote { title: string; why: string }

export interface PlanRecord {
  id: string; user_id: string; track: Track; role_key: string | null; title: string;
  data: PlanDetails; active: boolean; created_at: string;
}

export interface TopicRecord {
  id: string; user_id: string; plan_id: string; track: Track; module: string; title: string;
  description: string; kind: TopicKind; topic_key?: string | null; ord: number; priority: number; est_minutes: number;
  status: TopicStatus; mastery: number; reviews: number; interval_days: number;
  next_review: string | null; last_score: number | null; created_at: string;
}

export interface PersonalNote { note: string; weak_points: string[] }

export interface LessonRecord {
  id: string; user_id: string; topic_id: string; topic_kind: TopicKind; format: FormatId;
  choice: unknown; content: LessonContent; status: LessonStatus; score: number | null;
  minutes: number | null; completed_at: string | null; created_at: string;
  template_id?: string | null; test_id?: string | null; personal?: PersonalNote | null;
}

export interface FeedbackRecord {
  id: string; user_id: string; lesson_id: string; topic_kind: string; format: FormatId;
  rating: number; difficulty: number | null; wanted: string; comment: string; content_error?: boolean; created_at: string;
}

export interface InterviewConfig {
  title?: string; level?: string; lang?: string; company?: string; short?: boolean; minutes?: number; role?: string; stack?: string;
}
export interface InterviewWorkspace { code?: string; lang?: "js" | "py"; canvas?: ArchitectureCanvas; text?: string | null }

export interface InterviewRecord {
  id: string; user_id: string; type: string; config: InterviewConfig; transcript: ChatMessage[];
  workspace: InterviewWorkspace | null; scorecard: Scorecard | null; score: number | null; status: InterviewStatus; created_at: string;
}

/** Where a notebook entry came from: a lesson test, the grader's review, a mock interview, or daily practice. */
export type MistakeSource = "test" | "review" | "interview" | "practice";
/** "choice": multiple choice with an answer key. "recall": the learner answers in their head and says if they knew it. */
export type MistakeKind = "choice" | "recall";

export interface MistakeRecord {
  id: string; user_id: string; topic_id: string | null; topic_title: string; source: MistakeSource; kind: MistakeKind;
  prompt: string; answer: string; explanation: string; options: string[] | null; correct_option: number | null;
  box: number; due_on: string; reviews: number; last_result: boolean | null; resolved: boolean;
  last_reviewed_at: string | null; created_at: string;
}

/** Anonymous cross-learner averages from the prep_format_priors database function. */
export interface FormatPrior { format: string; topic_kind: string; n: number; avg_score: number }

/* ---------------- AI engine JSON ---------------- */

export interface LessonBlock {
  type: "text" | "example" | "diagram" | "check" | "scenario" | "flashcards";
  title: string; md: string; mermaid: string; question: string; options: string[]; answer: number; explain: string;
  steps: ScenarioStep[];
  cards: { q: string; a: string }[];
}
export interface ScenarioStep { situation: string; choices: { label: string; outcome: string; good: boolean }[] }
export interface QuizQuestion { question: string; options: string[]; answer: number; explain: string }
export interface CodeTestCase { args_json: string; expected_json: string }
export interface CodeTest {
  title: string; statement: string; fn_name: string; starter_js: string; starter_py: string; reference_js: string;
  tests: CodeTestCase[]; hints: string[];
}
export interface ArchitectureTest { prompt: string; requirements: string[]; constraints: string[]; rubric: { dimension: string; look_for: string }[] }
export interface PracticalTest { task: string; deliverable: string; rubric: string[] }
export interface LessonTest {
  type: TestType; quiz: QuizQuestion[]; open_question: string; open_rubric: string; code: CodeTest;
  architecture: ArchitectureTest; practical: PracticalTest;
}
export interface LessonContent {
  title: string; intro: string; blocks: LessonBlock[]; takeaways: string[]; interview_tips: string[]; test: LessonTest;
}

export interface GradingReview {
  score: number; verdict: string; strengths: string[];
  issues: { severity: "critical" | "major" | "minor"; point: string; fix: string }[];
  dimensions: { name: string; score: number; comment: string }[]; model_answer: string; next_steps: string[];
}
export interface TestOutcome { score: number; review: GradingReview | null; extra?: string }

export interface ChatMessage { role: "user" | "assistant"; content: string; tool?: boolean }

export interface Scorecard {
  score: number; hire_signal: string; summary: string;
  dimensions: { name: string; score: number; comment: string }[]; strengths: string[]; improvements: string[];
  moments: { quote: string; feedback: string; better: string }[];
  drills: SuggestedTopic[];
}

export interface ArchitectureCanvas {
  nodes: { id: string; kind: string; label: string }[];
  edges: { from: string; to: string; label: string }[];
  notes: string;
}

/** A topic the AI suggests adding to a plan. */
export interface SuggestedTopic { title: string; description: string; kind: TopicKind; priority?: number; est_minutes?: number; topic_key?: string; module?: string }

export interface PlanDraft {
  title: string; summary: string; market_notes: string[]; role_key: string;
  modules: { name: string; why: string; topics: SuggestedTopic[] }[];
  sources: SourceLink[]; map_refreshed_at?: string; trends?: MarketTrend[]; interview_format_notes?: string[]; excellence?: ExcellenceNote[];
}

export interface CustomTopicsDraft { note: string; module: string; topics: SuggestedTopic[] }

export interface PlacementQuestion { id: string; area: string; level: number; question: string; options: string[]; answer: number; explain: string }
export interface PlacementQuiz { areas: string[]; questions: PlacementQuestion[] }

export interface JobAnalysis {
  role_title: string; company_type: string; fit_summary: string; match_percent: number; must_have: string[]; nice_to_have: string[];
  gaps: { skill: string; why: string; priority: number }[];
  suggested_topics: SuggestedTopic[];
  likely_rounds: string[]; questions_to_expect: string[];
}
