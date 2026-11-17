// The narrow interfaces the services depend on (dependency inversion). Supabase and Anthropic implement them
// in _adapters; tests implement them in memory.
import type { LevelBand } from "../../../shared/lessonKeys";

export type Json = Record<string, any>;

export interface TopicRow { id: string; user_id: string; title: string; description: string; module: string; kind: string; topic_key: string | null; mastery: number; reviews: number }
export interface Learner { display_name: string; answers: Json }
export interface CatalogTopic { topic_key: string; title: string; description: string; kind: string }
export interface TemplateKey { topic_key: string; format: string; level_band: LevelBand; lang: string; variant: "full" | "review"; prompt_version: number }
export interface Template extends TemplateKey { id: string; status: "generating" | "ready" | "stale" | "retired" | "failed"; content: Json | null; lease_until: string | null; version: number }
export interface BankTest { id: string; test: Json }
export interface LessonRow { id: string; [k: string]: unknown }

/** Reads and writes for lessons and the shared cache. */
export interface LessonStore {
  topic(userId: string, topicId: string): Promise<TopicRow | null>;
  learner(userId: string): Promise<Learner>;
  catalog(topicKey: string): Promise<CatalogTopic | null>;
  lastWeakPoints(userId: string, topicId: string): Promise<string[]>;
  cachePercent(): Promise<number>;

  findTemplate(key: TemplateKey, status: Template["status"]): Promise<Template | null>;
  /** Insert a `generating` row with a lease. Returns null when another live row exists for the key. */
  claim(key: TemplateKey, leaseMs: number, version: number): Promise<Template | null>;
  /** Take over a `generating` row whose lease ran out (its job died). */
  takeOver(id: string, leaseMs: number): Promise<boolean>;
  completeTemplate(id: string, content: Json, hash: string): Promise<void>;
  failTemplate(id: string): Promise<void>;
  retire(id: string): Promise<void>;

  tests(templateId: string): Promise<BankTest[]>;
  addTest(templateId: string, test: Json): Promise<BankTest>;
  /** Test ids this learner already got from this template, oldest first. */
  seenTests(userId: string, templateId: string): Promise<string[]>;

  insertLesson(row: Json): Promise<LessonRow>;
  bumpUses(templateId: string, testId: string): Promise<void>;
}

/** The AI work a lesson needs. */
export interface LessonGenerator {
  body(about: string, format: string): Promise<Json>;
  test(about: string, testType: string): Promise<Json>;
  note(topicTitle: string, weak: string[], learner: Json): Promise<string>;
  personal(topic: TopicRow, format: string, learner: Json, review: boolean, weak: string[]): Promise<Json>;
  about(t: { title: string; description?: string; module?: string; kind: string }, opts: { band?: string }): { about: string; testType: string; kind: string };
}

export interface Clock { now(): number; sleep(ms: number): Promise<void> }
