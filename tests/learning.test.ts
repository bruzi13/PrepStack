import { describe, expect, it } from "vitest";
import { Calendar } from "@/domain/Calendar";
import { FormatSelector } from "@/domain/FormatSelector";
import { MasteryLevel } from "@/domain/MasteryLevel";
import { InterviewTranscript, START_MESSAGE } from "@/domain/MockInterview";
import { OnboardingQuestionnaire } from "@/domain/OnboardingQuestionnaire";
import { PlacementTest } from "@/domain/PlacementTest";
import type { PlacementQuiz, TopicRecord } from "@/domain/records";
import { SpacedRepetitionScheduler } from "@/domain/SpacedRepetitionScheduler";
import { Topic } from "@/domain/Topic";
import { TopicList } from "@/domain/TopicList";

function topicRecord(overrides: Partial<TopicRecord> = {}): TopicRecord {
  return {
    id: "t", user_id: "u", plan_id: "p", track: "main", module: "m", title: "x", description: "", kind: "concept", ord: 0, priority: 1,
    est_minutes: 30, status: "todo", mastery: 0, reviews: 0, interval_days: 0, next_review: null, last_score: null, created_at: "", ...overrides,
  };
}
const topic = (overrides: Partial<TopicRecord> = {}) => Topic.fromRecord(topicRecord(overrides));

describe("SpacedRepetitionScheduler", () => {
  const scheduler = new SpacedRepetitionScheduler();

  it("a first strong test sets mastery and a long interval", () => {
    const progress = scheduler.progressAfterTest(topic(), 90);
    expect(progress.mastery).toBe(90);
    expect(progress.reviewIntervalDays).toBeGreaterThanOrEqual(4);
    expect(progress.status).toBe("done");
  });
  it("a weak test brings the topic back tomorrow", () => {
    expect(scheduler.progressAfterTest(topic({ reviews: 2, mastery: 80, interval_days: 10 }), 40).reviewIntervalDays).toBe(1);
  });
  it("intervals never exceed 60 days", () => {
    expect(scheduler.progressAfterTest(topic({ reviews: 5, mastery: 95, interval_days: 50 }), 100).reviewIntervalDays).toBe(SpacedRepetitionScheduler.MAX_INTERVAL_DAYS);
  });
  it("a topic with progress applied is due on its review date", () => {
    const progress = scheduler.progressAfterTest(topic(), 30);
    const updated = topic().withProgress(progress);
    expect(updated.isStudied).toBe(true);
    expect(updated.isDueForReview(Calendar.daysFromToday(1))).toBe(true);
    expect(updated.isDueForReview(Calendar.today())).toBe(false);
  });
});

describe("MasteryLevel", () => {
  it("an unstudied topic reads as not learned", () => {
    expect(MasteryLevel.of(0, 0)).toBe(MasteryLevel.NOT_STUDIED);
    expect(topic().masteryLevel.label).toBe("לא נלמד");
  });
  it("grades studied topics by mastery", () => {
    expect(MasteryLevel.of(90, 1)).toBe(MasteryLevel.STRONG);
    expect(MasteryLevel.of(20, 1)).toBe(MasteryLevel.NEEDS_WORK);
  });
});

describe("TopicList", () => {
  const list = new TopicList([
    topic({ id: "a", ord: 2, priority: 1, mastery: 80, reviews: 1, next_review: "2000-01-01", module: "SD" }),
    topic({ id: "b", ord: 1, priority: 3, mastery: 20, reviews: 1, next_review: "2000-01-01", module: "SD" }),
    topic({ id: "c", ord: 3, module: "DB" }),
    topic({ id: "d", ord: 0, track: "ai", module: "AI" }),
  ]);
  it("lists due reviews weakest first", () => {
    expect(list.dueForReview().map((item) => item.id)).toEqual(["b", "a"]);
  });
  it("suggests the next unstudied topic on the main track first", () => {
    expect(list.nextToStudy()?.id).toBe("c");
  });
  it("weights readiness by priority", () => {
    // (80*3 + 20*1 + 0*3) / 7 = 37
    expect(list.onTrack("main").readiness()).toBe(37);
  });
  it("filters out suggestions already in the plan", () => {
    expect(new TopicList([topic({ title: "Caching" })]).withoutExisting([{ title: "Caching" }, { title: "Queues" }])).toEqual([{ title: "Queues" }]);
  });
});

describe("FormatSelector", () => {
  it("always returns a known format and a reason", () => {
    const choice = new FormatSelector([]).choose("concept");
    expect(choice.format).toBeTruthy();
    expect(choice.reason.length).toBeGreaterThan(0);
  });
  it("respects excluded formats", () => {
    for (let attempt = 0; attempt < 20; attempt++) expect(new FormatSelector([]).choose("coding", ["socratic"]).format).not.toBe("socratic");
  });
  it("reports when the favourite format is not the one that scores best", () => {
    const insights = new FormatSelector([
      { format: "socratic", topicKind: "concept", score: 90, rating: 2 }, { format: "socratic", topicKind: "concept", score: 85, rating: 2 },
      { format: "visual_story", topicKind: "concept", score: 50, rating: 5 }, { format: "visual_story", topicKind: "concept", score: 55, rating: 5 },
    ]).insights();
    expect(insights.bestByScore?.format).toBe("socratic");
    expect(insights.bestByRating?.format).toBe("visual_story");
    expect(insights.feelingDiffersFromResults).toBe(true);
  });
});

describe("PlacementTest", () => {
  const quiz: PlacementQuiz = {
    areas: ["A"],
    questions: [1, 2, 3].map((level) => ({ id: `A${level}`, area: "A", level, question: `q${level}`, options: ["right", "wrong"], answer: 0, explain: "" })),
  };
  it("starts in the middle and goes up after a right answer", () => {
    const afterRight = PlacementTest.start(quiz).answer(0);
    expect(afterRight.currentQuestion?.level).toBe(3);
    const finished = afterRight.answer(0);
    expect(finished.isFinished).toBe(true);
    expect(finished.levelsByArea).toEqual({ A: 3 });
  });
  it("goes down after a wrong answer", () => {
    const afterWrong = PlacementTest.start(quiz).answer(1);
    expect(afterWrong.currentQuestion?.level).toBe(1);
    expect(afterWrong.answer(1).levelsByArea).toEqual({ A: 0 });
  });
});

describe("OnboardingQuestionnaire", () => {
  it("skips the current-stack step for career switchers and adds the new-stack step on request", () => {
    expect(new OnboardingQuestionnaire({ occupation: "switcher" }, "x").steps).not.toContain("stack");
    expect(new OnboardingQuestionnaire({ improve: ["new_stack"] }, "x").steps).toContain("newStack");
  });
  it("needs a name and an occupation before continuing", () => {
    expect(new OnboardingQuestionnaire({ occupation: "developer" }, " ").canContinueFrom("who")).toBe(false);
    expect(new OnboardingQuestionnaire({ occupation: "developer" }, "נועה").canContinueFrom("who")).toBe(true);
  });
});

describe("InterviewTranscript", () => {
  it("folds AI-assistant use into the candidate's next message and hides the opening request", () => {
    const transcript = new InterviewTranscript([
      { role: "user", content: START_MESSAGE }, { role: "assistant", content: "hi" },
      { role: "user", content: "write a loop", tool: true }, { role: "assistant", content: "for(;;)", tool: true },
      { role: "user", content: "my answer" },
    ]);
    const turns = transcript.forInterviewer();
    expect(turns).toHaveLength(3);
    expect(turns[2].content).toContain("[AI-TOOL] candidate asked the AI assistant: write a loop");
    expect(turns[2].content).toContain("my answer");
    expect(transcript.answerCount).toBe(1);
    expect(transcript.visibleMessages[0].content).toBe("hi");
  });
});
