// The job registry (open/closed: a new job kind is a new entry, never an edit to a switch) and the composition
// root that wires services to their Supabase and Anthropic adapters.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { topicKey } from "../../../shared/lessonKeys";
import { SupabaseLessonStore } from "../_adapters/supabase";
import * as ai from "../_lib/jobs";
import { GradingService } from "../_services/gradingService";
import { learnerBrief, LessonService, type StartResult } from "../_services/lessonService";
import type { Json, LessonGenerator } from "../_services/ports";
import { UserError } from "./errors";
import { JobArgs, Review, check, LessonBody, type JobKind } from "./schemas";

export interface JobEnv { db: SupabaseClient; userId: string; services: Services }
export interface JobOutput { result: unknown; after?: () => Promise<void> }
interface JobHandler<K extends JobKind> { run(args: z.infer<(typeof JobArgs)[K]>, env: JobEnv): Promise<JobOutput> }

/* ---------- composition root ---------- */
export interface Services { lessons: LessonService; grading: GradingService; store: SupabaseLessonStore }

const generator: LessonGenerator = {
  about: (t, opts) => ai.lessonAbout(t, opts),
  body: async (about, format) => check(LessonBody, await ai.lessonBody(about, format), "lesson body"),
  test: (about, testType) => ai.lessonTest(about, testType),
  note: (title, weak, learner) => ai.personalNote(title, weak, learner),
  personal: async (topic, format, learner, review, weak) => {
    const c = await ai.lessonForLearner(topic, format, learner, topic.mastery, review, weak);
    check(LessonBody, c, "lesson body");
    return c;
  },
};

export function services(db: SupabaseClient): Services {
  const store = new SupabaseLessonStore(db);
  const clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
  return {
    store,
    lessons: new LessonService(store, generator, clock),
    grading: new GradingService(store, { grade: async (input) => check(Review, await ai.grade(input), "review") as Json }),
  };
}

/* ---------- handlers: each loads what it needs itself; the browser sends ids and choices only ---------- */
const profileOf = async (env: JobEnv) => learnerBrief(await env.services.store.learner(env.userId));

/** Plan topics get a catalog key so their lessons can be shared; the catalog keeps the first wording it saw. */
async function withCatalogKeys(db: SupabaseClient, r: Json): Promise<Json> {
  const modules = (r.modules ?? []) as Json[];
  const rows = new Map<string, Json>();
  for (const m of modules) for (const t of (m.topics ?? []) as Json[]) {
    const key = topicKey(String(t.title ?? ""));
    if (!key) continue;
    t.topic_key = key;
    if (!rows.has(key)) rows.set(key, { topic_key: key, title: t.title, description: t.description ?? "", kind: t.kind, origin: "plan" });
  }
  if (rows.size) {
    const { error } = await db.from("prep_topic_catalog").upsert([...rows.values()], { onConflict: "topic_key", ignoreDuplicates: true });
    if (error) throw new Error(`catalog: ${error.message}`);
  }
  return r;
}

export const JOBS: { [K in JobKind]: JobHandler<K> } = {
  diagnostic: { run: async (a, env) => ({ result: await ai.diagnostic({ profile: { ...(await profileOf(env)), ...a.answers } }) }) },

  plan: {
    run: async (a, env) => {
      const profile = await profileOf(env);
      const r = await ai.plan({ profile, diagnostic: (profile as Json).diagnostic ?? {}, track: a.track, existing_titles: a.existing_titles }, env.db);
      return { result: await withCatalogKeys(env.db, r as Json) };
    },
  },

  lesson: {
    run: async (a, env) => {
      const r: StartResult = await env.services.lessons.start(env.userId, a);
      return { result: { lesson: r.lesson, source: r.source }, after: r.after };
    },
  },

  complete: { run: async (a, env) => ({ result: await env.services.grading.complete(env.userId, a) }) },

  debrief: {
    run: async (a, env) => {
      const { data: iv } = await env.db.from("prep_interviews").select("type,config,transcript,workspace").eq("id", a.interviewId).eq("user_id", env.userId).maybeSingle();
      if (!iv) throw new UserError("הראיון לא נמצא.", 404);
      const transcript = ((iv.transcript ?? []) as Json[]).filter((m) => m.content !== "[START]");
      return { result: await ai.debrief({ ...iv, transcript, profile: await profileOf(env) }) };
    },
  },

  jd: {
    run: async (a, env) => {
      const { data: topics } = await env.db.from("prep_topics").select("title").eq("user_id", env.userId);
      return { result: await ai.jd({ jd_text: a.text, profile: await profileOf(env), existing_titles: (topics ?? []).map((t) => t.title) }) };
    },
  },

  custom: {
    run: async (a, env) => {
      const r = (await ai.custom({ request: a.request, profile: await profileOf(env), existing_titles: a.existing_titles })) as Json;
      const general = r.scope === "general" && Array.isArray(r.topics) && r.topics.length > 0;
      const first = (r.topics?.[0] ?? {}) as Json;
      // Learner requests never reach the shared catalog directly: general ones wait for a maintainer's review.
      const { error } = await env.db.from("prep_topic_requests").insert({
        user_id: env.userId, request: a.request, scope: general ? "general" : "private", status: general ? "pending" : "private",
        title: first.title ?? null, description: first.description ?? null, kind: first.kind ?? null,
      });
      if (error) throw new Error(`topic request: ${error.message}`);
      return { result: { note: r.note, module: r.module, topics: r.topics ?? [] } };
    },
  },
};
