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

export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) =>
  msg ? <div className="error" role="alert">{msg} {retry && <button className="btn small" onClick={retry}>נסו שוב</button>}</div> : null;

export function Bar({ value, tone }: { value: number; tone?: string }) {
  const t = tone ?? (value >= 85 ? "good" : value >= 70 ? "ok" : value >= 40 ? "warn" : "bad");
  return <div className="bar"><div className={`bar-fill ${t}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
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
