// The adaptive placement quiz at the end of onboarding. Each area gets two questions: it starts at the middle
// level; a right answer leads to the hard question, a wrong one to the easy one. The reached level per area
// (0-3) goes into the learner's profile and shapes their plan.
import type { PlacementQuestion, PlacementQuiz } from "./records";

const MIDDLE_LEVEL = 2, HARD_LEVEL = 3, EASY_LEVEL = 1;
export const QUESTIONS_PER_AREA = 2;

export class PlacementTest {
  private constructor(
    private readonly quiz: PlacementQuiz,
    private readonly areaIndex: number,
    /** Null while on an area's first question; otherwise whether the first one was right. */
    private readonly firstAnswerCorrect: boolean | null,
    readonly levelsByArea: Readonly<Record<string, number>>,
  ) {}

  static start(quiz: PlacementQuiz): PlacementTest {
    return new PlacementTest(quiz, 0, null, {});
  }

  get isFinished(): boolean { return this.areaIndex >= this.quiz.areas.length; }
  get currentArea(): string { return this.quiz.areas[this.areaIndex]; }
  get totalQuestions(): number { return this.quiz.areas.length * QUESTIONS_PER_AREA; }
  get answeredCount(): number { return this.areaIndex * QUESTIONS_PER_AREA + (this.firstAnswerCorrect == null ? 0 : 1); }
  get progressPercent(): number { return (this.answeredCount / this.totalQuestions) * 100; }

  get currentQuestion(): PlacementQuestion | null {
    if (this.isFinished) return null;
    const level = this.firstAnswerCorrect == null ? MIDDLE_LEVEL : this.firstAnswerCorrect ? HARD_LEVEL : EASY_LEVEL;
    const inArea = this.quiz.questions.filter((question) => question.area === this.currentArea);
    return inArea.find((question) => question.level === level) ?? inArea[0] ?? null;
  }

  /** Answer the current question (-1 means "I don't know") and move on. */
  answer(optionIndex: number): PlacementTest {
    const question = this.currentQuestion;
    if (!question) return this;
    const correct = optionIndex === question.answer;
    if (this.firstAnswerCorrect == null) return new PlacementTest(this.quiz, this.areaIndex, correct, this.levelsByArea);
    const reachedLevel = this.firstAnswerCorrect ? (correct ? 3 : 2) : correct ? 1 : 0;
    return new PlacementTest(this.quiz, this.areaIndex + 1, null, { ...this.levelsByArea, [this.currentArea]: reachedLevel });
  }
}
