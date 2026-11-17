// The end of the onboarding questionnaire: the placement quiz, then the first plan.
import type { AiEngine } from "@/ai/AiEngine";
import type { SignedInUser } from "@/data/AuthService";
import type { LearnerProfile } from "@/domain/LearnerProfile";
import type { OnboardingAnswers, PlacementQuiz } from "@/domain/records";
import type { ProfileChanges } from "@/data/repositories/ProfileRepository";
import type { PlanService } from "./PlanService";

export type SaveProfile = (changes: ProfileChanges) => Promise<LearnerProfile>;

export class OnboardingService {
  constructor(private readonly ai: AiEngine, private readonly plans: PlanService) {}

  createPlacementQuiz(answers: OnboardingAnswers): Promise<PlacementQuiz> {
    return this.ai.runJob("diagnostic", { answers });
  }

  /**
   * Save the answers, build the first plan, and only then mark the learner as onboarded, so a failed plan
   * build sends them back to the questionnaire instead of to an empty dashboard.
   */
  async complete(user: SignedInUser, displayName: string, answers: OnboardingAnswers, saveProfile: SaveProfile): Promise<void> {
    const roleKey = answers.role ?? null;
    await saveProfile({ displayName, roleKey, answers });
    await this.plans.createPlan(user.id, "main");
    await saveProfile({ displayName, roleKey, answers: { ...answers, onboarded: true } });
  }
}
