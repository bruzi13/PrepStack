import { LearnerProfile } from "@/domain/LearnerProfile";
import type { OnboardingAnswers, ProfileRecord } from "@/domain/records";
import type { SignedInUser } from "../AuthService";
import { Repository } from "./Repository";

export interface ProfileChanges { displayName?: string; roleKey?: string | null; answers?: OnboardingAnswers }

export class ProfileRepository extends Repository<ProfileRecord, LearnerProfile> {
  protected readonly table = "prep_profiles";
  protected toModel(record: ProfileRecord): LearnerProfile { return LearnerProfile.fromRecord(record); }

  /** The profile row's id is the user's id. */
  findForUser(userId: string): Promise<LearnerProfile | null> {
    return this.findById(userId);
  }

  /** Create or update the profile, keeping fields the change does not mention. */
  async save(user: SignedInUser, current: LearnerProfile | null, changes: ProfileChanges): Promise<LearnerProfile> {
    const record = await this.database.upsert<ProfileRecord>(this.table, {
      id: user.id,
      user_id: user.id,
      display_name: changes.displayName ?? current?.displayName ?? user.name,
      role_key: changes.roleKey !== undefined ? changes.roleKey : current?.roleKey ?? null,
      answers: changes.answers ?? current?.answers ?? {},
      updated_at: new Date().toISOString(),
    });
    return this.toModel(record);
  }
}
