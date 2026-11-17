// Loading a learner's history for the "today" and insights screens.
import type { FeedbackRepository } from "@/data/repositories/FeedbackRepository";
import type { InterviewRepository } from "@/data/repositories/InterviewRepository";
import type { LessonRepository } from "@/data/repositories/LessonRepository";
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
  ) {}

  async loadReport(profile: LearnerProfile): Promise<ProgressReport> {
    const userId = profile.userId;
    const [topics, lessons, interviews, feedback, activePlans] = await Promise.all([
      this.topics.listForUser(userId), this.lessons.listForUser(userId), this.interviews.listForUser(userId),
      this.feedback.listForUser(userId), this.plans.listActive(userId),
    ]);
    return new ProgressReport({ topics, lessons, interviews, feedback, activePlans }, profile);
  }

  /** Format statistics plus the learner's lessons, newest first. */
  async loadInsights(userId: string): Promise<{ insights: FormatInsights; lessons: Lesson[] }> {
    const [lessons, feedback] = await Promise.all([this.lessons.listForUser(userId, true), this.feedback.listForUser(userId)]);
    return { insights: FormatSelector.fromHistory(lessons, feedback).insights(), lessons };
  }
}
