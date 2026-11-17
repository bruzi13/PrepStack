// Sign-up questionnaire. It adapts in two ways: which questions appear depends on earlier answers,
// and the placement quiz at the end picks each next question by how the previous one went.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IMPROVE_GOALS, LEVELS, ROLES, TARGET_LEVELS } from "@shared/catalog";
import { useApp } from "@/app/AppContext";
import { runJob } from "@/services/ai";
import { createPlan } from "@/services/plans";
import type { Answers } from "@/types";
import { Busy, ErrorBox } from "@/components/ui";

const OCCUPATIONS = [
  ["developer", "מפתח/ת בתעשייה"], ["student", "סטודנט/ית למדעי המחשב או הנדסה"], ["bootcamp", "בוגר/ת בוטקמפ או קורס"],
  ["adjacent", "QA / DevOps / Data / IT שרוצה להתקדם או לעבור תחום"], ["switcher", "מסב/ה מקצוע מתחום אחר"], ["manager", "מנהל/ת או ראש צוות"],
] as const;

const TARGET_FROM: Record<string, string> = { student: "junior", junior: "junior", mid: "mid", senior: "senior", staff: "staff" };

interface DQ { id: string; area: string; level: number; question: string; options: string[]; answer: number; explain: string }
type Step = "who" | "level" | "role" | "stack" | "improve" | "newstack" | "time" | "quiz" | "build";

export default function Onboarding() {
  const { user, profile, saveProfile } = useApp();
  const nav = useNavigate();
  const [a, setA] = useState<Answers>({ improve: [], hours_per_week: 5, interview_lang: "he", ...(profile?.answers ?? {}) });
  const [name, setName] = useState(profile?.display_name ?? user?.name ?? "");
  const [i, setI] = useState(0);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<"form" | "loading-quiz" | "quiz" | "building">("form");
  const [quiz, setQuiz] = useState<{ areas: string[]; questions: DQ[] } | null>(null);
  const [q, setQ] = useState<{ area: number; second: boolean; firstOk: boolean; picked: number | null }>({ area: 0, second: false, firstOk: false, picked: null });
  const [levels, setLevels] = useState<Record<string, number>>({});
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));

  // The path through the questionnaire depends on the answers so far.
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = ["who"];
    s.push("level", "role");
    if (a.occupation !== "switcher") s.push("stack");
    s.push("improve");
    if (a.improve?.includes("new_stack")) s.push("newstack");
    s.push("time");
    return s;
  }, [a.occupation, a.improve]);
  const step = steps[Math.min(i, steps.length - 1)];

  const canNext = step === "who" ? !!a.occupation && !!name.trim()
    : step === "level" ? !!a.level
    : step === "role" ? !!a.role && (a.role !== "other" || !!a.role_title?.trim()) && !!a.target_level
    : step === "improve" ? (a.improve?.length ?? 0) > 0 : true;

  function finalAnswers(): Answers {
    const role_title = a.role === "other" ? a.role_title : ROLES.find((r) => r.key === a.role)?.title;
    return { ...a, level: a.level ?? "junior", role_title };
  }

  async function next() {
    // Suggest the level of role that matches their experience; they can change it.
    if (step === "level" && !a.target_level) set({ target_level: TARGET_FROM[a.level ?? "junior"] ?? "mid" });
    if (i < steps.length - 1) { setI(i + 1); return; }
    setPhase("loading-quiz"); setErr("");
    try {
      const r = await runJob<{ areas: string[]; questions: DQ[] }>("diagnostic", { answers: finalAnswers() }, user!.id);
      setQuiz(r); setPhase("quiz");
    } catch (e) { setErr((e as Error).message); setPhase("form"); }
  }

  // Adaptive placement: every area starts at the middle level; a right answer leads to the hard question, a wrong one to the easy one.
  const current = (() => {
    if (!quiz) return null;
    const area = quiz.areas[q.area];
    const level = !q.second ? 2 : q.firstOk ? 3 : 1;
    return quiz.questions.find((x) => x.area === area && x.level === level) ?? quiz.questions.find((x) => x.area === area) ?? null;
  })();

  function answer(idx: number) {
    if (!quiz || !current) return;
    const ok = idx === current.answer;
    if (!q.second) { setQ({ ...q, second: true, firstOk: ok, picked: null }); return; }
    const reached = q.firstOk ? (ok ? 3 : 2) : ok ? 1 : 0;
    const nextLevels = { ...levels, [quiz.areas[q.area]]: reached };
    setLevels(nextLevels);
    if (q.area + 1 < quiz.areas.length) setQ({ area: q.area + 1, second: false, firstOk: false, picked: null });
    else build(nextLevels);
  }

  async function build(diagnostic: Record<string, number>) {
    setPhase("building"); setErr("");
    try {
      const answers = { ...finalAnswers(), diagnostic };
      const p = await saveProfile({ display_name: name.trim(), role_key: answers.role ?? null, answers });
      await createPlan(user!, p, "main");
      await saveProfile({ display_name: name.trim(), role_key: answers.role ?? null, answers: { ...answers, onboarded: true } });
      nav("/plan");
    } catch (e) { setErr((e as Error).message); }
  }

  if (phase === "loading-quiz") return <div className="center"><Busy label="מכין מבחן מיקום…" /></div>;
  if (phase === "building") return (
    <div className="center"><div className="card narrow">
      {err ? <ErrorBox msg={err} retry={() => build(levels)} /> : <Busy label="בונה תוכנית…" hint="זה לוקח דקה או שתיים" />}
    </div></div>
  );

  if (phase === "quiz" && quiz && current) {
    const done = q.area * 2 + (q.second ? 1 : 0);
    return (
      <div className="center"><div className="card narrow">
        <div className="steps-bar"><div style={{ width: `${(done / (quiz.areas.length * 2)) * 100}%` }} /></div>
        <small className="muted">מבחן מיקום · {current.area} · שאלה {done + 1} מתוך {quiz.areas.length * 2}</small>
        <h2 className="q-title">{current.question}</h2>
        <div className="options">
          {current.options.map((o, idx) => <button key={idx} className="option" onClick={() => answer(idx)}>{o}</button>)}
          <button className="option dim" onClick={() => answer(-1)}>לא יודע/ת</button>
        </div>
        <button className="link" onClick={() => build({})}>דילוג</button>
      </div></div>
    );
  }

  return (
    <div className="center"><div className="card narrow">
      <div className="steps-bar"><div style={{ width: `${((i + 1) / (steps.length + 1)) * 100}%` }} /></div>
      {step === "who" && <>
        <h2>נעים להכיר. מי אתם?</h2>
        <label>איך לקרוא לכם?<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <p className="q-label">מה אתם עושים היום?</p>
        <div className="options">{OCCUPATIONS.map(([k, t]) => <button key={k} className={`option ${a.occupation === k ? "on" : ""}`} onClick={() => set({ occupation: k })}>{t}</button>)}</div>
      </>}
      {step === "level" && <>
        <h2>כמה ניסיון יש לכם?</h2>
        <div className="options">{LEVELS.map((l) => <button key={l.key} className={`option ${a.level === l.key ? "on" : ""}`} onClick={() => set({ level: l.key })}>{l.title}</button>)}</div>
      </>}
      {step === "role" && <>
        <h2>לאיזה תפקיד אתם מכוונים?</h2>
        <div className="options two">
          {ROLES.map((r) => <button key={r.key} className={`option ${a.role === r.key ? "on" : ""}`} onClick={() => set({ role: r.key })}><b>{r.title}</b><small>{r.hint}</small></button>)}
          <button className={`option ${a.role === "other" ? "on" : ""}`} onClick={() => set({ role: "other" })}><b>תפקיד אחר</b><small>כתבו בעצמכם</small></button>
        </div>
        {a.role === "other" && <label>שם התפקיד<input dir="auto" value={a.role_title ?? ""} onChange={(e) => set({ role_title: e.target.value })} placeholder="למשל: Embedded Engineer, Solutions Architect" /></label>}
        <p className="q-label">באיזו רמה התפקיד שאתם מחפשים?</p>
        <div className="seg">{TARGET_LEVELS.map(([k, t]) => <button key={k} className={a.target_level === k ? "on" : ""} onClick={() => set({ target_level: k })}>{t}</button>)}</div>
      </>}
      {step === "stack" && <>
        <h2>עם מה אתם עובדים היום?</h2>
        <label>שפות, פריימוורקים וכלים שאתם מכירים טוב<textarea dir="auto" rows={3} value={a.stack ?? ""} onChange={(e) => set({ stack: e.target.value })} placeholder="למשל: Node.js, TypeScript, PostgreSQL, AWS, קצת Kubernetes" /></label>
      </>}
      {step === "improve" && <>
        <h2>במה אתם רוצים להשתפר?</h2>
        <p className="muted">אפשר לבחור כמה.</p>
        <div className="options two">{IMPROVE_GOALS.map((g) => {
          const on = a.improve?.includes(g.key);
          return <button key={g.key} className={`option ${on ? "on" : ""}`} onClick={() => set({ improve: on ? a.improve!.filter((x) => x !== g.key) : [...(a.improve ?? []), g.key] })}>{g.title}</button>;
        })}</div>
        <label>משהו נוסף שחשוב לכם? (לא חובה)<textarea dir="auto" rows={2} value={a.improve_note ?? ""} onChange={(e) => set({ improve_note: e.target.value })} placeholder="למשל: נכשלתי פעמיים בשלב ה-System Design ואני לא יודע/ת למה" /></label>
      </>}
      {step === "newstack" && <>
        <h2>איזו טכנולוגיה חדשה תרצו ללמוד?</h2>
        <label>סטאק או טכנולוגיה<input dir="auto" value={a.new_stack ?? ""} onChange={(e) => set({ new_stack: e.target.value })} placeholder="למשל: Go, Kubernetes, React, Kafka, Rust" /></label>
      </>}
      {step === "time" && <>
        <h2>כמה זמן יש לנו?</h2>
        <label>יש לכם ראיון בתאריך ידוע? (לא חובה)<input type="date" value={a.interview_date ?? ""} onChange={(e) => set({ interview_date: e.target.value })} /></label>
        <label>כמה שעות בשבוע תוכלו להשקיע? <b>{a.hours_per_week}</b><input type="range" min={1} max={20} value={a.hours_per_week ?? 5} onChange={(e) => set({ hours_per_week: Number(e.target.value) })} /></label>
        <p className="q-label">באיזו שפה תתראיינו?</p>
        <div className="seg">{[["he", "עברית"], ["en", "אנגלית"], ["both", "גם וגם"]].map(([k, t]) => <button key={k} className={a.interview_lang === k ? "on" : ""} onClick={() => set({ interview_lang: k })}>{t}</button>)}</div>
      </>}
      <ErrorBox msg={err} />
      <div className="row between wizard-nav">
        <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>חזרה</button>
        <button className="btn primary" disabled={!canNext} onClick={next}>{i < steps.length - 1 ? "המשך" : "למבחן המיקום"}</button>
      </div>
    </div></div>
  );
}
