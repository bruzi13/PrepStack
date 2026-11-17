// The job handlers and the composition root that wires services to their Supabase and Anthropic adapters.
// Open/closed: a new job kind is a new handler class and one line in JOB_HANDLERS, never an edit to a switch.
// Every handler loads what it needs itself; the browser sends ids and choices only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { topicKey } from "../../../shared/lessonKeys";
import { SupabaseLessonStore } from "../_adapters/supabase";
import * as ai from "../_lib/jobs";
import { GradingService } from "../_services/gradingService";
import { learnerBrief, LessonService } from "../_services/lessonService";
import type { Json, LessonGenerator } from "../_services/ports";
import { UserError } from "./errors";
import { check, JobArgs, LessonBody, Review, type JobKind } from "./schemas";

export interface Services { lessons: LessonService; grading: GradingService; store: SupabaseLessonStore }
export interface JobContext { db: SupabaseClient; userId: string; services: Services }
export interface JobOutcome {
  result: unknown;
  /** Work to do after the learner already has the result (for example refreshing a stale shared lesson). */
  after?: () => Promise<void>;
}
export interface JobHandler<K extends JobKind> {
  run(args: z.infer<(typeof JobArgs)[K]>, context: JobContext): Promise<JobOutcome>;
}

/* ---------- composition root ---------- */

const claudeLessonGenerator: LessonGenerator = {
  about: (topic, options) => ai.lessonAbout(topic, options),
  body: async (about, format) => check(LessonBody, await ai.lessonBody(about, format), "lesson body"),
  test: (about, testType) => ai.lessonTest(about, testType),
  note: (topicTitle, weakPoints, learner) => ai.personalNote(topicTitle, weakPoints, learner),
  personal: async (topic, format, learner, isReview, weakPoints) => {
    const content = await ai.lessonForLearner(topic, format, learner, topic.mastery, isReview, weakPoints);
    check(LessonBody, content, "lesson body");
    return content;
  },
};

const systemClock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };

export function createServices(db: SupabaseClient): Services {
  const store = new SupabaseLessonStore(db);
  return {
    store,
    lessons: new LessonService(store, claudeLessonGenerator, systemClock),
    grading: new GradingService(store, { grade: async (input) => check(Review, await ai.grade(input), "review") as Json }),
  };
}

/* ---------- handlers ---------- */

/** What the AI is told about the learner (name and questionnaire answers, no ids). */
async function learnerProfile(context: JobContext): Promise<Json> {
  return learnerBrief(await context.services.store.learner(context.userId));
}

class PlacementQuizJob implements JobHandler<"diagnostic"> {
  async run(args: z.infer<typeof JobArgs.diagnostic>, context: JobContext): Promise<JobOutcome> {
    // Onboarding runs before the profile is saved, so the in-progress answers override the stored ones.
    return { result: await ai.diagnostic({ profile: { ...(await learnerProfile(context)), ...args.answers } }) };
  }
}

class StudyPlanJob implements JobHandler<"plan"> {
  async run(args: z.infer<typeof JobArgs.plan>, context: JobContext): Promise<JobOutcome> {
    const profile = await learnerProfile(context);
    const draft = await ai.plan({ profile, diagnostic: profile.diagnostic ?? {}, track: args.track, existing_titles: args.existing_titles }, context.db);
    return { result: await StudyPlanJob.withCatalogKeys(context.db, draft as Json) };
  }

  /** Plan topics get a catalog key so their lessons can be shared; the catalog keeps the first wording it saw. */
  private static async withCatalogKeys(db: SupabaseClient, draft: Json): Promise<Json> {
    const catalogEntries = new Map<string, Json>();
    for (const module of (draft.modules ?? []) as Json[]) {
      for (const topic of (module.topics ?? []) as Json[]) {
        const key = topicKey(String(topic.title ?? ""));
        if (!key) continue;
        topic.topic_key = key;
        if (!catalogEntries.has(key)) catalogEntries.set(key, { topic_key: key, title: topic.title, description: topic.description ?? "", kind: topic.kind, origin: "plan" });
      }
    }
    if (catalogEntries.size) {
      const { error } = await db.from("prep_topic_catalog").upsert([...catalogEntries.values()], { onConflict: "topic_key", ignoreDuplicates: true });
      if (error) throw new Error(`catalog: ${error.message}`);
    }
    return draft;
  }
}

class StartLessonJob implements JobHandler<"lesson"> {
  async run(args: z.infer<typeof JobArgs.lesson>, context: JobContext): Promise<JobOutcome> {
    const started = await context.services.lessons.start(context.userId, args);
    return { result: { lesson: started.lesson, source: started.source }, after: started.after };
  }
}

class GradeTestJob implements JobHandler<"complete"> {
  async run(args: z.infer<typeof JobArgs.complete>, context: JobContext): Promise<JobOutcome> {
    return { result: await context.services.grading.complete(context.userId, args) };
  }
}

class InterviewDebriefJob implements JobHandler<"debrief"> {
  async run(args: z.infer<typeof JobArgs.debrief>, context: JobContext): Promise<JobOutcome> {
    const { data: interview } = await context.db.from("prep_interviews").select("type,config,transcript,workspace")
      .eq("id", args.interviewId).eq("user_id", context.userId).maybeSingle();
    if (!interview) throw new UserError("הראיון לא נמצא.", 404);
    const transcript = ((interview.transcript ?? []) as Json[]).filter((message) => message.content !== "[START]");
    return { result: await ai.debrief({ ...interview, transcript, profile: await learnerProfile(context) }) };
  }
}

class JobDescriptionJob implements JobHandler<"jd"> {
  async run(args: z.infer<typeof JobArgs.jd>, context: JobContext): Promise<JobOutcome> {
    const { data: topics } = await context.db.from("prep_topics").select("title").eq("user_id", context.userId);
    const existingTitles = (topics ?? []).map((topic) => topic.title);
    return { result: await ai.jd({ jd_text: args.text, profile: await learnerProfile(context), existing_titles: existingTitles }) };
  }
}

class TopicRequestJob implements JobHandler<"custom"> {
  async run(args: z.infer<typeof JobArgs.custom>, context: JobContext): Promise<JobOutcome> {
    const draft = (await ai.custom({ request: args.request, profile: await learnerProfile(context), existing_titles: args.existing_titles })) as Json;
    const topics = Array.isArray(draft.topics) ? (draft.topics as Json[]) : [];
    const isGeneral = draft.scope === "general" && topics.length > 0;
    const firstTopic = topics[0] ?? {};
    // Learner requests never reach the shared catalog directly: general ones wait for a maintainer's review.
    const { error } = await context.db.from("prep_topic_requests").insert({
      user_id: context.userId, request: args.request,
      scope: isGeneral ? "general" : "private", status: isGeneral ? "pending" : "private",
      title: firstTopic.title ?? null, description: firstTopic.description ?? null, kind: firstTopic.kind ?? null,
    });
    if (error) throw new Error(`topic request: ${error.message}`);
    return { result: { note: draft.note, module: draft.module, topics } };
  }
}

export const JOB_HANDLERS: { [K in JobKind]: JobHandler<K> } = {
  diagnostic: new PlacementQuizJob(),
  plan: new StudyPlanJob(),
  lesson: new StartLessonJob(),
  complete: new GradeTestJob(),
  debrief: new InterviewDebriefJob(),
  jd: new JobDescriptionJob(),
  custom: new TopicRequestJob(),
};

/** Run the handler for `kind` with arguments already validated against JobArgs[kind]. */
export function runJob<K extends JobKind>(kind: K, args: z.infer<(typeof JobArgs)[K]>, context: JobContext): Promise<JobOutcome> {
  return JOB_HANDLERS[kind].run(args, context);
}
