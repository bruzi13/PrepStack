// Loading a learner's history for the "today" and insights screens.
import type { FeedbackRepository } from "@/data/repositories/FeedbackRepository";
import type { InterviewRepository } from "@/data/repositories/InterviewRepository";
import type { LessonRepository } from "@/data/repositories/LessonRepository";
import type { MistakeRepository } from "@/data/repositories/MistakeRepository";
import type { PlanRepository } from "@/data/repositories/PlanRepository";
import type { TopicRepository } from "@/data/repositories/TopicRepository";
import { FormatSelector, type FormatInsights } from "@/domain/FormatSelector";
import type { LearnerProfile } from "@/domain/LearnerProfile";
import type { Lesson } from "@/domain/Lesson";
import { ProgressReport } from "@/domain/ProgressReport";

export class ProgressService {
  constructor(
    private readonly topics: TopicRepository,
    private readonly lessons: LessonRepository,
    private readonly interviews: InterviewRepository,
    private readonly feedback: FeedbackRepository,
    private readonly plans: PlanRepository,
    private readonly mistakes: MistakeRepository,
  ) {}

  async loadReport(profile: LearnerProfile): Promise<ProgressReport> {
    const userId = profile.userId;
    const [topics, lessons, interviews, feedback, activePlans, mistakes] = await Promise.all([
      this.topics.listForUser(userId), this.lessons.listForUser(userId), this.interviews.listForUser(userId),
      this.feedback.listForUser(userId), this.plans.listActive(userId),
      // The notebook is optional on this screen: a missing table (schema not updated yet) must not break it.
      this.mistakes.listForUser(userId).catch(() => []),
    ]);
    return new ProgressReport({ topics, lessons, interviews, feedback, activePlans, mistakes }, profile);
  }

  /** Format statistics plus the learner's lessons, newest first. */
  async loadInsights(userId: string): Promise<{ insights: FormatInsights; lessons: Lesson[] }> {
    const [lessons, feedback] = await Promise.all([this.lessons.listForUser(userId, true), this.feedback.listForUser(userId)]);
    return { insights: FormatSelector.fromHistory(lessons, feedback).insights(), lessons };
  }
}
