// Mock interviews: starting one, each chat turn, the AI assistant inside the AI-assisted round, and the debrief.
import type { InterviewType } from "@shared/catalog";
import type { AiEngine } from "@/ai/AiEngine";
import type { InterviewRepository } from "@/data/repositories/InterviewRepository";
import type { LearnerProfile } from "@/domain/LearnerProfile";
import { InterviewTranscript, type MockInterview } from "@/domain/MockInterview";
import type { ChatMessage, InterviewWorkspace, Scorecard } from "@/domain/records";

/** A short interview takes this fraction of the full time. */
const SHORT_INTERVIEW_DIVISOR = 2.5;

export interface InterviewSetup { level: string; lang: string; company: string; short: boolean }

export class InterviewService {
  constructor(private readonly ai: AiEngine, private readonly interviews: InterviewRepository) {}

  static minutesFor(type: InterviewType, short: boolean): number {
    return short ? Math.round(type.minutes / SHORT_INTERVIEW_DIVISOR) : type.minutes;
  }

  listRecent(userId: string, limit = 20): Promise<MockInterview[]> {
    return this.interviews.listRecent(userId, limit);
  }

  find(interviewId: string): Promise<MockInterview | null> {
    return this.interviews.findById(interviewId);
  }

  start(profile: LearnerProfile, type: InterviewType, setup: InterviewSetup): Promise<MockInterview> {
    return this.interviews.create(profile.userId, type.id, {
      ...setup, title: type.title, minutes: InterviewService.minutesFor(type, setup.short), role: profile.roleTitle, stack: profile.stack,
    });
  }

  /** One interviewer turn: stream the reply, then save the transcript and workspace. Returns the new transcript. */
  async interviewerTurn(
    interview: MockInterview, transcript: ChatMessage[], workspace: InterviewWorkspace, workspaceText: string, onText: (text: string) => void,
  ): Promise<ChatMessage[]> {
    const reply = await this.ai.chat({
      mode: "interview", type: interview.typeId, config: { ...interview.config }, workspace: workspaceText,
      messages: new InterviewTranscript(transcript).forInterviewer(),
    }, onText);
    const updated: ChatMessage[] = [...transcript, { role: "assistant", content: reply }];
    await this.interviews.saveProgress(interview.id, updated, workspace);
    return updated;
  }

  /** A question to the AI coding assistant (AI-assisted round). Both sides are marked as tool use. */
  async askAssistant(interview: MockInterview, transcript: ChatMessage[], question: string, code: string, onText: (text: string) => void): Promise<ChatMessage[]> {
    const withQuestion: ChatMessage[] = [...transcript, { role: "user", content: question, tool: true }];
    const prompt = code.trim() ? `${question}\n\nCurrent code:\n${code}` : question;
    const reply = await this.ai.chat({ mode: "pair", config: { ...interview.config }, messages: [{ role: "user", content: prompt }] }, onText);
    const updated: ChatMessage[] = [...withQuestion, { role: "assistant", content: reply, tool: true }];
    await this.interviews.saveProgress(interview.id, updated);
    return updated;
  }

  /** Save the final transcript and workspace (the server reads them), then get the scorecard. */
  async finish(interview: MockInterview, transcript: ChatMessage[], workspace: InterviewWorkspace): Promise<MockInterview> {
    await this.interviews.saveProgress(interview.id, transcript, workspace);
    const scorecard: Scorecard = await this.ai.runJob("debrief", { interviewId: interview.id });
    await this.interviews.saveScorecard(interview.id, scorecard);
    return interview.finished(scorecard);
  }
}
