// The onboarding questionnaire's rules: which steps a learner sees (it depends on earlier answers), when they
// may continue, and the answers as finally stored.
import { ROLES } from "@shared/catalog";
import type { OnboardingAnswers } from "./records";

export type QuestionnaireStep = "who" | "level" | "role" | "stack" | "improve" | "newStack" | "time";

/** The role level we suggest from the learner's experience; they can change it. */
const SUGGESTED_TARGET_LEVEL: Record<string, string> = { student: "junior", junior: "junior", mid: "mid", senior: "senior", staff: "staff" };

export class OnboardingQuestionnaire {
  constructor(readonly answers: OnboardingAnswers, readonly displayName: string) {}

  /** Career switchers skip the current-stack step; the new-stack step appears only if they want to learn one. */
  get steps(): QuestionnaireStep[] {
    const steps: QuestionnaireStep[] = ["who", "level", "role"];
    if (this.answers.occupation !== "switcher") steps.push("stack");
    steps.push("improve");
    if (this.answers.improve?.includes("new_stack")) steps.push("newStack");
    steps.push("time");
    return steps;
  }

  canContinueFrom(step: QuestionnaireStep): boolean {
    const answers = this.answers;
    switch (step) {
      case "who": return !!answers.occupation && !!this.displayName.trim();
      case "level": return !!answers.level;
      case "role": return !!answers.role && (answers.role !== "other" || !!answers.role_title?.trim()) && !!answers.target_level;
      case "improve": return (answers.improve?.length ?? 0) > 0;
      default: return true;
    }
  }

  static suggestedTargetLevel(experienceLevel: string | undefined): string {
    return SUGGESTED_TARGET_LEVEL[experienceLevel ?? "junior"] ?? "mid";
  }

  /** The answers as stored: a known role's title is filled in from the catalog. */
  finalAnswers(): OnboardingAnswers {
    const roleTitle = this.answers.role === "other" ? this.answers.role_title : ROLES.find((role) => role.key === this.answers.role)?.title;
    return { ...this.answers, level: this.answers.level ?? "junior", role_title: roleTitle };
  }
}
