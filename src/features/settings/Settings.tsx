import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LEVELS, TARGET_LEVELS } from "@shared/catalog";
import { useLearner, useServices } from "@/app/AppContext";
import { useTheme, type ThemePreference } from "@/app/theme";

const THEME_OPTIONS: [ThemePreference, string][] = [["system", "לפי המכשיר"], ["light", "בהיר"], ["dark", "כהה"]];
const MIN_PASSWORD_LENGTH = 6;

export default function Settings() {
  const { user, profile, saveProfile } = useLearner();
  const { auth, isDemo } = useServices();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [interviewDate, setInterviewDate] = useState(profile.interviewDate);
  const [hoursPerWeek, setHoursPerWeek] = useState(profile.hoursPerWeek);
  const [experienceLevel, setExperienceLevel] = useState(profile.experienceLevel);
  const [targetLevel, setTargetLevel] = useState(profile.targetLevel);
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useTheme();

  async function saveProfileChanges() {
    const levelChanged = targetLevel !== profile.answers.target_level || experienceLevel !== profile.answers.level;
    await saveProfile({
      displayName: displayName.trim() || profile.displayName,
      answers: { ...profile.answers, interview_date: interviewDate, hours_per_week: hoursPerWeek, level: experienceLevel, target_level: targetLevel },
    });
    setNotice(levelChanged ? "נשמר. כדי שהתוכנית תותאם לרמה החדשה, לחצו בעמוד התוכנית על \"בנייה מחדש\"." : "נשמר.");
  }

  async function retakeQuestionnaire() {
    if (!window.confirm("למלא את השאלון מחדש? בסופו תיבנה תוכנית חדשה.")) return;
    await saveProfile({ answers: { ...profile.answers, onboarded: false } });
    navigate("/onboarding");
  }

  async function changePassword() {
    setNotice((await auth.changePassword(newPassword)) ?? "הסיסמה הוחלפה.");
    setNewPassword("");
  }

  return (
    <div className="page">
      <div className="page-head"><h1>הגדרות</h1><p className="muted" dir="ltr">{user.email}</p></div>
      {notice && <div className="notice">{notice}</div>}
      <fieldset className="card theme-pick">
        <legend><h3>מראה</h3></legend>
        <div className="seg">{THEME_OPTIONS.map(([value, label]) => (
          <label key={value} className={theme === value ? "on" : ""}>
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />{label}
          </label>
        ))}</div>
        <small className="muted">ההגדרה נשמרת במכשיר הזה.</small>
      </fieldset>
      <div className="card form">
        <h3>הפרופיל שלי</h3>
        <label>שם<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>תאריך ראיון<input type="date" value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} /></label>
        <label>שעות לימוד בשבוע: <b>{hoursPerWeek}</b><input type="range" min={1} max={20} value={hoursPerWeek} onChange={(event) => setHoursPerWeek(Number(event.target.value))} /></label>
        <label>הניסיון שלי<select value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value)}>
          {LEVELS.map((level) => <option key={level.key} value={level.key}>{level.title}</option>)}
        </select></label>
        <label>רמת התפקיד שאני מחפש/ת<select value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)}>
          {TARGET_LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button className="btn primary" onClick={saveProfileChanges}>שמירה</button>
      </div>
      <div className="card">
        <h3>מה אמרתם לנו בהרשמה</h3>
        <p>תפקיד יעד: <b>{profile.roleTitle}</b> · ניסיון: {profile.experienceLabel} · רמת תפקיד: {profile.targetLevelLabel}</p>
        {profile.stack && <p>סטאק: <span dir="auto">{profile.stack}</span></p>}
        <p>רוצים להשתפר ב: {profile.improvementGoalLabels.join(" · ")}</p>
        <button className="btn" onClick={retakeQuestionnaire}>מילוי השאלון מחדש</button>
      </div>
      {!isDemo && <div className="card form">
        <h3>החלפת סיסמה</h3>
        <label>סיסמה חדשה<input type="password" dir="ltr" minLength={MIN_PASSWORD_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>
        <button className="btn" disabled={newPassword.length < MIN_PASSWORD_LENGTH} onClick={changePassword}>החלפה</button>
      </div>}
      <button className="btn ghost" onClick={() => auth.signOut().then(() => navigate("/"))}>התנתקות</button>
    </div>
  );
}
