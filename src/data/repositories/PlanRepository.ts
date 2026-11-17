import { StudyPlan } from "@/domain/StudyPlan";
import type { PlanDetails, PlanRecord, Track } from "@/domain/records";
import { Repository } from "./Repository";

export class PlanRepository extends Repository<PlanRecord, StudyPlan> {
  protected readonly table = "prep_plans";
  protected toModel(record: PlanRecord): StudyPlan { return StudyPlan.fromRecord(record); }

  findActive(userId: string, track: Track): Promise<StudyPlan | null> {
    return this.findOne({ user_id: userId, track, active: true });
  }

  listActive(userId: string): Promise<StudyPlan[]> {
    return this.findMany({ where: { user_id: userId, active: true } });
  }

  async create(userId: string, track: Track, plan: { roleKey: string | null; title: string; details: PlanDetails }): Promise<StudyPlan> {
    const [record] = await this.database.insert<PlanRecord>(this.table, {
      user_id: userId, track, role_key: plan.roleKey, title: plan.title, active: true, data: plan.details,
    });
    return this.toModel(record);
  }

  deactivate(planId: string): Promise<void> {
    return this.database.update(this.table, planId, { active: false });
  }

  updateDetails(planId: string, details: PlanDetails): Promise<void> {
    return this.database.update(this.table, planId, { data: details });
  }
}
