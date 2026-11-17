import { MockInterview } from "@/domain/MockInterview";
import type { ChatMessage, InterviewConfig, InterviewRecord, InterviewWorkspace, Scorecard } from "@/domain/records";
import { Repository } from "./Repository";

export class InterviewRepository extends Repository<InterviewRecord, MockInterview> {
  protected readonly table = "prep_interviews";
  protected toModel(record: InterviewRecord): MockInterview { return MockInterview.fromRecord(record); }

  listForUser(userId: string): Promise<MockInterview[]> {
    return this.findMany({ where: { user_id: userId }, orderBy: "created_at" });
  }

  listRecent(userId: string, limit: number): Promise<MockInterview[]> {
    return this.findMany({ where: { user_id: userId }, orderBy: "created_at", ascending: false, limit });
  }

  async create(userId: string, typeId: string, config: InterviewConfig): Promise<MockInterview> {
    const [record] = await this.database.insert<InterviewRecord>(this.table, {
      user_id: userId, type: typeId, status: "live", transcript: [], workspace: null, config,
    });
    return this.toModel(record);
  }

  saveProgress(interviewId: string, transcript: ChatMessage[], workspace?: InterviewWorkspace): Promise<void> {
    return this.database.update(this.table, interviewId, workspace ? { transcript, workspace } : { transcript });
  }

  saveScorecard(interviewId: string, scorecard: Scorecard): Promise<void> {
    return this.database.update(this.table, interviewId, { status: "done", scorecard, score: scorecard.score });
  }
}
