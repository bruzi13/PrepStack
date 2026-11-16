import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { INTERVIEW_TYPES, LEVELS, type InterviewType } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { db } from "@/services/store";
import type { Interview } from "@/types";
import { ErrorBox } from "@/components/ui";

export default function Interviews() {
  const { user, profile } = useMe();
  const nav = useNavigate();
  const a = profile.answers;
  const [past, setPast] = useState<Interview[]>([]);
  const [pick, setPick] = useState<InterviewType | null>(null);
  const [cfg, setCfg] = useState({ level: a.target_level ?? (a.level === "student" ? "junior" : a.level ?? "mid"), lang: a.interview_lang === "en" ? "en" : "he", company: "scaleup", short: false });
  const [err, setErr] = useState("");

  useEffect(() => { db.list<Interview>("prep_interviews", { eq: { user_id: user.id }, order: "created_at", asc: false, limit: 20 }).then(setPast).catch((e) => setErr(e.message)); }, [user.id]);

  async function start() {
    if (!pick) return;
    try {
      const [row] = await db.insert<Interview>("prep_interviews", {
        user_id: user.id, type: pick.id, status: "live", transcript: [], workspace: null,
        config: { ...cfg, title: pick.title, minutes: cfg.short ? Math.round(pick.minutes / 2.5) : pick.minutes, role: a.role_title, stack: a.stack },
      });
      nav(`/interview/${row.id}`);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="page">
      <div className="page-head"><h1>סימולציות ראיון</h1><p className="muted">מראיין AI שמתנהג כמו מראיין אמיתי: שואל, חופר, מקשה. בסוף מקבלים את כרטיס הציונים שבראיון אמיתי אף פעם לא רואים.</p></div>
      <ErrorBox msg={err} />
      <div className="grid3">{INTERVIEW_TYPES.map((t) => (
        <button key={t.id} className={`card pickable ${pick?.id === t.id ? "on" : ""}`} onClick={() => setPick(t)}>
          <div className="f-icon" aria-hidden>{t.icon}</div><h3>{t.title}</h3><p className="muted">{t.blurb}</p><small className="muted">כ-{t.minutes} דקות</small>
        </button>
      ))}</div>

      {pick && <div className="card setup">
        <h3>{pick.icon} {pick.title}</h3>
        <div className="setup-grid">
          <label>רמה<select value={cfg.level} onChange={(e) => setCfg({ ...cfg, level: e.target.value })}>{LEVELS.filter((l) => l.key !== "student").map((l) => <option key={l.key} value={l.key}>{l.title}</option>)}</select></label>
          <label>שפת הראיון<select value={cfg.lang} onChange={(e) => setCfg({ ...cfg, lang: e.target.value })}><option value="he">עברית</option><option value="en">English</option></select></label>
          <label>סוג חברה<select value={cfg.company} onChange={(e) => setCfg({ ...cfg, company: e.target.value })}><option value="scaleup">סקייל־אפ ישראלי</option><option value="bigtech">חברת ענק גלובלית</option><option value="startup">סטארט־אפ צעיר</option></select></label>
          <label>אורך<select value={cfg.short ? "1" : ""} onChange={(e) => setCfg({ ...cfg, short: !!e.target.value })}><option value="">מלא ({pick.minutes} דק׳)</option><option value="1">קצר ({Math.round(pick.minutes / 2.5)} דק׳)</option></select></label>
        </div>
        <p className="muted">נבחן על: {pick.rubric.join(" · ")}</p>
        <button className="btn primary big" onClick={start}>התחלת הראיון</button>
      </div>}

      {past.length > 0 && <section className="card"><h3>ראיונות קודמים</h3>
        <ul className="list">{past.map((x) => <li key={x.id}><Link to={`/interview/${x.id}`}><span>{x.config.title ?? x.type} <small className="muted">· {x.created_at.slice(0, 10)}</small></span><span className="pill">{x.status === "done" && x.score != null ? Math.round(x.score) : "לא הסתיים"}</span></Link></li>)}</ul>
      </section>}
    </div>
  );
}
