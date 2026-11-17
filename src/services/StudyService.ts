// A lesson from start to finish: choose the format for this learner, have the server prepare the lesson,
// submit the test, and move the topic along its review schedule.
import type { FormatId } from "@shared/catalog";
import type { AiEngine, FormatChoiceRecord, TestKind } from "@/ai/AiEngine";
import type { FeedbackRepository } from "@/data/repositories/FeedbackRepository";
import type { LessonRepository } from "@/data/repositories/LessonRepository";
import type { TopicRepository } from "@/data/repositories/TopicRepository";
import type { PracticeService } from "@/services/PracticeService";
import { FormatSelector, type FormatChoice } from "@/domain/FormatSelector";
import { Lesson } from "@/domain/Lesson";
import type { LessonFeedbackInput } from "@/domain/LessonFeedback";
import type { ChatMessage, TestOutcome } from "@/domain/records";
import { SpacedRepetitionScheduler } from "@/domain/SpacedRepetitionScheduler";
import type { Topic } from "@/domain/Topic";
import { TopicList } from "@/domain/TopicList";

/** A test cannot take longer than this to count (the learner left the tab open). */
const MAX_COUNTED_MINUTES = 120;

export interface LessonRequest {
  /** A format the learner picked themselves; otherwise the selector chooses. */
  chosenFormat?: FormatId;
  /** Formats not to pick (for "something else"). */
  excludedFormats?: FormatId[];
}

export interface TestSubmissionResult {
  outcome: TestOutcome;
  topic: Topic;
  nextTopic: Topic | null;
}

export class StudyService {
  private readonly scheduler = new SpacedRepetitionScheduler();

  constructor(
    private readonly ai: AiEngine,
    private readonly topics: TopicRepository,
    private readonly lessons: LessonRepository,
    private readonly feedback: FeedbackRepository,
    private readonly practice: PracticeService,
  ) {}

  findTopic(topicId: string): Promise<Topic | null> {
    return this.topics.findById(topicId);
  }

  findUnfinishedLesson(topic: Topic): Promise<Lesson | null> {
    return this.lessons.findUnfinished(topic.id);
  }

  /** Pick the format, then have the server prepare (or serve from the shared cache) the lesson. */
  async startLesson(topic: Topic, request: LessonRequest = {}): Promise<Lesson> {
    const [history, feedback, priors] = await Promise.all([
      this.lessons.listForUser(topic.userId),
      this.feedback.listForUser(topic.userId),
      this.lessons.formatPriors().catch(() => []),
    ]);
    const choice = FormatSelector.fromHistory(history, feedback, priors).choose(topic.kind, request.excludedFormats);
    const format = request.chosenFormat ?? choice.format;
    const { lesson } = await this.ai.runJob("lesson", {
      topicId: topic.id, format, manual: !!request.chosenFormat, choice: StudyService.recordOf(choice, request.chosenFormat),
    });
    return Lesson.fromRecord(lesson);
  }

  /** Throw away the unfinished lesson and prepare one in another format. */
  async switchFormat(topic: Topic, current: Lesson, chosenFormat?: FormatId): Promise<Lesson> {
    await this.lessons.deleteUnfinished(current.id);
    return this.startLesson(topic, chosenFormat ? { chosenFormat } : { excludedFormats: [current.format] });
  }

  /** The server grades the test and saves the score; here the topic moves along its review schedule. */
  async submitTest(topic: Topic, lesson: Lesson, kind: TestKind, submission: Record<string, unknown>, startedAt: number): Promise<TestSubmissionResult> {
    const minutes = Math.min(MAX_COUNTED_MINUTES, (Date.now() - startedAt) / 60_000);
    const outcome = await this.ai.runJob("complete", { lessonId: lesson.id, kind, submission, minutes });
    const updatedTopic = await this.topics.saveProgress(topic, this.scheduler.progressAfterTest(topic, outcome.score));
    // The notebook is a bonus: if saving it fails, the learner still gets their result.
    await this.practice.captureFromTest(topic.userId, topic, lesson, submission, outcome).catch((failure) => console.warn("mistakes not saved", failure));
    const planTopics = new TopicList(await this.topics.listForPlan(topic.planId));
    return { outcome, topic: updatedTopic, nextTopic: planTopics.nextToStudy(topic.id) ?? null };
  }

  sendFeedback(userId: string, lesson: Lesson, input: LessonFeedbackInput): Promise<void> {
    return this.feedback.create(userId, lesson, input);
  }

  /** A question to the tutor about the lesson; streams the answer. */
  askTutor(topicTitle: string, conversation: ChatMessage[], onText: (textSoFar: string) => void): Promise<string> {
    const messages = conversation.map(({ role, content }) => ({ role, content }));
    return this.ai.chat({ mode: "tutor", topic: { title: topicTitle }, messages }, onText);
  }

  /** What is stored with the lesson about why its format was chosen. */
  private static recordOf(choice: FormatChoice, chosenFormat?: FormatId): FormatChoiceRecord {
    return {
      reason: chosenFormat ? "בחרתם בפורמט הזה בעצמכם." : choice.reason,
      manual: !!chosenFormat,
      table: choice.arms.map((arm) => ({
        format: arm.format, n: arm.lessonCount, mean: +arm.estimatedReward.toFixed(3), sampled: +arm.sampledReward.toFixed(3),
      })),
    };
  }
}
