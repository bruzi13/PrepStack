// A mock interview: its setup, the transcript so far, the shared workspace, and the scorecard once finished.
import { interviewById, type InterviewType } from "@shared/catalog";
import type { ChatMessage, InterviewConfig, InterviewRecord, InterviewStatus, InterviewWorkspace, Scorecard } from "./records";

export const HIRE_SIGNAL_LABEL: Record<string, string> = {
  strong_no: "Strong No Hire", no: "No Hire", lean_no: "Lean No Hire", lean_yes: "Lean Hire", yes: "Hire", strong_yes: "Strong Hire",
};

/** The first message of every transcript: asks the interviewer to open the session. Never shown to the learner. */
export const START_MESSAGE = "[START]";

export class MockInterview {
  static readonly DEFAULT_MINUTES = 30;

  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly typeId: string,
    readonly config: InterviewConfig,
    readonly transcript: ChatMessage[],
    readonly workspace: InterviewWorkspace | null,
    readonly scorecard: Scorecard | null,
    readonly score: number | null,
    readonly status: InterviewStatus,
    readonly createdAt: string,
  ) {}

  static fromRecord(record: InterviewRecord): MockInterview {
    return new MockInterview(
      record.id, record.user_id, record.type, record.config ?? {}, record.transcript ?? [], record.workspace,
      record.scorecard, record.score, record.status, record.created_at,
    );
  }

  get type(): InterviewType { return interviewById(this.typeId); }
  get title(): string { return this.config.title ?? this.typeId; }
  get isLive(): boolean { return this.status === "live"; }
  get isFinished(): boolean { return this.status === "done"; }
  get hasScore(): boolean { return this.score != null; }
  get durationSeconds(): number { return (this.config.minutes ?? MockInterview.DEFAULT_MINUTES) * 60; }
  get languageLabel(): string { return this.config.lang === "en" ? "English" : "עברית"; }
  get startedOn(): string { return this.createdAt.slice(0, 10); }

  finished(scorecard: Scorecard): MockInterview {
    return new MockInterview(this.id, this.userId, this.typeId, this.config, this.transcript, this.workspace, scorecard, scorecard.score, "done", this.createdAt);
  }
}

/** What the transcript looks like to the interviewer model and to the learner. */
export class InterviewTranscript {
  constructor(readonly messages: readonly ChatMessage[]) {}

  /** Learner answers so far, not counting the opening request or AI-assistant use. */
  get answerCount(): number {
    return this.messages.filter((message) => message.role === "user" && !message.tool && message.content !== START_MESSAGE).length;
  }

  /** Messages the learner sees (the opening request is hidden). */
  get visibleMessages(): ChatMessage[] {
    return this.messages.filter((message) => message.content !== START_MESSAGE);
  }

  /** The interviewer sees the candidate's AI-assistant use folded into the candidate's next message. */
  forInterviewer(): { role: "user" | "assistant"; content: string }[] {
    const turns: { role: "user" | "assistant"; content: string }[] = [];
    let pendingToolUse = "";
    for (const message of this.messages) {
      if (message.tool) {
        const who = message.role === "user" ? "candidate asked the AI assistant" : "AI assistant replied";
        pendingToolUse += `[AI-TOOL] ${who}: ${message.content}\n`;
        continue;
      }
      const content = message.role === "user" && pendingToolUse ? `${pendingToolUse}\n${message.content}` : message.content;
      turns.push({ role: message.role, content });
      if (message.role === "user") pendingToolUse = "";
    }
    return turns;
  }
}
