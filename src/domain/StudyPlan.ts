// A learner's study plan for one track, with what the market research found.
import { Calendar } from "./Calendar";
import type { ExcellenceNote, MarketTrend, PlanDetails, PlanRecord, SourceLink, Track } from "./records";

export class StudyPlan {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly track: Track,
    readonly roleKey: string | null,
    readonly title: string,
    readonly details: PlanDetails,
  ) {}

  static fromRecord(record: PlanRecord): StudyPlan {
    return new StudyPlan(record.id, record.user_id, record.track, record.role_key, record.title, record.data ?? {});
  }

  get summary(): string { return this.details.summary ?? ""; }
  get marketNotes(): string[] { return this.details.market_notes ?? []; }
  get trends(): MarketTrend[] { return this.details.trends ?? []; }
  get excellence(): ExcellenceNote[] { return this.details.excellence ?? []; }
  get interviewFormatNotes(): string[] { return this.details.interview_format_notes ?? []; }
  get sources(): SourceLink[] { return this.details.sources ?? []; }

  /** The local date the market research was last refreshed, or "" if never. */
  get refreshedOn(): string {
    return this.details.map_refreshed_at ? Calendar.localDate(this.details.map_refreshed_at) : "";
  }
}
