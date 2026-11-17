// The mistakes notebook and the daily practice session: collecting what the learner got wrong
// (lesson tests, the grader's review, mock interviews), and bringing it back until it sticks.
import type { LessonRepository } from "@/data/repositories/LessonRepository";
import type { MistakeRepository } from "@/data/repositories/MistakeRepository";
import { DailyPractice, type PracticeItem } from "@/domain/DailyPractice";
import type { Lesson } from "@/domain/Lesson";
import { Mistake, type NewMistake } from "@/domain/Mistake";
import type { MockInterview } from "@/domain/MockInterview";
import type { Scorecard, TestOutcome } from "@/domain/records";
import type { Topic } from "@/domain/Topic";

/** Review issues of these severities go to the notebook; minor ones would only add noise. */
const NOTEBOOK_SEVERITIES = new Set(["critical", "major"]);
/** At most this many key moments from one interview. */
const MAX_INTERVIEW_ENTRIES = 3;

export class PracticeService {
  constructor(private readonly mistakes: MistakeRepository, private readonly lessons: LessonRepository) {}

  async todaysSession(userId: string): Promise<DailyPractice> {
    const [mistakes, lessons] = await Promise.all([this.mistakes.listForUser(userId), this.lessons.listForUser(userId)]);
    return DailyPractice.build(mistakes, lessons);
  }

  notebook(userId: string): Promise<Mistake[]> {
    return this.mistakes.listForUser(userId);
  }

  /** Record one answer in today's session. A missed lesson card becomes a new notebook entry. */
  async recordAnswer(userId: string, item: PracticeItem, correct: boolean): Promise<void> {
    if (item.mistakeId) {
      const mistake = await this.mistakes.findById(item.mistakeId);
      if (mistake) await this.mistakes.saveProgress(mistake, mistake.progressAfterAnswer(correct));
      return;
    }
    if (!correct) {
      await this.add(userId, [{
        topicId: item.topicId, topicTitle: item.topicTitle, source: "practice", kind: item.kind, prompt: item.prompt,
        answer: item.answer, explanation: item.explanation, options: item.options, correctOption: item.correctOption,
      }]);
    }
  }

  setResolved(mistake: Mistake, resolved: boolean): Promise<void> {
    return this.mistakes.setResolved(mistake, resolved);
  }

  remove(mistake: Mistake): Promise<void> {
    return this.mistakes.remove(mistake.id);
  }

  /** After a lesson test: wrong multiple-choice answers and the grader's serious issues. */
  captureFromTest(userId: string, topic: Topic, lesson: Lesson, submission: Record<string, unknown>, outcome: TestOutcome): Promise<void> {
    const entries: NewMistake[] = [];
    const answers = Array.isArray(submission.answers) ? submission.answers : [];
    if (lesson.test.type === "quiz") {
      lesson.test.quiz.forEach((question, index) => {
        if (answers[index] === question.answer) return;
        entries.push({
          topicId: topic.id, topicTitle: topic.title, source: "test", kind: "choice", prompt: question.question,
          answer: question.options[question.answer] ?? "", explanation: question.explain, options: question.options, correctOption: question.answer,
        });
      });
    }
    for (const issue of outcome.review?.issues ?? []) {
      if (!NOTEBOOK_SEVERITIES.has(issue.severity)) continue;
      entries.push({ topicId: topic.id, topicTitle: topic.title, source: "review", kind: "recall", prompt: issue.point, answer: issue.fix, explanation: "" });
    }
    return this.add(userId, entries);
  }

  /** After a mock interview: the key moments, each with the stronger answer. */
  captureFromInterview(interview: MockInterview, scorecard: Scorecard): Promise<void> {
    const entries: NewMistake[] = scorecard.moments.slice(0, MAX_INTERVIEW_ENTRIES).map((moment) => ({
      topicId: null, topicTitle: interview.config.title ?? "ראיון", source: "interview", kind: "recall",
      prompt: moment.quote ? `"${moment.quote}" · ${moment.feedback}` : moment.feedback, answer: moment.better, explanation: "",
    }));
    return this.add(interview.userId, entries);
  }

  /** Add entries; one the notebook already has goes back to the first box instead of being duplicated. */
  private async add(userId: string, entries: NewMistake[]): Promise<void> {
    if (!entries.length) return;
    const existing = new Map((await this.mistakes.listForUser(userId)).map((mistake) => [mistake.fingerprint, mistake]));
    const fresh: NewMistake[] = [];
    for (const entry of entries) {
      const previous = existing.get(Mistake.fingerprint(entry.topicId, entry.prompt));
      if (previous) await this.mistakes.saveProgress(previous, Mistake.repeatedProgress(previous));
      else fresh.push(entry);
    }
    await this.mistakes.create(userId, fresh);
  }
}
