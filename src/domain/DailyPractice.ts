// Today's short practice session: mistakes that are due come first, then the session is topped up with
// questions and cards from lessons the learner already finished, mixed across topics (interleaving).
import { Calendar } from "./Calendar";
import type { Lesson } from "./Lesson";
import { Mistake } from "./Mistake";
import type { MistakeKind } from "./records";

export interface PracticeItem {
  /** Stable within a session (React key). */
  key: string;
  origin: "mistake" | "lesson";
  mistakeId: string | null;
  topicId: string | null;
  topicTitle: string;
  kind: MistakeKind;
  prompt: string;
  options: string[];
  correctOption: number | null;
  answer: string;
  explanation: string;
}

export class DailyPractice {
  static readonly SESSION_SIZE = 8;

  private constructor(readonly items: PracticeItem[]) {}

  /**
   * @param random  injectable for tests; defaults to Math.random
   */
  static build(mistakes: Mistake[], lessons: Lesson[], today = Calendar.today(), random: () => number = Math.random): DailyPractice {
    const due = mistakes
      .filter((mistake) => mistake.isDue(today))
      .sort((a, b) => (a.dueOn === b.dueOn ? a.box - b.box : a.dueOn < b.dueOn ? -1 : 1))
      .slice(0, DailyPractice.SESSION_SIZE)
      .map(DailyPractice.fromMistake);

    const room = DailyPractice.SESSION_SIZE - due.length;
    const known = new Set(mistakes.map((mistake) => mistake.fingerprint));
    const fromLessons = room > 0 ? DailyPractice.lessonCards(lessons, known, random).slice(0, room) : [];
    return new DailyPractice(DailyPractice.interleave([...due, ...fromLessons]));
  }

  get isEmpty(): boolean { return this.items.length === 0; }
  get dueMistakeCount(): number { return this.items.filter((item) => item.origin === "mistake").length; }

  private static fromMistake(mistake: Mistake): PracticeItem {
    return {
      key: `m:${mistake.id}`, origin: "mistake", mistakeId: mistake.id, topicId: mistake.topicId, topicTitle: mistake.topicTitle,
      kind: mistake.isChoice ? "choice" : "recall", prompt: mistake.prompt, options: mistake.options, correctOption: mistake.correctOption,
      answer: mistake.answer, explanation: mistake.explanation,
    };
  }

  /** In-lesson check questions and flashcards from finished lessons, one random pick per lesson per round. */
  private static lessonCards(lessons: Lesson[], known: Set<string>, random: () => number): PracticeItem[] {
    const perLesson = lessons.filter((lesson) => lesson.isCompleted).map((lesson) => {
      const cards: PracticeItem[] = [];
      lesson.content.blocks.forEach((block, blockIndex) => {
        if (block.type === "check" && block.question && block.options.length > 1) {
          cards.push({
            key: `l:${lesson.id}:${blockIndex}`, origin: "lesson", mistakeId: null, topicId: lesson.topicId, topicTitle: lesson.title,
            kind: "choice", prompt: block.question, options: block.options, correctOption: block.answer,
            answer: block.options[block.answer] ?? "", explanation: block.explain,
          });
        }
        if (block.type === "flashcards") {
          block.cards.forEach((card, cardIndex) => cards.push({
            key: `l:${lesson.id}:${blockIndex}:${cardIndex}`, origin: "lesson", mistakeId: null, topicId: lesson.topicId,
            topicTitle: lesson.title, kind: "recall", prompt: card.q, options: [], correctOption: null, answer: card.a, explanation: "",
          }));
        }
      });
      return DailyPractice.shuffle(cards.filter((card) => !known.has(Mistake.fingerprint(card.topicId, card.prompt))), random);
    }).filter((cards) => cards.length > 0);

    const picked: PracticeItem[] = [];
    for (let round = 0; perLesson.some((cards) => cards.length > round); round++) {
      for (const cards of DailyPractice.shuffle(perLesson, random)) if (cards[round]) picked.push(cards[round]);
    }
    return picked;
  }

  /** Avoid two items of the same topic in a row where possible. */
  private static interleave(items: PracticeItem[]): PracticeItem[] {
    const byTopic = new Map<string, PracticeItem[]>();
    for (const item of items) {
      const key = item.topicId ?? item.topicTitle;
      byTopic.set(key, [...(byTopic.get(key) ?? []), item]);
    }
    const queues = [...byTopic.values()];
    const result: PracticeItem[] = [];
    while (queues.some((queue) => queue.length)) for (const queue of queues) { const next = queue.shift(); if (next) result.push(next); }
    return result;
  }

  private static shuffle<T>(items: T[], random: () => number): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }
}
