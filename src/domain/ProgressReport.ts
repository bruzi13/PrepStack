// Everything the "today" screen says about a learner's progress, computed from their history.
import { Calendar } from "./Calendar";
import { FormatSelector, type FormatInsights } from "./FormatSelector";
import { LessonHistory, type Lesson } from "./Lesson";
import type { LearnerProfile } from "./LearnerProfile";
import type { LessonFeedback } from "./LessonFeedback";
import type { Mistake } from "./Mistake";
import type { MockInterview } from "./MockInterview";
import type { StudyPlan } from "./StudyPlan";
import type { Topic } from "./Topic";
import { TopicList } from "./TopicList";

export interface LearnerHistory {
  topics: Topic[];
  lessons: Lesson[];
  interviews: MockInterview[];
  feedback: LessonFeedback[];
  activePlans: StudyPlan[];
  mistakes: Mistake[];
}

export class ProgressReport {
  readonly topics: TopicList;
  private readonly weekStart = Calendar.startOfWeek();

  constructor(private readonly history: LearnerHistory, private readonly profile: LearnerProfile) {
    // Topics of plans that were rebuilt stay in the database as history; the report counts the live plans only.
    this.topics = new TopicList(history.topics).inPlans(new Set(history.activePlans.map((plan) => plan.id)));
  }

  private get lessons() { return new LessonHistory(this.history.lessons); }
  private get finishedInterviews() { return this.history.interviews.filter((interview) => interview.isFinished); }

  get lessonsThisWeek(): Lesson[] { return this.lessons.completedSince(this.weekStart); }
  get interviewsThisWeek(): number { return this.finishedInterviews.filter((interview) => interview.createdAt >= this.weekStart).length; }
  get minutesThisWeek(): number { return LessonHistory.totalMinutes(this.lessonsThisWeek); }
  get averageScoreThisWeek(): number | null { return LessonHistory.averageScore(this.lessonsThisWeek); }
  get weeklyGoalMinutes(): number { return this.profile.weeklyGoalMinutes; }

  /** Days in a row with a finished lesson, interview or practice. */
  get streakDays(): number {
    return Calendar.streakLength([
      ...this.lessons.completed().map((lesson) => lesson.completedAt!),
      ...this.finishedInterviews.map((interview) => interview.createdAt),
      ...this.history.mistakes.flatMap((mistake) => (mistake.lastReviewedAt ? [mistake.lastReviewedAt] : [])),
    ]);
  }

  /** Notebook entries waiting for today's practice. */
  get mistakesDue(): number { return this.history.mistakes.filter((mistake) => mistake.isDue()).length; }
  /** Notebook entries not yet retired. */
  get openMistakes(): number { return this.history.mistakes.filter((mistake) => !mistake.resolved).length; }

  /** Interview readiness: priority-weighted mastery of the main track. */
  get readiness(): number { return this.topics.onTrack("main").readiness(); }

  get dueForReview(): Topic[] { return this.topics.dueForReview(); }
  get nextToStudy(): Topic | undefined { return this.topics.nextToStudy(); }
  /** Where "start" should take the learner: reviews first, then the next new topic. */
  get firstStep(): Topic | undefined { return this.dueForReview[0] ?? this.nextToStudy; }

  get topicsStudiedThisWeek(): Topic[] {
    return this.lessonsThisWeek.map((lesson) => this.topics.find(lesson.topicId)).filter((topic): topic is Topic => !!topic);
  }

  get latestScoredInterview(): MockInterview | undefined {
    return this.history.interviews.filter((interview) => interview.hasScore).at(-1);
  }

  get marketNotes(): string[] {
    return this.history.activePlans.find((plan) => plan.track === "main")?.marketNotes ?? [];
  }

  formatInsights(): FormatInsights {
    return FormatSelector.fromHistory(this.history.lessons, this.history.feedback).insights();
  }
}
