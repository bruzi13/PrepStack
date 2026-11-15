// A lesson from start to finish: pick the format for this learner, generate the lesson, teach it,
// test it, grade the test, collect feedback, and update what we know about the learner.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMATS, formatById, KIND_LABEL, TEST_LABEL, type FormatId } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { chooseFormat, observations, type Choice } from "@/learning/adapt";
import { chat, formatPriors, runJob } from "@/services/ai";
import { profileBrief } from "@/services/plans";
import { afterTest } from "@/learning/srs";
import { db } from "@/services/store";
import type { Attempt, Block, Canvas, ChatMsg, Feedback, Lesson, LessonContent, Review, Topic } from "@/types";
import { ArchCanvas, emptyCanvas } from "@/components/ArchCanvas";
import { ChatBox } from "@/components/ChatBox";
import { CodeLab, type CodeSubmission } from "@/components/CodeLab";
import { Busy, Diagram, ErrorBox, Md, ReviewView } from "@/components/ui";

const GEN_STEPS = ["בוחרים את דרך ההוראה שמתאימה לכם…", "כותבים את השיעור לרמה ולסטאק שלכם…", "מכינים דוגמאות ותרגילים…", "בונים את המבחן המסכם… (בערך דקה)"];
const WANTED = ["יותר דוגמאות", "יותר תרשימים", "יותר תרגול", "יותר עומק", "קצר יותר", "קצב איטי יותר"];

export default function LessonPage() {
  const { topicId } = useParams();
  const { user, profile } = useMe();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [stage, setStage] = useState<"loading" | "generating" | "learn" | "test" | "grading" | "result">("loading");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ score: number; review: Review | null; extra?: string } | null>(null);
  const [nextTopic, setNextTopic] = useState<Topic | null>(null);
  const started = useRef(Date.now());
  const [isReview, setIsReview] = useState(false);

  const generate = useCallback(async (t: Topic, force?: FormatId, exclude: FormatId[] = []) => {
    setStage("generating"); setErr("");
    try {
      const eq = { user_id: user.id };
      const [lessons, feedback, priors, attempts] = await Promise.all([
        db.list<Lesson>("prep_lessons", { eq }), db.list<Feedback>("prep_feedback", { eq }), formatPriors().catch(() => []),
        db.list<Attempt>("prep_attempts", { eq: { topic_id: t.id }, order: "created_at", asc: false, limit: 1 }),
      ]);
      const c = chooseFormat(observations(lessons, feedback), t.kind, priors, exclude);
      const format = force ?? c.format;
      const picked: Choice = force ? { ...c, format, reason: "בחרתם בפורמט הזה בעצמכם." } : c;
      const content = await runJob<LessonContent>("lesson", {
        topic: { title: t.title, description: t.description, kind: t.kind, module: t.module }, format,
        profile: profileBrief(profile), mastery: t.mastery, review: t.reviews > 0,
        weak_points: attempts[0]?.review?.issues?.map((x) => x.point) ?? [],
      }, user.id);
      const [row] = await db.insert<Lesson>("prep_lessons", {
        user_id: user.id, topic_id: t.id, topic_kind: t.kind, format, content, status: "ready",
        choice: { reason: picked.reason, manual: !!force, table: picked.table.map((r) => ({ format: r.format, n: r.n, mean: +r.mean.toFixed(3), sampled: +r.sampled.toFixed(3) })) },
      });
      setChoice(picked); setLesson(row); started.current = Date.now(); setStage("learn");
    } catch (e) { setErr((e as Error).message); }
  }, [user.id, profile]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStage("loading"); setResult(null); setLesson(null);
      const [t] = await db.list<Topic>("prep_topics", { eq: { id: topicId } });
      if (!alive) return;
      if (!t) { setErr("הנושא לא נמצא."); return; }
      setTopic(t); setIsReview(t.reviews > 0);
      const ready = (await db.list<Lesson>("prep_lessons", { eq: { topic_id: t.id, status: "ready" }, order: "created_at", asc: false, limit: 1 }))[0];
      if (!alive) return;
      if (ready) { setLesson(ready); setChoice(null); started.current = Date.now(); setStage("learn"); }
      else generate(t);
    })().catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  async function switchFormat(f?: FormatId) {
    if (!topic || !lesson) return;
    await db.remove("prep_lessons", { id: lesson.id });
    generate(topic, f, f ? [] : [lesson.format]);
  }

  /** Save the outcome everywhere it matters: the attempt, the lesson, and the topic's mastery and next review date. */
  async function finish(kind: string, submission: unknown, score: number, review: Review | null, extra?: string) {
    if (!topic || !lesson) return;
    const minutes = Math.min(120, (Date.now() - started.current) / 60000);
    await db.insert("prep_attempts", { user_id: user.id, lesson_id: lesson.id, topic_id: topic.id, kind, submission, score, review });
    await db.update("prep_lessons", lesson.id, { status: "done", score, minutes, completed_at: new Date().toISOString() });
    const patch = afterTest(topic, score);
    await db.update("prep_topics", topic.id, patch);
    setTopic({ ...topic, ...patch } as Topic);
    const rest = await db.list<Topic>("prep_topics", { eq: { plan_id: topic.plan_id }, order: "ord" });
    setNextTopic(rest.find((t) => t.reviews === 0 && t.id !== topic.id) ?? null);
    setResult({ score, review, extra }); setStage("result");
  }

  async function grade(kind: string, submission: Record<string, unknown>, combine?: (r: Review) => { score: number; extra?: string }) {
    if (!topic || !lesson) return;
    setStage("grading"); setErr("");
    try {
      const review = await runJob<Review>("grade", { kind, topic: { title: topic.title }, profile: profileBrief(profile), test: testFor(lesson.content, kind), submission }, user.id);
      const c = combine ? combine(review) : { score: review.score };
      await finish(kind, submission, Math.round(c.score), review, c.extra);
    } catch (e) { setErr((e as Error).message); setStage("test"); }
  }

  if (err && stage !== "test") return <div className="page"><ErrorBox msg={err} retry={topic ? () => generate(topic) : undefined} /><Link to="/plan" className="link">חזרה לתוכנית</Link></div>;
  if (stage === "loading" || !topic) return <Busy label="טוען…" />;
  if (stage === "generating" || !lesson) return <Busy label={`מכינים את השיעור: ${topic.title}`} steps={GEN_STEPS} />;

  const c = lesson.content, fmt = formatById(lesson.format), test = c.test;
  const reason = choice?.reason ?? (lesson.choice as { reason?: string } | null)?.reason;

  return (
    <div className="page lesson">
      <Link to={topic.track === "ai" ? "/ai" : "/plan"} className="link">→ חזרה לתוכנית</Link>
      <div className="page-head">
        <h1>{c.title || topic.title}</h1>
        <p className="muted">{topic.module} · {KIND_LABEL[topic.kind]}{isReview ? " · שיעור חזרה" : ""}</p>
      </div>

      {stage === "learn" && <>
        <div className="card format-card">
          <div><b>{fmt.icon} פורמט השיעור: {fmt.name}</b><div className="muted">{reason ?? fmt.blurb}</div></div>
          <details className="switch"><summary>פורמט אחר</summary>
            <div className="chips">
              <button className="chip" onClick={() => switchFormat()}>🎲 תבחרו לי אחר</button>
              {FORMATS.filter((f) => f.id !== lesson.format).map((f) => <button key={f.id} className="chip" title={f.blurb} onClick={() => switchFormat(f.id)}>{f.icon} {f.name}</button>)}
            </div>
          </details>
        </div>
        <p className="intro">{c.intro}</p>
        {c.blocks.map((b, i) => <BlockView key={i} b={b} />)}
        {c.takeaways.length > 0 && <div className="card takeaways"><h3>מה לקחת מהשיעור</h3><ul>{c.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {c.interview_tips?.length > 0 && <><h4>איך זה עולה בראיון</h4><ul>{c.interview_tips.map((t, i) => <li key={i}>{t}</li>)}</ul></>}</div>}
        <Tutor topic={topic.title} />
        <div className="card cta"><div><b>מוכנים? {TEST_LABEL[test.type]}</b><div className="muted">המבחן קובע את רמת השליטה שלכם בנושא ומתי תחזרו אליו.</div></div><button className="btn primary big" onClick={() => { setStage("test"); window.scrollTo(0, 0); }}>למבחן</button></div>
      </>}

      {(stage === "test" || stage === "grading") && <>
        <ErrorBox msg={err} />
        {stage === "grading" && <Busy label="בודקים את התשובה שלכם" steps={["קוראים את ההגשה…", "משווים לרובריקה של מראיין…", "כותבים ביקורת מפורטת…"]} />}
        <div style={{ display: stage === "grading" ? "none" : undefined }}>
          <button className="link" onClick={() => setStage("learn")}>→ חזרה לשיעור</button>
          {test.type === "quiz" && <QuizTest test={test} onDone={(answers, open, mcq) => {
            const sub = { answers, open, mcq_percent: mcq };
            if (test.open_question && open.trim()) grade("quiz", sub, (r) => ({ score: 0.7 * mcq + 0.3 * r.score, extra: `שאלות אמריקאיות: ${Math.round(mcq)} · שאלה פתוחה: ${r.score}` }));
            else finish("quiz", sub, Math.round(test.open_question ? 0.7 * mcq : mcq), null, test.open_question ? "לא ענית על השאלה הפתוחה (30% מהציון)." : undefined);
          }} />}
          {test.type === "code" && <CodeLab test={test.code} busy={false} onSubmit={(s: CodeSubmission) => grade("code", s as unknown as Record<string, unknown>, (r) => ({ score: r.score, extra: `${s.passed}/${s.total} בדיקות עברו` }))} />}
          {test.type === "architecture" && <ArchTest test={test.architecture} onSubmit={(canvas) => grade("architecture", canvas as unknown as Record<string, unknown>)} />}
          {test.type === "practical" && <PracticalTest test={test.practical} onSubmit={(answer) => grade("practical", { answer })} />}
        </div>
      </>}

      {stage === "result" && result && <>
        <div className="card"><ReviewView review={result.review} score={result.score} extra={result.extra && <small className="muted">{result.extra}</small>} />
          <p className="muted">רמת השליטה בנושא עכשיו: {Math.round(topic.mastery)}. {topic.next_review && `נחזור אליו לתרגול קצר ב-${topic.next_review}.`}</p></div>
        <FeedbackForm lesson={lesson} />
        <div className="row">
          {nextTopic && <Link className="btn primary" to={`/lesson/${nextTopic.id}`}>לשיעור הבא: {nextTopic.title}</Link>}
          <Link className="btn" to="/">ללוח הבקרה</Link>
        </div>
      </>}
    </div>
  );
}

/** Only the part of the test the grader needs (and never the reference solution's tests verbatim for quiz). */
function testFor(c: LessonContent, kind: string) {
  const t = c.test;
  return kind === "quiz" ? { open_question: t.open_question, open_rubric: t.open_rubric }
    : kind === "code" ? { title: t.code.title, statement: t.code.statement, reference_js: t.code.reference_js }
    : kind === "architecture" ? t.architecture : t.practical;
}

function BlockView({ b }: { b: Block }) {
  if (b.type === "check") return <div className="card check"><Check q={b} title={b.title || "בדיקת הבנה"} /></div>;
  if (b.type === "scenario") return <Scenario b={b} />;
  if (b.type === "flashcards") return <div className="card"><h3>{b.title || "כרטיסיות"}</h3><div className="cards">{b.cards.map((c, i) => <Flash key={i} q={c.q} a={c.a} />)}</div></div>;
  return (
    <div className={`card block ${b.type}`}>
      {b.title && <h3>{b.type === "example" ? "🧩 " : ""}{b.title}</h3>}
      {b.type === "diagram" && b.mermaid && <Diagram code={b.mermaid} />}
      <Md>{b.md}</Md>
    </div>
  );
}

function Check({ q, title }: { q: { question: string; options: string[]; answer: number; explain: string }; title?: string }) {
  const [pick, setPick] = useState<number | null>(null);
  return <>
    {title && <small className="muted">{title}</small>}
    <p className="q-title">{q.question}</p>
    <div className="options">{q.options.map((o, i) => (
      <button key={i} disabled={pick != null} className={`option ${pick != null && i === q.answer ? "right" : ""} ${pick === i && i !== q.answer ? "wrong" : ""}`} onClick={() => setPick(i)}>{o}</button>
    ))}</div>
    {pick != null && <div className={`explain ${pick === q.answer ? "good" : "bad"}`}>{pick === q.answer ? "נכון. " : "לא בדיוק. "}{q.explain}</div>}
  </>;
}

function Scenario({ b }: { b: Block }) {
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const s = b.steps[step];
  if (!s) return null;
  const chosen = pick != null ? s.choices[pick] : null;
  return (
    <div className="card scenario">
      <h3>🎮 {b.title || "סימולציה"} <small className="muted">שלב {step + 1}/{b.steps.length}</small></h3>
      <p>{s.situation}</p>
      <div className="options">{s.choices.map((c, i) => <button key={i} disabled={pick != null} className={`option ${pick === i ? (c.good ? "right" : "wrong") : ""}`} onClick={() => setPick(i)}>{c.label}</button>)}</div>
      {chosen && <div className={`explain ${chosen.good ? "good" : "bad"}`}>{chosen.outcome}
        <div className="row">{!chosen.good && <button className="btn small" onClick={() => setPick(null)}>נסו בחירה אחרת</button>}
          {step + 1 < b.steps.length && <button className="btn small primary" onClick={() => { setStep(step + 1); setPick(null); }}>המשך</button>}</div></div>}
    </div>
  );
}

function Flash({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return <button className={`flash ${open ? "open" : ""}`} onClick={() => setOpen(!open)}><b>{q}</b>{open ? <span>{a}</span> : <small className="muted">לחצו לתשובה</small>}</button>;
}

function Tutor({ topic }: { topic: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(text: string) {
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next); setBusy(true);
    try { const reply = await chat({ mode: "tutor", topic: { title: topic }, messages: next }, setStreaming); setMsgs([...next, { role: "assistant", content: reply }]); }
    catch (e) { setMsgs([...next, { role: "assistant", content: (e as Error).message }]); }
    setStreaming(""); setBusy(false);
  }
  return <details className="card tutor"><summary>💬 משהו לא ברור? שאלו את המורה</summary><ChatBox messages={msgs} streaming={streaming} busy={busy} onSend={send} other="המורה" placeholder="שאלו כל דבר על השיעור…" /></details>;
}

function QuizTest({ test, onDone }: { test: LessonContent["test"]; onDone: (answers: number[], open: string, mcqPercent: number) => void }) {
  const [answers, setAnswers] = useState<number[]>(() => test.quiz.map(() => -1));
  const [open, setOpen] = useState("");
  const all = answers.every((a) => a >= 0);
  return (
    <div>
      {test.quiz.map((q, i) => (
        <div key={i} className="card"><p className="q-title">{i + 1}. {q.question}</p>
          <div className="options">{q.options.map((o, j) => <button key={j} className={`option ${answers[i] === j ? "on" : ""}`} onClick={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))}>{o}</button>)}</div></div>
      ))}
      {test.open_question && <div className="card"><p className="q-title">שאלה פתוחה: {test.open_question}</p>
        <textarea dir="auto" rows={6} value={open} onChange={(e) => setOpen(e.target.value)} placeholder="ענו כמו שהייתם עונים למראיין…" /></div>}
      <button className="btn primary big" disabled={!all} onClick={() => onDone(answers, open, (answers.filter((a, i) => a === test.quiz[i].answer).length / Math.max(1, test.quiz.length)) * 100)}>הגשה</button>
    </div>
  );
}

function ArchTest({ test, onSubmit }: { test: LessonContent["test"]["architecture"]; onSubmit: (c: Canvas) => void }) {
  const canvas = useRef<Canvas>(emptyCanvas());
  const [count, setCount] = useState(0);
  return (
    <div>
      <div className="card"><h3>{test.prompt}</h3>
        <div className="grid2"><div><h4>דרישות</h4><ul>{test.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
          {test.constraints.length > 0 && <div><h4>אילוצים</h4><ul>{test.constraints.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}</div>
        <small className="muted">תכננו על הלוח והסבירו את ההחלטות בתיבת ההערות. תקבלו ציון וביקורת לפי: {test.rubric.map((r) => r.dimension).join(" · ")}</small></div>
      <div className="card"><ArchCanvas value={canvas.current} onChange={(c) => { canvas.current = c; setCount(c.nodes.length); }} /></div>
      <button className="btn primary big" disabled={count < 2} onClick={() => onSubmit(canvas.current)}>הגשת התכנון לביקורת</button>
    </div>
  );
}

function PracticalTest({ test, onSubmit }: { test: LessonContent["test"]["practical"]; onSubmit: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div>
      <div className="card"><Md>{test.task}</Md><p><b>מה להגיש:</b> {test.deliverable}</p><small className="muted">נבדק לפי: {test.rubric.join(" · ")}</small></div>
      <div className="card"><textarea dir="auto" className="mono" rows={14} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="כתבו כאן את התשובה…" /></div>
      <button className="btn primary big" disabled={answer.trim().length < 20} onClick={() => onSubmit(answer)}>הגשה לביקורת</button>
    </div>
  );
}

/** What the learner thought of the lesson. Compared later with how they actually scored. */
function FeedbackForm({ lesson }: { lesson: Lesson }) {
  const { user } = useMe();
  const [f, setF] = useState({ rating: 0, difficulty: 0, wanted: [] as string[], comment: "" });
  const [sent, setSent] = useState(false);
  if (sent) return <div className="notice">תודה. המשוב נשמר וישפיע על השיעורים הבאים שלכם.</div>;
  return (
    <div className="card feedback">
      <h3>איך היה השיעור?</h3>
      <div className="stars" role="radiogroup" aria-label="דירוג">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= f.rating ? "on" : ""} aria-label={`${n} כוכבים`} onClick={() => setF({ ...f, rating: n })}>★</button>)}</div>
      <p className="q-label">רמת הקושי</p>
      <div className="seg">{[[1, "קל מדי"], [3, "בדיוק"], [5, "קשה מדי"]].map(([v, t]) => <button key={v} className={f.difficulty === v ? "on" : ""} onClick={() => setF({ ...f, difficulty: v as number })}>{t}</button>)}</div>
      <p className="q-label">מה הייתם רוצים בשיעור הבא?</p>
      <div className="chips">{WANTED.map((w) => <button key={w} className={`chip ${f.wanted.includes(w) ? "on" : ""}`} onClick={() => setF({ ...f, wanted: f.wanted.includes(w) ? f.wanted.filter((x) => x !== w) : [...f.wanted, w] })}>{w}</button>)}</div>
      <textarea dir="auto" rows={2} maxLength={2000} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="הערה חופשית (לא חובה)" />
      <button className="btn primary" disabled={!f.rating} onClick={async () => {
        await db.insert("prep_feedback", { user_id: user.id, lesson_id: lesson.id, topic_kind: lesson.topic_kind, format: lesson.format, rating: f.rating, difficulty: f.difficulty || null, wanted: f.wanted.join(", "), comment: f.comment });
        setSent(true);
      }}>שליחת משוב</button>
    </div>
  );
}
