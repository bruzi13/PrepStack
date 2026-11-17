import { useState } from "react";
import { useLearner, useServices } from "@/app/AppContext";
import type { JobAnalysis } from "@/domain/records";
import { ErrorMessage, Loading, ScoreRing } from "@/components/ui";

/** The server refuses shorter texts: too little to analyse. */
const MIN_DESCRIPTION_LENGTH = 80;

export default function JobMatch() {
  const { user } = useLearner();
  const { plans, jobMatch } = useServices();
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState("");
  const [addedToPlan, setAddedToPlan] = useState(false);

  async function analyse() {
    setAnalysing(true); setError(""); setAddedToPlan(false);
    try { setAnalysis(await jobMatch.analyse(description)); } catch (failure) { setError((failure as Error).message); }
    setAnalysing(false);
  }

  async function addSuggestedTopics() {
    if (!analysis) return;
    setError("");
    try {
      const added = await plans.addSuggestions(user.id, analysis.suggested_topics, `משרה: ${analysis.role_title}`);
      if (added) setAddedToPlan(true); else setError("אין עדיין תוכנית שאפשר להוסיף אליה.");
    } catch (failure) { setError((failure as Error).message); }
  }

  return (
    <div className="page">
      <div className="page-head"><h1>התאמה למשרה</h1></div>
      <div className="card">
        <textarea dir="auto" rows={10} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="תיאור המשרה" />
        <button className="btn primary" disabled={analysing || description.trim().length < MIN_DESCRIPTION_LENGTH} onClick={analyse}>ניתוח</button>
      </div>
      <ErrorMessage message={error} />
      {analysing && <Loading label="מנתח…" />}
      {analysis && !analysing && <AnalysisView analysis={analysis} addedToPlan={addedToPlan} onAddToPlan={addSuggestedTopics} />}
    </div>
  );
}

function AnalysisView({ analysis, addedToPlan, onAddToPlan }: { analysis: JobAnalysis; addedToPlan: boolean; onAddToPlan: () => void }) {
  return <>
    <div className="card"><div className="review-head">
      <ScoreRing score={analysis.match_percent} label="התאמה" />
      <div><h2>{analysis.role_title}</h2><small className="muted">{analysis.company_type}</small><p>{analysis.fit_summary}</p></div>
    </div></div>
    <div className="grid2">
      <div className="card">
        <h3>דרישות חובה</h3><ul>{analysis.must_have.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul>
        {analysis.nice_to_have.length > 0 && <><h4>יתרון</h4><ul>{analysis.nice_to_have.map((advantage, index) => <li key={index}>{advantage}</li>)}</ul></>}
      </div>
      <div className="card">
        <h3>פערים</h3>
        {analysis.gaps.length === 0 ? <p className="muted">לא נמצאו פערים משמעותיים.</p> : <ul className="list">{analysis.gaps.map((gap, index) => (
          <li key={index}><div><b>{gap.skill}</b> {gap.priority === 1 && <span className="pill hot">קריטי</span>}<br /><small className="muted">{gap.why}</small></div></li>
        ))}</ul>}
      </div>
      <div className="card"><h3>סבבים צפויים</h3><ol>{analysis.likely_rounds.map((round, index) => <li key={index}>{round}</li>)}</ol></div>
      <div className="card"><h3>שאלות צפויות</h3><ul>{analysis.questions_to_expect.map((question, index) => <li key={index}>{question}</li>)}</ul></div>
    </div>
    {analysis.suggested_topics.length > 0 && <div className="card">
      <h3>נושאים מומלצים</h3>
      <ul className="list">{analysis.suggested_topics.map((topic) => <li key={topic.title}><div><b>{topic.title}</b><br /><small className="muted">{topic.description}</small></div></li>)}</ul>
      {addedToPlan ? <div className="notice">נוסף לתוכנית.</div> : <button className="btn primary" onClick={onAddToPlan}>הוספה לתוכנית</button>}
    </div>}
  </>;
}
