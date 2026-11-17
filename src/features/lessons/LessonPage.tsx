// A lesson from start to finish: prepare it in the format that suits this learner, teach it, test it, show the
// grade, collect feedback.
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMATS, TEST_LABEL, type FormatId } from "@shared/catalog";
import { useServices } from "@/app/AppContext";
import type { TestKind } from "@/ai/AiEngine";
import type { Lesson } from "@/domain/Lesson";
import type { TestOutcome } from "@/domain/records";
import type { Topic } from "@/domain/Topic";
import type { LessonRequest } from "@/services/StudyService";
import { CodeLab } from "@/components/CodeLab";
import { ErrorMessage, GradingReviewView, LessonStageIndicator, Loading, TimedProgressSteps } from "@/components/ui";
import { LessonBlockView } from "./LessonBlocks";
import { LessonFeedbackForm } from "./LessonFeedbackForm";
import { ArchitectureTestView, PracticalTestView, QuizTest } from "./LessonTests";
import { TutorChat } from "./TutorChat";

const PREPARATION_STEPS = ["בוחרים את דרך ההוראה שמתאימה לכם", "כותבים את השיעור לרמה ולסטאק שלכם", "מכינים דוגמאות ותרגילים", "בונים את המבחן המסכם"];

type Stage = "loading" | "preparing" | "learning" | "testing" | "grading" | "result";

/** Which of the three stages the indicator shows. */
const STAGE_INDEX: Record<Stage, 0 | 1 | 2> = { loading: 0, preparing: 0, learning: 0, testing: 1, grading: 1, result: 2 };

export default function LessonPage() {
  const { topicId } = useParams();
  const { study } = useServices();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [nextTopic, setNextTopic] = useState<Topic | null>(null);
  const [isReview, setIsReview] = useState(false);
  const lessonStartedAt = useRef(Date.now());

  function beginLearning(ready: Lesson) {
    setLesson(ready);
    lessonStartedAt.current = Date.now();
    setStage("learning");
  }

  async function prepare(work: () => Promise<Lesson>) {
    setStage("preparing"); setError("");
    try { beginLearning(await work()); } catch (failure) { setError((failure as Error).message); }
  }

  const startLesson = (forTopic: Topic, request?: LessonRequest) => prepare(() => study.startLesson(forTopic, request));

  // Open the topic: continue an unfinished lesson if there is one, otherwise prepare a new one.
  useEffect(() => {
    let mounted = true;
    (async () => {
      setStage("loading"); setOutcome(null); setLesson(null);
      const found = await study.findTopic(topicId ?? "");
      if (!mounted) return;
      if (!found) { setError("הנושא לא נמצא."); return; }
      setTopic(found); setIsReview(found.isStudied);
      const unfinished = await study.findUnfinishedLesson(found);
      if (!mounted) return;
      if (unfinished) beginLearning(unfinished); else void startLesson(found);
    })().catch((failure: Error) => mounted && setError(failure.message));
    return () => { mounted = false; };
    // Only a new topic id restarts the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  function switchFormat(chosenFormat?: FormatId) {
    if (topic && lesson) void prepare(() => study.switchFormat(topic, lesson, chosenFormat));
  }

  async function submitTest(kind: TestKind, submission: Record<string, unknown>) {
    if (!topic || !lesson) return;
    setStage("grading"); setError("");
    try {
      const result = await study.submitTest(topic, lesson, kind, submission, lessonStartedAt.current);
      setTopic(result.topic);
      setNextTopic(result.nextTopic);
      setOutcome(result.outcome);
      setStage("result");
    } catch (failure) {
      setError((failure as Error).message);
      setStage("testing");
    }
  }

  function startTest() { setStage("testing"); window.scrollTo(0, 0); }

  if (error && stage !== "testing") {
    return (
      <div className="page">
        <ErrorMessage message={error} onRetry={topic ? () => void startLesson(topic) : undefined} />
        <Link to="/plan" className="link">חזרה לתוכנית</Link>
      </div>
    );
  }
  if (stage === "loading" || !topic) return <Loading label="טוען…" />;
  if (stage === "preparing" || !lesson) {
    return <div className="page lesson"><TimedProgressSteps title={`מכינים את השיעור: ${topic.title}`} steps={PREPARATION_STEPS} /></div>;
  }

  const content = lesson.content, test = lesson.test;
  return (
    <div className="page lesson">
      <Link to={topic.planPath} className="link">→ לתוכנית</Link>
      <div className="page-head">
        <h1>{content.title || topic.title}</h1>
        <p className="muted">{topic.moduleName} · {topic.kindLabel}{isReview ? " · שיעור חזרה" : ""}</p>
      </div>
      <LessonStageIndicator stage={STAGE_INDEX[stage]} />

      {stage === "learning" && <>
        <FormatSwitcher current={lesson} onSwitch={switchFormat} />
        {lesson.personalNote?.note && <aside className="card personal-note" aria-label="הערה אישית"><b>במיוחד בשבילך</b><p>{lesson.personalNote.note}</p></aside>}
        <p className="intro">{content.intro}</p>
        {content.blocks.map((block, index) => <LessonBlockView key={index} block={block} />)}
        {content.takeaways.length > 0 && <div className="card takeaways">
          <h3>סיכום</h3><ul>{content.takeaways.map((takeaway, index) => <li key={index}>{takeaway}</li>)}</ul>
          {content.interview_tips?.length > 0 && <><h4>בראיון</h4><ul>{content.interview_tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></>}
        </div>}
        <TutorChat topicTitle={topic.title} />
        <div className="card cta"><b>{TEST_LABEL[test.type]}</b><button className="btn primary big" onClick={startTest}>התחלה</button></div>
      </>}

      {(stage === "testing" || stage === "grading") && <>
        <ErrorMessage message={error} />
        {stage === "grading" && <Loading label="בודק…" />}
        <div style={{ display: stage === "grading" ? "none" : undefined }}>
          <button className="link" onClick={() => setStage("learning")}>→ לשיעור</button>
          {test.type === "quiz" && <QuizTest test={test} onSubmit={(answers, openAnswer) => submitTest("quiz", { answers, open: openAnswer })} />}
          {test.type === "code" && <CodeLab test={test.code} busy={false} onSubmit={(submission) => submitTest("code", { ...submission })} />}
          {test.type === "architecture" && <ArchitectureTestView test={test.architecture} onSubmit={(canvas) => submitTest("architecture", { ...canvas })} />}
          {test.type === "practical" && <PracticalTestView test={test.practical} onSubmit={(answer) => submitTest("practical", { answer })} />}
        </div>
      </>}

      {stage === "result" && outcome && <>
        <div className="card">
          <GradingReviewView review={outcome.review} score={outcome.score} extra={outcome.extra && <small className="muted">{outcome.extra}</small>} />
          <p className="muted">שליטה: {Math.round(topic.mastery)}{topic.nextReviewDate ? ` · חזרה הבאה ${topic.nextReviewDate}` : ""}</p>
        </div>
        <LessonFeedbackForm lesson={lesson} />
        <div className="row">
          {nextTopic && <Link className="btn primary" to={`/lesson/${nextTopic.id}`}>לשיעור הבא: {nextTopic.title}</Link>}
          <Link className="btn" to="/">ללוח הבקרה</Link>
        </div>
      </>}
    </div>
  );
}

function FormatSwitcher({ current, onSwitch }: { current: Lesson; onSwitch: (format?: FormatId) => void }) {
  return (
    <div className="format-bar">
      <span className="muted">{current.formatName}</span>
      <details className="switch"><summary>החלפת פורמט</summary>
        <div className="chips">
          <button className="chip" onClick={() => onSwitch()}>אקראי</button>
          {FORMATS.filter((format) => format.id !== current.format).map((format) => (
            <button key={format.id} className="chip" title={format.blurb} onClick={() => onSwitch(format.id)}>{format.name}</button>
          ))}
        </div>
      </details>
    </div>
  );
}
