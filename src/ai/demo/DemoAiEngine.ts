// Demo mode stand-in for the AI engine: same contracts as the server, sample content, and the server's writes
// (lessons, attempts) made to the browser's demo database.
import type { Database } from "@/data/Database";
import type { GradingReview, InterviewRecord, LessonRecord, ProfileRecord, TopicRecord } from "@/domain/records";
import type { AiEngine, ChatRequest, JobArgs, JobKind, JobResult } from "../AiEngine";
import {
  sampleChatReply, sampleCustomTopics, sampleJobAnalysis, sampleLesson, samplePlacementQuiz, samplePlan, sampleReview, sampleScorecard,
} from "./sampleContent";

const SIMULATED_DELAY_MS = 900;
const TYPING_DELAY_MS = 25;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Handlers = { [K in JobKind]: (args: JobArgs<K>) => Promise<JobResult<K>> };

export class DemoAiEngine implements AiEngine {
  constructor(private readonly database: Database, private readonly demoUserId: string) {}

  private userId(): string { return this.demoUserId; }

  private readonly handlers: Handlers = {
    diagnostic: async () => samplePlacementQuiz(),

    plan: async (args) => {
      const [profile] = await this.database.select<ProfileRecord>("prep_profiles", { where: { id: this.userId() } });
      return samplePlan(args.track, profile?.answers?.role_title, !!args.existing_titles?.length);
    },

    lesson: async (args) => {
      const [topic] = await this.database.select<TopicRecord>("prep_topics", { where: { id: args.topicId } });
      if (!topic) throw new Error("הנושא לא נמצא.");
      const [lesson] = await this.database.insert<LessonRecord>("prep_lessons", {
        user_id: this.userId(), topic_id: topic.id, topic_kind: topic.kind, format: args.format, choice: args.choice,
        status: "ready", content: sampleLesson(topic.title, topic.kind, args.format),
      });
      return { lesson, source: "personal" };
    },

    complete: async (args) => {
      const [lesson] = await this.database.select<LessonRecord>("prep_lessons", { where: { id: args.lessonId } });
      if (!lesson) throw new Error("השיעור לא נמצא.");
      const submission = args.submission as Record<string, any>;
      let score: number, review: GradingReview | null = null, extra: string | undefined;
      if (args.kind === "quiz") {
        const questions = lesson.content.test.quiz ?? [];
        const correct = questions.filter((question, index) => submission.answers?.[index] === question.answer).length;
        score = questions.length ? (correct / questions.length) * 100 : 0;
      } else {
        score = this.sampleScore(args.kind, submission);
        review = sampleReview(score);
        if (args.kind === "code") extra = `${submission.passed ?? 0}/${submission.total ?? 0} בדיקות עברו`;
      }
      score = Math.round(score);
      await this.database.insert("prep_attempts", { user_id: this.userId(), lesson_id: lesson.id, topic_id: lesson.topic_id, kind: args.kind, submission, score, review });
      await this.database.update("prep_lessons", lesson.id, { status: "done", score, minutes: args.minutes, completed_at: new Date().toISOString() });
      return { score, review, extra };
    },

    debrief: async (args) => {
      const [interview] = await this.database.select<InterviewRecord>("prep_interviews", { where: { id: args.interviewId } });
      return sampleScorecard(interview?.type);
    },

    jd: async () => sampleJobAnalysis(),
    custom: async (args) => sampleCustomTopics(args.request),
  };

  /** A plausible score from how much the learner submitted (demo only; the server asks the grader model). */
  private sampleScore(kind: string, submission: Record<string, any>): number {
    if (kind === "code") return Math.round(((submission.passed ?? 0) / Math.max(1, submission.total ?? 1)) * 75) + 15;
    if (kind === "architecture") return Math.min(90, 25 + (submission.nodes?.length ?? 0) * 8 + (submission.edges?.length ?? 0) * 4);
    return Math.min(88, 30 + Math.round(String(submission.answer ?? submission.open ?? "").length / 6));
  }

  async runJob<K extends JobKind>(kind: K, args: JobArgs<K>): Promise<JobResult<K>> {
    await sleep(SIMULATED_DELAY_MS);
    return (this.handlers[kind] as (args: JobArgs<K>) => Promise<JobResult<K>>)(args);
  }

  async chat(request: ChatRequest, onText: (textSoFar: string) => void): Promise<string> {
    const learnerTurns = request.messages.filter((message) => message.role === "user").length;
    const reply = sampleChatReply(request.mode, request.type, learnerTurns);
    let shown = "";
    for (const word of reply.split(/(?<=\s)/)) {
      shown += word;
      onText(shown);
      await sleep(TYPING_DELAY_MS);
    }
    return reply;
  }
}
