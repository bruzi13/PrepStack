import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { INTERVIEW_TYPES, LEVELS, type InterviewType } from "@shared/catalog";
import { useLearner, useServices } from "@/app/AppContext";
import { useAsyncData } from "@/app/useAsyncData";
import { InterviewService, type InterviewSetup } from "@/services/InterviewService";
import { ErrorMessage } from "@/components/ui";

const COMPANY_OPTIONS: [value: string, label: string][] = [["scaleup", "סקייל־אפ ישראלי"], ["bigtech", "חברת ענק גלובלית"], ["startup", "סטארט־אפ צעיר"]];

export default function Interviews() {
  const { profile } = useLearner();
  const { interviews } = useServices();
  const navigate = useNavigate();
  const { data: history = [], error: loadError } = useAsyncData(() => interviews.listRecent(profile.userId), [interviews, profile.userId]);
  const [selectedType, setSelectedType] = useState<InterviewType | null>(null);
  const [setup, setSetup] = useState<InterviewSetup>({ level: profile.targetLevel, lang: profile.interviewLanguage, company: "scaleup", short: false });
  const [startError, setStartError] = useState("");
  const updateSetup = (changes: Partial<InterviewSetup>) => setSetup({ ...setup, ...changes });

  async function start() {
    if (!selectedType) return;
    try {
      const interview = await interviews.start(profile, selectedType, setup);
      navigate(`/interview/${interview.id}`);
    } catch (failure) { setStartError((failure as Error).message); }
  }

  return (
    <div className="page">
      <div className="page-head"><h1>סימולציות ראיון</h1></div>
      <ErrorMessage message={startError || loadError} />
      <div className="grid3">{INTERVIEW_TYPES.map((type) => (
        <button key={type.id} className={`card pickable ${selectedType?.id === type.id ? "on" : ""}`} onClick={() => setSelectedType(type)}>
          <h3>{type.title}</h3><p className="muted">{type.blurb}</p><small className="muted">{type.minutes} דק׳</small>
        </button>
      ))}</div>

      {selectedType && <div className="card setup">
        <h3>{selectedType.title}</h3>
        <div className="setup-grid">
          <label>רמה<select value={setup.level} onChange={(event) => updateSetup({ level: event.target.value })}>
            {LEVELS.filter((level) => level.key !== "student").map((level) => <option key={level.key} value={level.key}>{level.title}</option>)}
          </select></label>
          <label>שפת הראיון<select value={setup.lang} onChange={(event) => updateSetup({ lang: event.target.value })}>
            <option value="he">עברית</option><option value="en">English</option>
          </select></label>
          <label>סוג חברה<select value={setup.company} onChange={(event) => updateSetup({ company: event.target.value })}>
            {COMPANY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>אורך<select value={setup.short ? "short" : "full"} onChange={(event) => updateSetup({ short: event.target.value === "short" })}>
            <option value="full">מלא ({selectedType.minutes} דק׳)</option>
            <option value="short">קצר ({InterviewService.minutesFor(selectedType, true)} דק׳)</option>
          </select></label>
        </div>
        <p className="muted">קריטריונים: {selectedType.rubric.join(" · ")}</p>
        <button className="btn primary big" onClick={start}>התחלה</button>
      </div>}

      {history.length === 0 && !selectedType && <section className="card empty">
        <div className="empty-art" aria-hidden><span /><span /><span /></div>
        <h3>עוד אין סימולציות</h3>
        <p className="muted">כל סימולציה נגמרת בכרטיס ציונים כמו של ועדת גיוס, והנושאים החלשים נכנסים לתוכנית. בחרו סוג ראיון למעלה כדי להתחיל.</p>
      </section>}

      {history.length > 0 && <section className="card"><h3>היסטוריה</h3>
        <ul className="list">{history.map((interview) => (
          <li key={interview.id}><Link to={`/interview/${interview.id}`}>
            <span>{interview.title} <small className="muted">· {interview.startedOn}</small></span>
            <span className="pill">{interview.isFinished && interview.score != null ? Math.round(interview.score) : "—"}</span>
          </Link></li>
        ))}</ul>
      </section>}
    </div>
  );
}
