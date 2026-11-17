import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Review } from "@/types";

export function Md({ children }: { children: string }) {
  return <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ""}</ReactMarkdown></div>;
}

export function Busy({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="busy" role="status">
      <div className="spinner" />
      <div><b>{label}</b>{hint && <div className="muted">{hint}</div>}</div>
    </div>
  );
}

/** A long AI job (about a minute): named steps that advance on a timer so the wait reads as progress, not a hang.
 *  The steps are time-based, not reported by the server; the last one waits until the job really ends. */
export function StepWait({ title, steps, every = 12000 }: { title: string; steps: string[]; every?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), every);
    return () => clearInterval(t);
  }, [steps.length, every]);
  return (
    <div className="card stepwait" role="status" aria-live="polite">
      <h2>{title}</h2>
      <div className="bar"><div className="bar-fill ok" style={{ width: `${((i + 0.5) / steps.length) * 100}%` }} /></div>
      <ol>{steps.map((s, k) => (
        <li key={s} className={k < i ? "done" : k === i ? "now" : ""} aria-current={k === i ? "step" : undefined}>
          <span className="dot" aria-hidden>{k < i ? "✓" : k + 1}</span>{s}{k === i && <span className="spinner sm" aria-hidden />}
        </li>
      ))}</ol>
    </div>
  );
}

/** Where the learner is inside a lesson. */
export function LessonSteps({ at }: { at: 0 | 1 | 2 }) {
  const names = ["לימוד", "מבחן", "ציון ומשוב"];
  return (
    <ol className="lesson-steps" aria-label="שלבי השיעור">{names.map((n, k) => (
      <li key={n} className={k < at ? "done" : k === at ? "now" : ""} aria-current={k === at ? "step" : undefined}><span className="dot" aria-hidden>{k < at ? "✓" : k + 1}</span>{n}</li>
    ))}</ol>
  );
}

export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) =>
  msg ? <div className="error" role="alert">{msg} {retry && <button className="btn small" onClick={retry}>נסו שוב</button>}</div> : null;

export function Bar({ value, tone, label }: { value: number; tone?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone ?? (v >= 85 ? "good" : v >= 70 ? "ok" : v >= 40 ? "warn" : "bad");
  return <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}><div className={`bar-fill ${t}`} style={{ width: `${v}%` }} /></div>;
}

export function ScoreRing({ score, size = 96, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  const tone = score >= 85 ? "var(--good)" : score >= 70 ? "var(--ok)" : score >= 40 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`ציון ${Math.round(score)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-num"><b>{Math.round(score)}</b>{label && <span>{label}</span>}</div>
    </div>
  );
}

const SEV = { critical: "קריטי", major: "משמעותי", minor: "קל" } as const;

/** The grader's verdict on a test: score, what was good, what was flawed and how to fix it. */
export function ReviewView({ review, score, extra }: { review: Review | null; score: number; extra?: ReactNode }) {
  return (
    <div className="review">
      <div className="review-head">
        <ScoreRing score={score} label="ציון" />
        <div><h3>{score >= 85 ? "מוכנים לראיון בנושא הזה" : score >= 70 ? "טוב, עם כמה דברים לחזק" : score >= 40 ? "יש בסיס, צריך עוד תרגול" : "כדאי לחזור על הנושא"}</h3>
          {review && <p>{review.verdict}</p>}{extra}</div>
      </div>
      {review && <>
        {review.dimensions.length > 0 && <div className="dims">{review.dimensions.map((d) => (
          <div key={d.name} className="dim"><div className="dim-top"><span>{d.name}</span><b>{d.score}</b></div><Bar value={d.score} /><small className="muted">{d.comment}</small></div>
        ))}</div>}
        {review.strengths.length > 0 && <><h4>מה היה טוב</h4><ul className="plus">{review.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
        {review.issues.length > 0 && <><h4>מה לקוי ואיך מתקנים</h4>
          <div className="issues">{review.issues.map((x, i) => (
            <div key={i} className={`issue ${x.severity}`}><span className="tag">{SEV[x.severity] ?? x.severity}</span><div><b>{x.point}</b><div className="muted">תיקון: {x.fix}</div></div></div>
          ))}</div></>}
        {review.model_answer && <details><summary>איך נראית תשובה חזקה</summary><Md>{review.model_answer}</Md></details>}
        {review.next_steps.length > 0 && <><h4>מה לתרגל עכשיו</h4><ul>{review.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
      </>}
    </div>
  );
}

const MermaidInner = lazy(() => import("@/components/Mermaid"));
export const Diagram = ({ code }: { code: string }) => <Suspense fallback={<div className="muted">טוען תרשים…</div>}><MermaidInner code={code} /></Suspense>;
