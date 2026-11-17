// Supabase implementations of the service ports. Uses the service role (server only) and always scopes
// learner rows by the caller's user id, because the service role bypasses RLS.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GradingStore } from "../_services/gradingService";
import type { BankTest, Json, LessonStore, Template, TemplateKey } from "../_services/ports";

/** The data of a Supabase response, or an error naming the operation. */
const must = <T>(response: { data: T | null; error: { message: string } | null }, operation: string): T => {
  if (response.error) throw new Error(`${operation}: ${response.error.message}`);
  return response.data as T;
};
/** Narrow a template query to one cache key. */
const matchingKey = (query: any, key: TemplateKey) =>
  query.eq("topic_key", key.topic_key).eq("format", key.format).eq("level_band", key.level_band).eq("lang", key.lang).eq("variant", key.variant).eq("prompt_version", key.prompt_version);

export class SupabaseLessonStore implements LessonStore, GradingStore {
  constructor(private db: SupabaseClient) {}

  async topic(userId: string, topicId: string) {
    return must(await this.db.from("prep_topics").select("id,user_id,title,description,module,kind,topic_key,mastery,reviews").eq("id", topicId).eq("user_id", userId).maybeSingle(), "topic");
  }
  async learner(userId: string) {
    const profile = must(await this.db.from("prep_profiles").select("display_name,answers").eq("id", userId).maybeSingle(), "profile") as Json | null;
    return { display_name: profile?.display_name ?? "", answers: profile?.answers ?? {} };
  }
  async catalog(topicKey: string) {
    return must(await this.db.from("prep_topic_catalog").select("topic_key,title,description,kind").eq("topic_key", topicKey).maybeSingle(), "catalog");
  }
  async lastWeakPoints(userId: string, topicId: string) {
    const rows = must(await this.db.from("prep_attempts").select("review").eq("user_id", userId).eq("topic_id", topicId).order("created_at", { ascending: false }).limit(1), "attempts") as Json[];
    return ((rows[0]?.review?.issues ?? []) as Json[]).map((issue) => String(issue.point)).slice(0, 6);
  }
  async cachePercent() {
    const setting = must(await this.db.from("ops_settings").select("value").eq("key", "lesson_cache_percent").maybeSingle(), "settings") as Json | null;
    return Number(setting?.value ?? 0);
  }

  async findTemplate(key: TemplateKey, status: Template["status"]) {
    const response = await matchingKey(this.db.from("prep_lesson_templates").select("*"), key).eq("status", status).order("version", { ascending: false }).limit(1);
    return (must(response, "template") as Template[])[0] ?? null;
  }
  async claim(key: TemplateKey, leaseMs: number, version: number) {
    const { data, error } = await this.db.from("prep_lesson_templates")
      .insert({ ...key, version, status: "generating", lease_until: new Date(Date.now() + leaseMs).toISOString() }).select("*").single();
    if (error) { if (error.code === "23505") return null; throw new Error(`claim: ${error.message}`); }
    return data as Template;
  }
  async takeOver(id: string, leaseMs: number) {
    const response = await this.db.from("prep_lesson_templates").update({ lease_until: new Date(Date.now() + leaseMs).toISOString() })
      .eq("id", id).eq("status", "generating").lt("lease_until", new Date().toISOString()).select("id");
    return (must(response, "takeOver") as unknown[]).length === 1;
  }
  async completeTemplate(id: string, content: Json, hash: string) {
    must(await this.db.from("prep_lesson_templates").update({ status: "ready", content, content_hash: hash, lease_until: null, refreshed_at: new Date().toISOString() }).eq("id", id), "complete");
  }
  async failTemplate(id: string) { must(await this.db.from("prep_lesson_templates").update({ status: "failed", lease_until: null }).eq("id", id), "fail"); }
  async retire(id: string) { must(await this.db.from("prep_lesson_templates").update({ status: "retired" }).eq("id", id), "retire"); }

  async tests(templateId: string) {
    return must(await this.db.from("prep_test_bank").select("id,test").eq("template_id", templateId).eq("status", "active").order("created_at"), "tests") as BankTest[];
  }
  async addTest(templateId: string, test: Json) {
    return must(await this.db.from("prep_test_bank").insert({ template_id: templateId, test }).select("id,test").single(), "addTest") as BankTest;
  }
  async seenTests(userId: string, templateId: string) {
    const rows = must(await this.db.from("prep_lessons").select("test_id").eq("user_id", userId).eq("template_id", templateId).not("test_id", "is", null).order("created_at"), "seen") as Json[];
    return rows.map((row) => String(row.test_id));
  }
  async insertLesson(row: Json) { return must(await this.db.from("prep_lessons").insert(row).select("*").single(), "insertLesson") as Json & { id: string }; }
  async bumpUses(templateId: string, testId: string) { must(await this.db.rpc("prep_bump_uses", { p_template: templateId, p_test: testId }), "bumpUses"); }

  /* ---------- GradingStore ---------- */
  async lesson(userId: string, lessonId: string) {
    return must(await this.db.from("prep_lessons").select("id,topic_id,status,content").eq("id", lessonId).eq("user_id", userId).maybeSingle(), "lesson");
  }
  async topicTitle(topicId: string) {
    const topic = must(await this.db.from("prep_topics").select("title").eq("id", topicId).maybeSingle(), "topic") as Json | null;
    return String(topic?.title ?? "");
  }
  async saveResult(userId: string, lesson: { id: string; topic_id: string }, result: { kind: string; submission: Json; score: number; review: Json | null; minutes: number }) {
    must(await this.db.from("prep_attempts").insert({ user_id: userId, lesson_id: lesson.id, topic_id: lesson.topic_id, kind: result.kind, submission: result.submission, score: result.score, review: result.review }), "attempt");
    must(await this.db.from("prep_lessons").update({ status: "done", score: result.score, minutes: result.minutes, completed_at: new Date().toISOString() }).eq("id", lesson.id).eq("user_id", userId), "lessonDone");
  }
}
