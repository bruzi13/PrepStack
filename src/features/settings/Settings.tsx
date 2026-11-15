import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IMPROVE_GOALS, LEVELS } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { auth, DEMO } from "@/services/store";

export default function Settings() {
  const { user, profile, saveProfile } = useMe();
  const nav = useNavigate();
  const a = profile.answers;
  const [name, setName] = useState(profile.display_name);
  const [date, setDate] = useState(a.interview_date ?? "");
  const [hours, setHours] = useState(a.hours_per_week ?? 5);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  return (
    <div className="page">
      <div className="page-head"><h1>הגדרות</h1><p className="muted" dir="ltr">{user.email}</p></div>
      {msg && <div className="notice">{msg}</div>}
      <div className="card form">
        <h3>הפרופיל שלי</h3>
        <label>שם<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>תאריך ראיון<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>שעות לימוד בשבוע: <b>{hours}</b><input type="range" min={1} max={20} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <button className="btn primary" onClick={async () => { await saveProfile({ display_name: name.trim() || profile.display_name, answers: { ...a, interview_date: date, hours_per_week: hours } }); setMsg("נשמר."); }}>שמירה</button>
      </div>
      <div className="card">
        <h3>מה אמרתם לנו בהרשמה</h3>
        <p>תפקיד יעד: <b>{a.role_title}</b> · רמה: {LEVELS.find((l) => l.key === a.level)?.title ?? a.level}</p>
        {a.stack && <p>סטאק: <span dir="auto">{a.stack}</span></p>}
        <p>רוצים להשתפר ב: {(a.improve ?? []).map((k) => IMPROVE_GOALS.find((g) => g.key === k)?.title).filter(Boolean).join(" · ")}</p>
        <button className="btn" onClick={async () => { if (!window.confirm("למלא את השאלון מחדש? בסופו תיבנה תוכנית חדשה.")) return; await saveProfile({ answers: { ...a, onboarded: false } }); nav("/onboarding"); }}>מילוי השאלון מחדש</button>
      </div>
      {!DEMO && <div className="card form">
        <h3>החלפת סיסמה</h3>
        <label>סיסמה חדשה<input type="password" dir="ltr" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        <button className="btn" disabled={pw.length < 6} onClick={async () => { setMsg((await auth.setPassword(pw)) ?? "הסיסמה הוחלפה."); setPw(""); }}>החלפה</button>
      </div>}
      <button className="btn ghost" onClick={() => auth.signOut().then(() => nav("/"))}>התנתקות</button>
    </div>
  );
}
