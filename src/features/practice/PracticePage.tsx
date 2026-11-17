// Daily practice (one item at a time) and the mistakes notebook, as two tabs of one screen.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLearner, useServices } from "@/app/AppContext";
import { useAsyncData } from "@/app/useAsyncData";
import { Calendar } from "@/domain/Calendar";
import type { DailyPractice, PracticeItem } from "@/domain/DailyPractice";
import { Mistake } from "@/domain/Mistake";
import type { MistakeSource } from "@/domain/records";
import { ErrorMessage, Loading, Markdown, ProgressBar } from "@/components/ui";

const SOURCE_LABEL: Record<MistakeSource, string> = { test: "מבחן", review: "ביקורת", interview: "ראיון", practice: "תרגול" };

export default function PracticePage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "notebook" ? "notebook" : "today";
  return (
    <>
      <nav className="track-tabs" aria-label="תרגול">
        <Link to="/practice" aria-current={tab === "today" ? "page" : undefined}>תרגול יומי</Link>
        <Link to="/practice?tab=notebook" aria-current={tab === "notebook" ? "page" : undefined}>מחברת טעויות</Link>
      </nav>
      {tab === "today" ? <TodaySession /> : <Notebook />}
    </>
  );
}

/* ---------------- today ---------------- */

function TodaySession() {
  const { user } = useLearner();
  const { practice } = useServices();
  const { data: session, error, reload } = useAsyncData(() => practice.todaysSession(user.id), [practice, user.id]);
  if (error) return <div className="page"><ErrorMessage message={error} onRetry={reload} /></div>;
  if (!session) return <div className="page"><Loading label="טוען…" /></div>;
  return <SessionRunner session={session} key={session.items.map((item) => item.key).join()} onRestart={reload} />;
}

function SessionRunner({ session, onRestart }: { session: DailyPractice; onRestart: () => void }) {
  const { user } = useLearner();
  const { practice } = useServices();
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [error, setError] = useState("");

  if (session.isEmpty) return (
    <div className="page"><div className="card practice-empty">
      <h2>אין מה לתרגל כרגע</h2>
      <p className="muted">טעויות ממבחנים וראיונות, וכרטיסים משיעורים שסיימת, יופיעו כאן.</p>
      <Link className="btn primary" to="/plan">לתוכנית</Link>
    </div></div>
  );

  const items = session.items;
  async function answer(item: PracticeItem, correct: boolean) {
    setError("");
    try {
      await practice.recordAnswer(user.id, item, correct);
      setResults((previous) => [...previous, correct]);
      setIndex((previous) => previous + 1);
    } catch (failure) { setError((failure as Error).message); }
  }

  if (index >= items.length) {
    const right = results.filter(Boolean).length;
    return (
      <div className="page"><div className="card practice-done">
        <span className="eyebrow">{Calendar.longHebrewDate()}</span>
        <h2>{right}/{items.length}</h2>
        <p className="muted">{right === items.length ? "הכול נכון." : `${items.length - right} חזרו למחברת לתרגול נוסף.`}</p>
        <div className="row">
          <Link className="btn primary" to="/">להיום</Link>
          <Link className="btn" to="/practice?tab=notebook">למחברת</Link>
          <button className="btn ghost" onClick={onRestart}>סבב נוסף</button>
        </div>
      </div></div>
    );
  }

  const item = items[index];
  return (
    <div className="page practice">
      <div className="practice-head">
        <span className="muted">{index + 1}/{items.length}</span>
        <ProgressBar value={(index / items.length) * 100} tone="ok" label="התקדמות בסבב" />
      </div>
      <ErrorMessage message={error} />
      <PracticeCard item={item} key={item.key} onAnswer={(correct) => answer(item, correct)} />
    </div>
  );
}

function PracticeCard({ item, onAnswer }: { item: PracticeItem; onAnswer: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const isChoice = item.kind === "choice" && item.correctOption != null && item.options.length > 1;
  const correct = picked != null && picked === item.correctOption;

  return (
    <article className="card practice-card">
      <div className="row between"><span className="eyebrow">{item.topicTitle}</span>{item.origin === "mistake" && <span className="pill warn">מהמחברת</span>}</div>
      <div className="practice-prompt"><Markdown>{item.prompt}</Markdown></div>

      {isChoice ? <>
        <div className="options">{item.options.map((option, optionIndex) => (
          <button key={optionIndex} disabled={picked != null}
            className={`option ${picked != null && optionIndex === item.correctOption ? "right" : ""} ${picked === optionIndex && !correct ? "wrong" : ""}`}
            onClick={() => setPicked(optionIndex)}>{option}</button>
        ))}</div>
        {picked != null && <>
          {item.explanation && <div className={`explain ${correct ? "good" : "bad"}`}>{item.explanation}</div>}
          <button className="btn primary" onClick={() => onAnswer(correct)}>הבא</button>
        </>}
      </> : <>
        {!revealed
          ? <button className="btn" onClick={() => setRevealed(true)}>הצגת תשובה</button>
          : <>
            <div className="practice-answer"><Markdown>{item.answer || "—"}</Markdown>{item.explanation && <p className="muted">{item.explanation}</p>}</div>
            <div className="row">
              <button className="btn primary" onClick={() => onAnswer(true)}>ידעתי</button>
              <button className="btn" onClick={() => onAnswer(false)}>לא ידעתי</button>
            </div>
          </>}
      </>}
    </article>
  );
}

/* ---------------- notebook ---------------- */

function Notebook() {
  const { user } = useLearner();
  const { practice } = useServices();
  const { data: mistakes, error, reload, setData } = useAsyncData(() => practice.notebook(user.id), [practice, user.id]);
  const [showResolved, setShowResolved] = useState(false);

  const groups = useMemo(() => {
    const visible = (mistakes ?? []).filter((mistake) => mistake.resolved === showResolved);
    const byTopic = new Map<string, Mistake[]>();
    for (const mistake of visible) byTopic.set(mistake.topicTitle || "כללי", [...(byTopic.get(mistake.topicTitle || "כללי") ?? []), mistake]);
    return [...byTopic.entries()];
  }, [mistakes, showResolved]);

  if (error) return <div className="page"><ErrorMessage message={error} onRetry={reload} /></div>;
  if (!mistakes) return <div className="page"><Loading label="טוען…" /></div>;

  const open = mistakes.filter((mistake) => !mistake.resolved);
  const dueToday = open.filter((mistake) => mistake.isDue()).length;

  async function toggleResolved(mistake: Mistake) {
    await practice.setResolved(mistake, !mistake.resolved);
    setData((mistakes ?? []).map((entry) => (entry.id === mistake.id ? entry.withProgress({
      box: entry.box, dueOn: entry.dueOn, reviewCount: entry.reviewCount, lastResult: entry.lastResult ?? false,
      resolved: !entry.resolved, lastReviewedAt: entry.lastReviewedAt ?? new Date().toISOString(),
    }) : entry)));
  }
  async function remove(mistake: Mistake) {
    await practice.remove(mistake);
    setData((mistakes ?? []).filter((entry) => entry.id !== mistake.id));
  }

  return (
    <div className="page">
      <div className="row between page-head">
        <div><h1>מחברת טעויות</h1><p className="muted">{open.length} פתוחות · {dueToday} להיום</p></div>
        <div className="seg">
          <button className={!showResolved ? "on" : ""} onClick={() => setShowResolved(false)}>פתוחות</button>
          <button className={showResolved ? "on" : ""} onClick={() => setShowResolved(true)}>נסגרו</button>
        </div>
      </div>
      {groups.length === 0 && <div className="card"><p className="muted">{showResolved ? "עוד לא נסגרו טעויות." : "המחברת ריקה."}</p></div>}
      {groups.map(([topicTitle, entries]) => (
        <section key={topicTitle} className="card">
          <h3>{topicTitle}</h3>
          <ul className="list notebook">{entries.map((mistake) => (
            <li key={mistake.id}>
              <details>
                <summary>
                  <span className="notebook-prompt">{mistake.prompt}</span>
                  <span className="notebook-meta">
                    <span className="pill">{SOURCE_LABEL[mistake.source]}</span>
                    <BoxMeter box={mistake.box} resolved={mistake.resolved} />
                  </span>
                </summary>
                <div className="notebook-body">
                  <Markdown>{mistake.answer || "—"}</Markdown>
                  {mistake.explanation && <p className="muted">{mistake.explanation}</p>}
                  <div className="row">
                    {!mistake.resolved && <small className="muted">חזרה הבאה {mistake.dueOn}</small>}
                    <button className="btn small" onClick={() => toggleResolved(mistake)}>{mistake.resolved ? "פתיחה מחדש" : "סימון כנלמד"}</button>
                    <button className="btn small ghost" onClick={() => remove(mistake)}>הסרה</button>
                  </div>
                </div>
              </details>
            </li>
          ))}</ul>
        </section>
      ))}
    </div>
  );
}

/** Five dots: how far up the review boxes the entry has climbed. */
function BoxMeter({ box, resolved }: { box: number; resolved: boolean }) {
  const filled = resolved ? Mistake.LAST_BOX : box;
  return (
    <span className="box-meter" role="img" aria-label={`שלב ${filled} מתוך ${Mistake.LAST_BOX}`}>
      {Array.from({ length: Mistake.LAST_BOX }, (_, index) => <i key={index} className={index < filled ? "on" : ""} />)}
    </span>
  );
}
