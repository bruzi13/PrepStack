// Small shared UI pieces.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GradingReview } from "@/domain/records";

export type ScoreTone = "good" | "ok" | "warn" | "bad";

/** The colour tone for a 0-100 score, used by bars, rings and pills. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 85) return "good";
  if (score >= 70) return "ok";
  if (score >= 40) return "warn";
  return "bad";
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export function Markdown({ children }: { children: string }) {
  return <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ""}</ReactMarkdown></div>;
}

export function Loading({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="busy" role="status">
      <div className="spinner" />
      <div><b>{label}</b>{hint && <div className="muted">{hint}</div>}</div>
    </div>
  );
}

/**
 * A long AI job (about a minute): named steps that advance on a timer so the wait reads as progress, not a hang.
 * The steps are time-based, not reported by the server; the last one waits until the job really ends.
 */
export function TimedProgressSteps({ title, steps, stepDurationMs = 12000 }: { title: string; steps: string[]; stepDurationMs?: number }) {
  const [currentStep, setCurrentStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCurrentStep((step) => Math.min(step + 1, steps.length - 1)), stepDurationMs);
    return () => clearInterval(timer);
  }, [steps.length, stepDurationMs]);
  return (
    <div className="card stepwait" role="status" aria-live="polite">
      <h2>{title}</h2>
      <div className="bar"><div className="bar-fill ok" style={{ width: `${((currentStep + 0.5) / steps.length) * 100}%` }} /></div>
      <ol>{steps.map((step, index) => (
        <li key={step} className={index < currentStep ? "done" : index === currentStep ? "now" : ""} aria-current={index === currentStep ? "step" : undefined}>
          <span className="dot" aria-hidden>{index < currentStep ? "✓" : index + 1}</span>{step}
          {index === currentStep && <span className="spinner sm" aria-hidden />}
        </li>
      ))}</ol>
    </div>
  );
}

const LESSON_STAGE_NAMES = ["לימוד", "מבחן", "ציון ומשוב"];

/** Where the learner is inside a lesson. */
export function LessonStageIndicator({ stage }: { stage: 0 | 1 | 2 }) {
  return (
    <ol className="lesson-steps" aria-label="שלבי השיעור">{LESSON_STAGE_NAMES.map((name, index) => (
      <li key={name} className={index < stage ? "done" : index === stage ? "now" : ""} aria-current={index === stage ? "step" : undefined}>
        <span className="dot" aria-hidden>{index < stage ? "✓" : index + 1}</span>{name}
      </li>
    ))}</ol>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return <div className="error" role="alert">{message} {onRetry && <button className="btn small" onClick={onRetry}>נסו שוב</button>}</div>;
}

export function ProgressBar({ value, tone, label }: { value: number; tone?: string; label?: string }) {
  const percent = clampPercent(value);
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={label}>
      <div className={`bar-fill ${tone ?? scoreTone(percent)}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

const RING_STROKE = 7;

export function ScoreRing({ score, size = 96, label }: { score: number; size?: number; label?: string }) {
  const radius = size / 2 - RING_STROKE, circumference = 2 * Math.PI * radius, center = size / 2;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`ציון ${Math.round(score)}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--line)" strokeWidth={RING_STROKE} />
        <circle cx={center} cy={center} r={radius} fill="none" stroke={`var(--${scoreTone(score)})`} strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clampPercent(score) / 100)} transform={`rotate(-90 ${center} ${center})`} />
      </svg>
      <div className="ring-num"><b>{Math.round(score)}</b>{label && <span>{label}</span>}</div>
    </div>
  );
}

const SEVERITY_LABEL = { critical: "קריטי", major: "משמעותי", minor: "קל" } as const;

function verdictHeadline(score: number): string {
  if (score >= 85) return "מוכנים לראיון בנושא הזה";
  if (score >= 70) return "טוב, עם כמה דברים לחזק";
  if (score >= 40) return "יש בסיס, צריך עוד תרגול";
  return "כדאי לחזור על הנושא";
}

/** The grader's verdict on a test: score, what was good, what was flawed and how to fix it. */
export function GradingReviewView({ review, score, extra }: { review: GradingReview | null; score: number; extra?: ReactNode }) {
  return (
    <div className="review">
      <div className="review-head">
        <ScoreRing score={score} label="ציון" />
        <div><h3>{verdictHeadline(score)}</h3>{review && <p>{review.verdict}</p>}{extra}</div>
      </div>
      {review && <>
        {review.dimensions.length > 0 && <div className="dims">{review.dimensions.map((dimension) => (
          <div key={dimension.name} className="dim">
            <div className="dim-top"><span>{dimension.name}</span><b>{dimension.score}</b></div>
            <ProgressBar value={dimension.score} /><small className="muted">{dimension.comment}</small>
          </div>
        ))}</div>}
        {review.strengths.length > 0 && <><h4>מה היה טוב</h4><ul className="plus">{review.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul></>}
        {review.issues.length > 0 && <><h4>מה לקוי ואיך מתקנים</h4>
          <div className="issues">{review.issues.map((issue, index) => (
            <div key={index} className={`issue ${issue.severity}`}>
              <span className="tag">{SEVERITY_LABEL[issue.severity] ?? issue.severity}</span>
              <div><b>{issue.point}</b><div className="muted">תיקון: {issue.fix}</div></div>
            </div>
          ))}</div></>}
        {review.model_answer && <details><summary>איך נראית תשובה חזקה</summary><Markdown>{review.model_answer}</Markdown></details>}
        {review.next_steps.length > 0 && <><h4>מה לתרגל עכשיו</h4><ul>{review.next_steps.map((step, index) => <li key={index}>{step}</li>)}</ul></>}
      </>}
    </div>
  );
}

const MermaidDiagram = lazy(() => import("@/components/Mermaid"));

export function Diagram({ code }: { code: string }) {
  return <Suspense fallback={<div className="muted">טוען תרשים…</div>}><MermaidDiagram code={code} /></Suspense>;
}
