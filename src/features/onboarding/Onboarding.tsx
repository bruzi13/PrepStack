// Sign-up questionnaire. It adapts in two ways: which questions appear depends on earlier answers, and the
// placement quiz at the end picks each next question by how the previous one went.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IMPROVE_GOALS, LEVELS, ROLES, TARGET_LEVELS } from "@shared/catalog";
import { useServices, useSession } from "@/app/AppContext";
import { OnboardingQuestionnaire, type QuestionnaireStep } from "@/domain/OnboardingQuestionnaire";
import { PlacementTest } from "@/domain/PlacementTest";
import type { OnboardingAnswers } from "@/domain/records";
import { ErrorMessage, Loading } from "@/components/ui";

const OCCUPATIONS: [key: string, label: string][] = [
  ["developer", "מפתח/ת בתעשייה"], ["student", "סטודנט/ית למדעי המחשב או הנדסה"], ["bootcamp", "בוגר/ת בוטקמפ או קורס"],
  ["adjacent", "QA / DevOps / Data / IT שרוצה להתקדם או לעבור תחום"], ["switcher", "מסב/ה מקצוע מתחום אחר"], ["manager", "מנהל/ת או ראש צוות"],
];
const INTERVIEW_LANGUAGES: [key: string, label: string][] = [["he", "עברית"], ["en", "אנגלית"], ["both", "גם וגם"]];
const DONT_KNOW = -1;

type Phase = "questionnaire" | "loadingPlacement" | "placement" | "buildingPlan";

export default function Onboarding() {
  const { user, profile, saveProfile } = useSession();
  const { onboarding } = useServices();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<OnboardingAnswers>({ improve: [], hours_per_week: 5, interview_lang: "he", ...(profile?.answers ?? {}) });
  const [displayName, setDisplayName] = useState(profile?.displayName ?? user?.name ?? "");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("questionnaire");
  const [placement, setPlacement] = useState<PlacementTest | null>(null);
  const updateAnswers = (changes: Partial<OnboardingAnswers>) => setAnswers((current) => ({ ...current, ...changes }));

  const questionnaire = new OnboardingQuestionnaire(answers, displayName);
  const steps = questionnaire.steps;
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;

  async function continueQuestionnaire() {
    if (step === "level" && !answers.target_level) updateAnswers({ target_level: OnboardingQuestionnaire.suggestedTargetLevel(answers.level) });
    if (!isLastStep) { setStepIndex(stepIndex + 1); return; }
    setPhase("loadingPlacement"); setError("");
    try {
      setPlacement(PlacementTest.start(await onboarding.createPlacementQuiz(questionnaire.finalAnswers())));
      setPhase("placement");
    } catch (failure) { setError((failure as Error).message); setPhase("questionnaire"); }
  }

  async function buildPlan(levelsByArea: Record<string, number>) {
    if (!user) return;
    setPhase("buildingPlan"); setError("");
    try {
      await onboarding.complete(user, displayName.trim(), { ...questionnaire.finalAnswers(), diagnostic: levelsByArea }, saveProfile);
      navigate("/plan");
    } catch (failure) { setError((failure as Error).message); }
  }

  function answerPlacement(optionIndex: number) {
    if (!placement) return;
    const next = placement.answer(optionIndex);
    setPlacement(next);
    if (next.isFinished) void buildPlan({ ...next.levelsByArea });
  }

  if (phase === "loadingPlacement") return <div className="center"><Loading label="מכין מבחן מיקום…" /></div>;
  if (phase === "buildingPlan") return (
    <div className="center"><div className="card narrow">
      {error ? <ErrorMessage message={error} onRetry={() => buildPlan({ ...(placement?.levelsByArea ?? {}) })} /> : <Loading label="בונה תוכנית…" hint="זה לוקח דקה או שתיים" />}
    </div></div>
  );

  const placementQuestion = placement?.currentQuestion;
  if (phase === "placement" && placement && placementQuestion) {
    return (
      <div className="center"><div className="card narrow">
        <div className="steps-bar"><div style={{ width: `${placement.progressPercent}%` }} /></div>
        <small className="muted">מבחן מיקום · {placementQuestion.area} · שאלה {placement.answeredCount + 1} מתוך {placement.totalQuestions}</small>
        <h2 className="q-title">{placementQuestion.question}</h2>
        <div className="options">
          {placementQuestion.options.map((option, index) => <button key={index} className="option" onClick={() => answerPlacement(index)}>{option}</button>)}
          <button className="option dim" onClick={() => answerPlacement(DONT_KNOW)}>לא יודע/ת</button>
        </div>
        <button className="link" onClick={() => buildPlan({})}>דילוג</button>
      </div></div>
    );
  }

  return (
    <div className="center"><div className="card narrow">
      <div className="steps-bar"><div style={{ width: `${((stepIndex + 1) / (steps.length + 1)) * 100}%` }} /></div>
      <QuestionnaireStepView step={step} answers={answers} update={updateAnswers} displayName={displayName} setDisplayName={setDisplayName} />
      <ErrorMessage message={error} />
      <div className="row between wizard-nav">
        <button className="btn ghost" disabled={stepIndex === 0} onClick={() => setStepIndex(stepIndex - 1)}>חזרה</button>
        <button className="btn primary" disabled={!questionnaire.canContinueFrom(step)} onClick={continueQuestionnaire}>{isLastStep ? "למבחן המיקום" : "המשך"}</button>
      </div>
    </div></div>
  );
}

function QuestionnaireStepView({ step, answers, update, displayName, setDisplayName }: {
  step: QuestionnaireStep; answers: OnboardingAnswers; update: (changes: Partial<OnboardingAnswers>) => void;
  displayName: string; setDisplayName: (name: string) => void;
}) {
  const selected = (isOn: boolean) => `option ${isOn ? "on" : ""}`;
  switch (step) {
    case "who": return <>
      <h2>נעים להכיר. מי אתם?</h2>
      <label>איך לקרוא לכם?<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <p className="q-label">מה אתם עושים היום?</p>
      <div className="options">{OCCUPATIONS.map(([key, label]) => <button key={key} className={selected(answers.occupation === key)} onClick={() => update({ occupation: key })}>{label}</button>)}</div>
    </>;
    case "level": return <>
      <h2>כמה ניסיון יש לכם?</h2>
      <div className="options">{LEVELS.map((level) => <button key={level.key} className={selected(answers.level === level.key)} onClick={() => update({ level: level.key })}>{level.title}</button>)}</div>
    </>;
    case "role": return <>
      <h2>לאיזה תפקיד אתם מכוונים?</h2>
      <div className="options two">
        {ROLES.map((role) => <button key={role.key} className={selected(answers.role === role.key)} onClick={() => update({ role: role.key })}><b>{role.title}</b><small>{role.hint}</small></button>)}
        <button className={selected(answers.role === "other")} onClick={() => update({ role: "other" })}><b>תפקיד אחר</b><small>כתבו בעצמכם</small></button>
      </div>
      {answers.role === "other" && <label>שם התפקיד<input dir="auto" value={answers.role_title ?? ""} onChange={(event) => update({ role_title: event.target.value })} placeholder="למשל: Embedded Engineer, Solutions Architect" /></label>}
      <p className="q-label">באיזו רמה התפקיד שאתם מחפשים?</p>
      <div className="seg">{TARGET_LEVELS.map(([key, label]) => <button key={key} className={answers.target_level === key ? "on" : ""} onClick={() => update({ target_level: key })}>{label}</button>)}</div>
    </>;
    case "stack": return <>
      <h2>עם מה אתם עובדים היום?</h2>
      <label>שפות, פריימוורקים וכלים שאתם מכירים טוב<textarea dir="auto" rows={3} value={answers.stack ?? ""} onChange={(event) => update({ stack: event.target.value })} placeholder="למשל: Node.js, TypeScript, PostgreSQL, AWS, קצת Kubernetes" /></label>
    </>;
    case "improve": return <>
      <h2>במה אתם רוצים להשתפר?</h2>
      <p className="muted">אפשר לבחור כמה.</p>
      <div className="options two">{IMPROVE_GOALS.map((goal) => {
        const chosen = answers.improve?.includes(goal.key) ?? false;
        const toggled = chosen ? (answers.improve ?? []).filter((key) => key !== goal.key) : [...(answers.improve ?? []), goal.key];
        return <button key={goal.key} className={selected(chosen)} onClick={() => update({ improve: toggled })}>{goal.title}</button>;
      })}</div>
      <label>משהו נוסף שחשוב לכם? (לא חובה)<textarea dir="auto" rows={2} value={answers.improve_note ?? ""} onChange={(event) => update({ improve_note: event.target.value })} placeholder="למשל: נכשלתי פעמיים בשלב ה-System Design ואני לא יודע/ת למה" /></label>
    </>;
    case "newStack": return <>
      <h2>איזו טכנולוגיה חדשה תרצו ללמוד?</h2>
      <label>סטאק או טכנולוגיה<input dir="auto" value={answers.new_stack ?? ""} onChange={(event) => update({ new_stack: event.target.value })} placeholder="למשל: Go, Kubernetes, React, Kafka, Rust" /></label>
    </>;
    case "time": return <>
      <h2>כמה זמן יש לנו?</h2>
      <label>יש לכם ראיון בתאריך ידוע? (לא חובה)<input type="date" value={answers.interview_date ?? ""} onChange={(event) => update({ interview_date: event.target.value })} /></label>
      <label>כמה שעות בשבוע תוכלו להשקיע? <b>{answers.hours_per_week}</b><input type="range" min={1} max={20} value={answers.hours_per_week ?? 5} onChange={(event) => update({ hours_per_week: Number(event.target.value) })} /></label>
      <p className="q-label">באיזו שפה תתראיינו?</p>
      <div className="seg">{INTERVIEW_LANGUAGES.map(([key, label]) => <button key={key} className={answers.interview_lang === key ? "on" : ""} onClick={() => update({ interview_lang: key })}>{label}</button>)}</div>
    </>;
  }
}
