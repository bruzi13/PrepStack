// The hiring-committee style scorecard after a mock interview, with drills the learner can add to their plan.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useLearner, useServices } from "@/app/AppContext";
import { HIRE_SIGNAL_LABEL, InterviewTranscript, type MockInterview } from "@/domain/MockInterview";
import type { ChatMessage, SuggestedTopic } from "@/domain/records";
import { ErrorMessage, ProgressBar, ScoreRing } from "@/components/ui";

const DRILLS_MODULE = "מהראיונות שלי";

/** A hiring signal reads as positive from 70 and borderline from 50. */
const hireSignalTone = (score: number) => (score >= 70 ? "good" : score >= 50 ? "warn" : "bad");

export function ScorecardView({ interview, transcript }: { interview: MockInterview; transcript: ChatMessage[] }) {
  const { user } = useLearner();
  const { plans } = useServices();
  const scorecard = interview.scorecard!;
  const [addedDrills, setAddedDrills] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function addDrill(drill: SuggestedTopic) {
    setError("");
    try {
      const added = await plans.addSuggestions(user.id, [drill], DRILLS_MODULE);
      if (added) setAddedDrills([...addedDrills, drill.title]); else setError("אין עדיין תוכנית שאפשר להוסיף אליה.");
    } catch (failure) { setError((failure as Error).message); }
  }

  return (
    <div className="page">
      <Link to="/interviews" className="link">→ לראיונות</Link>
      <div className="card">
        <div className="review-head">
          <ScoreRing score={scorecard.score} label="ציון" />
          <div>
            <h2>{interview.title}</h2>
            <span className={`pill ${hireSignalTone(scorecard.score)}`}>{HIRE_SIGNAL_LABEL[scorecard.hire_signal] ?? scorecard.hire_signal}</span>
            <p>{scorecard.summary}</p>
          </div>
        </div>
        <div className="dims">{scorecard.dimensions.map((dimension) => (
          <div key={dimension.name} className="dim">
            <div className="dim-top"><span>{dimension.name}</span><b>{dimension.score}</b></div>
            <ProgressBar value={dimension.score} /><small className="muted">{dimension.comment}</small>
          </div>
        ))}</div>
      </div>
      <div className="grid2">
        <div className="card"><h3>מה עבד</h3><ul className="plus">{scorecard.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul></div>
        <div className="card"><h3>מה לשפר</h3><ul>{scorecard.improvements.map((improvement, index) => <li key={index}>{improvement}</li>)}</ul></div>
      </div>
      {scorecard.moments.length > 0 && <div className="card"><h3>רגעים מרכזיים</h3>{scorecard.moments.map((moment, index) => (
        <div key={index} className="moment">
          <blockquote>"{moment.quote}"</blockquote>
          <p><b>משוב:</b> {moment.feedback}</p>
          <p><b>חלופה חזקה:</b> {moment.better}</p>
        </div>
      ))}</div>}
      {scorecard.drills.length > 0 && <div className="card"><h3>להמשך</h3>
        <ErrorMessage message={error} />
        <ul className="list">{scorecard.drills.map((drill) => {
          const added = addedDrills.includes(drill.title);
          return (
            <li key={drill.title}><div className="row between">
              <span><b>{drill.title}</b> <small className="muted">{drill.description}</small></span>
              <button className="btn small" disabled={added} onClick={() => addDrill(drill)}>{added ? "נוסף לתוכנית" : "הוספה לתוכנית"}</button>
            </div></li>
          );
        })}</ul>
      </div>}
      <details className="card"><summary>תמליל הראיון</summary><TranscriptLog transcript={transcript} /></details>
    </div>
  );
}

function speakerName(message: ChatMessage): string {
  if (message.tool) return "עוזר AI";
  return message.role === "user" ? "אתם" : "המראיין";
}

function TranscriptLog({ transcript }: { transcript: ChatMessage[] }) {
  return (
    <div className="chat-log static">{new InterviewTranscript(transcript).visibleMessages.map((message, index) => (
      <div key={index} className={`msg ${message.role} ${message.tool ? "tool" : ""}`}>
        <span className="who">{speakerName(message)}</span><div className="md">{message.content}</div>
      </div>
    ))}</div>
  );
}
