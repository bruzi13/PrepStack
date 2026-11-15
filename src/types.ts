import type { FormatId, TestType, TopicKind } from "@shared/catalog";

export interface Profile {
  id: string; user_id: string; display_name: string; role_key: string | null;
  answers: Answers; created_at?: string;
}
export interface Answers {
  occupation?: string; level?: string; role?: string; role_title?: string;
  years?: string; stack?: string; improve?: string[]; improve_note?: string;
  interview_date?: string; hours_per_week?: number; interview_lang?: string;
  new_stack?: string; self?: Record<string, number>; diagnostic?: Record<string, number>; onboarded?: boolean;
}
export interface Plan {
  id: string; user_id: string; track: "main" | "ai"; role_key: string | null; title: string;
  data: { summary?: string; market_notes?: string[]; sources?: { title: string; url: string }[];
    map_refreshed_at?: string; trends?: { title: string; what_changed: string; why_it_matters: string }[];
    interview_format_notes?: string[] };
  active: boolean; created_at: string;
}
export interface Topic {
  id: string; user_id: string; plan_id: string; track: "main" | "ai"; module: string; title: string;
  description: string; kind: TopicKind; ord: number; priority: number; est_minutes: number;
  status: "todo" | "learning" | "done"; mastery: number; reviews: number; interval_days: number;
  next_review: string | null; last_score: number | null; created_at: string;
}
export interface Block {
  type: "text" | "example" | "diagram" | "check" | "scenario" | "flashcards";
  title: string; md: string; mermaid: string; question: string; options: string[]; answer: number; explain: string;
  steps: { situation: string; choices: { label: string; outcome: string; good: boolean }[] }[];
  cards: { q: string; a: string }[];
}
export interface QuizQ { question: string; options: string[]; answer: number; explain: string }
export interface CodeTest {
  title: string; statement: string; fn_name: string; starter_js: string; starter_py: string; reference_js: string;
  tests: { args_json: string; expected_json: string }[]; hints: string[];
}
export interface LessonTest {
  type: TestType; quiz: QuizQ[]; open_question: string; open_rubric: string; code: CodeTest;
  architecture: { prompt: string; requirements: string[]; constraints: string[]; rubric: { dimension: string; look_for: string }[] };
  practical: { task: string; deliverable: string; rubric: string[] };
}
export interface LessonContent {
  title: string; intro: string; blocks: Block[]; takeaways: string[]; interview_tips: string[]; test: LessonTest;
}
export interface Lesson {
  id: string; user_id: string; topic_id: string; topic_kind: TopicKind; format: FormatId;
  choice: unknown; content: LessonContent; status: "ready" | "done"; score: number | null;
  minutes: number | null; completed_at: string | null; created_at: string;
}
export interface Review {
  score: number; verdict: string; strengths: string[];
  issues: { severity: "critical" | "major" | "minor"; point: string; fix: string }[];
  dimensions: { name: string; score: number; comment: string }[]; model_answer: string; next_steps: string[];
}
export interface Attempt {
  id: string; user_id: string; lesson_id: string; topic_id: string; kind: string;
  submission: unknown; score: number; review: Review | null; created_at: string;
}
export interface Feedback {
  id: string; user_id: string; lesson_id: string; topic_kind: string; format: FormatId;
  rating: number; difficulty: number; wanted: string; comment: string; created_at: string;
}
export interface ChatMsg { role: "user" | "assistant"; content: string; tool?: boolean }
export interface Scorecard {
  score: number; hire_signal: string; summary: string;
  dimensions: { name: string; score: number; comment: string }[]; strengths: string[]; improvements: string[];
  moments: { quote: string; feedback: string; better: string }[];
  drills: { title: string; description: string; kind: TopicKind }[];
}
export interface Interview {
  id: string; user_id: string; type: string; config: Record<string, any>; transcript: ChatMsg[];
  workspace: any; scorecard: Scorecard | null; score: number | null; status: "live" | "done"; created_at: string;
}
export interface Canvas { nodes: { id: string; kind: string; label: string }[]; edges: { from: string; to: string; label: string }[]; notes: string }
