// What the learner thought of the lesson. Compared later with how they actually scored.
import { useState } from "react";
import { useLearner, useServices } from "@/app/AppContext";
import type { Lesson } from "@/domain/Lesson";
import type { LessonFeedbackInput } from "@/domain/LessonFeedback";
import { ErrorMessage } from "@/components/ui";

const WANTED_NEXT_TIME = ["יותר דוגמאות", "יותר תרשימים", "יותר תרגול", "יותר עומק", "קצר יותר", "קצב איטי יותר"];
const DIFFICULTY_OPTIONS: [value: number, label: string][] = [[1, "קל מדי"], [3, "בדיוק"], [5, "קשה מדי"]];
const STAR_VALUES = [1, 2, 3, 4, 5];
const MAX_COMMENT_LENGTH = 2000;

export function LessonFeedbackForm({ lesson }: { lesson: Lesson }) {
  const { user } = useLearner();
  const { study } = useServices();
  const [feedback, setFeedback] = useState<LessonFeedbackInput>({ rating: 0, difficulty: null, wantedNextTime: [], comment: "", reportsContentError: false });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const update = (changes: Partial<LessonFeedbackInput>) => setFeedback({ ...feedback, ...changes });

  function toggleWanted(wish: string) {
    const wanted = feedback.wantedNextTime;
    update({ wantedNextTime: wanted.includes(wish) ? wanted.filter((existing) => existing !== wish) : [...wanted, wish] });
  }

  async function send() {
    setError("");
    try { await study.sendFeedback(user.id, lesson, feedback); setSent(true); } catch (failure) { setError((failure as Error).message); }
  }

  if (sent) return <div className="notice">המשוב נשמר.</div>;
  return (
    <div className="card feedback">
      <h3>דירוג השיעור</h3>
      <div className="stars" role="radiogroup" aria-label="דירוג">{STAR_VALUES.map((stars) => (
        <button key={stars} className={stars <= feedback.rating ? "on" : ""} aria-label={`${stars} כוכבים`} onClick={() => update({ rating: stars })}>★</button>
      ))}</div>
      <p className="q-label">רמת הקושי</p>
      <div className="seg">{DIFFICULTY_OPTIONS.map(([value, label]) => (
        <button key={value} className={feedback.difficulty === value ? "on" : ""} onClick={() => update({ difficulty: value })}>{label}</button>
      ))}</div>
      <p className="q-label">בפעם הבאה</p>
      <div className="chips">{WANTED_NEXT_TIME.map((wish) => (
        <button key={wish} className={`chip ${feedback.wantedNextTime.includes(wish) ? "on" : ""}`} onClick={() => toggleWanted(wish)}>{wish}</button>
      ))}</div>
      <label className="check-row">
        <input type="checkbox" checked={feedback.reportsContentError} onChange={(event) => update({ reportsContentError: event.target.checked })} />
        מצאתי טעות בתוכן השיעור
      </label>
      <textarea dir="auto" rows={2} maxLength={MAX_COMMENT_LENGTH} value={feedback.comment} onChange={(event) => update({ comment: event.target.value })}
        placeholder={feedback.reportsContentError ? "מה הטעות? (עוזר לנו לתקן)" : "הערה (לא חובה)"} />
      <ErrorMessage message={error} />
      <button className="btn primary" disabled={!feedback.rating} onClick={send}>שליחה</button>
    </div>
  );
}
