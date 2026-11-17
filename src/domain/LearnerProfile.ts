// Who the learner is: their name and what they told us in the onboarding questionnaire.
import { IMPROVE_GOALS, LEVELS, TARGET_LEVELS } from "@shared/catalog";
import { Calendar } from "./Calendar";
import type { OnboardingAnswers, ProfileRecord } from "./records";

export class LearnerProfile {
  static readonly DEFAULT_HOURS_PER_WEEK = 5;

  private constructor(
    readonly userId: string,
    readonly displayName: string,
    readonly roleKey: string | null,
    readonly answers: OnboardingAnswers,
  ) {}

  static fromRecord(record: ProfileRecord): LearnerProfile {
    return new LearnerProfile(record.id, record.display_name ?? "", record.role_key, record.answers ?? {});
  }

  get isOnboarded(): boolean { return !!this.answers.onboarded; }
  get roleTitle(): string { return this.answers.role_title ?? ""; }
  get stack(): string { return this.answers.stack ?? ""; }
  get experienceLevel(): string { return this.answers.level ?? "mid"; }
  get hoursPerWeek(): number { return this.answers.hours_per_week ?? LearnerProfile.DEFAULT_HOURS_PER_WEEK; }
  get weeklyGoalMinutes(): number { return this.hoursPerWeek * 60; }
  get interviewDate(): string { return this.answers.interview_date ?? ""; }
  get initial(): string { return (this.displayName || "?").trim().charAt(0); }

  /** The level of role they are aiming for; students aim for junior roles. */
  get targetLevel(): string {
    return this.answers.target_level ?? (this.answers.level === "student" ? "junior" : this.answers.level ?? "mid");
  }

  get interviewLanguage(): "he" | "en" { return this.answers.interview_lang === "en" ? "en" : "he"; }

  /** Days until the interview, or null when no date is set. */
  daysUntilInterview(): number | null {
    return this.interviewDate ? Calendar.daysUntil(this.interviewDate) : null;
  }

  get experienceLabel(): string { return LEVELS.find((level) => level.key === this.answers.level)?.title ?? this.answers.level ?? ""; }
  get targetLevelLabel(): string { return TARGET_LEVELS.find(([key]) => key === this.answers.target_level)?.[1] ?? "לא נבחרה"; }
  get improvementGoalLabels(): string[] {
    return (this.answers.improve ?? [])
      .map((key): string | undefined => IMPROVE_GOALS.find((goal) => goal.key === key)?.title)
      .filter((title): title is string => !!title);
  }
}
