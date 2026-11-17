import { useState } from "react";
import { Link } from "react-router-dom";
import { useLearner, useServices } from "@/app/AppContext";
import { useAsyncData } from "@/app/useAsyncData";
import type { Track } from "@/domain/records";
import type { StudyPlan } from "@/domain/StudyPlan";
import type { Topic } from "@/domain/Topic";
import type { TopicList } from "@/domain/TopicList";
import { ErrorMessage, Loading, ProgressBar } from "@/components/ui";

type PlanAction = "" | "build" | "refresh" | "request";

export default function PlanPage({ track }: { track: Track }) {
  const { user } = useLearner();
  const { plans } = useServices();
  const { data: loaded, error: loadError, reload } = useAsyncData(() => plans.loadActivePlan(user.id, track), [plans, user.id, track]);
  const [action, setAction] = useState<PlanAction>("");
  const [actionError, setActionError] = useState("");
  const [refreshNote, setRefreshNote] = useState("");

  /** Run a plan action, then reload the plan; errors show above the plan. */
  async function perform(kind: PlanAction, work: () => Promise<void>) {
    setAction(kind); setActionError("");
    try { await work(); await reload(); } catch (failure) { setActionError((failure as Error).message); }
    setAction("");
  }

  const buildPlan = () => perform("build", async () => { await plans.createPlan(user.id, track); });
  const error = actionError || loadError;

  if (loaded === undefined && !error) return <Loading label="טוען…" />;
  if (action === "build") return <Loading label="בונה תוכנית…" hint="זה לוקח דקה או שתיים" />;
  if (!loaded) return <EmptyPlan track={track} error={error} onBuild={buildPlan} />;

  const { plan, topics } = loaded;
  const refreshFromMarket = () => perform("refresh", async () => {
    setRefreshNote("");
    const addedCount = await plans.refreshFromMarket(plan, topics);
    setRefreshNote(addedCount ? `נוספו ${addedCount} נושאים.` : "התוכנית מעודכנת.");
  });
  const rebuild = () => { if (window.confirm("לבנות את התוכנית מחדש? נושאים שכבר למדתם יישמרו בהיסטוריה.")) void buildPlan(); };

  return (
    <div className="page">
      <div className="row between page-head">
        <div><h1>{plan.title}</h1><p className="muted">{topics.studiedCount}/{topics.size} נושאים נלמדו{plan.refreshedOn ? ` · עודכן ${plan.refreshedOn}` : ""}</p></div>
        <div className="row">
          <button className="btn" onClick={refreshFromMarket} disabled={!!action}>{action === "refresh" ? "בודק…" : "עדכון מהשוק"}</button>
          <button className="btn ghost" onClick={rebuild} disabled={!!action}>בנייה מחדש</button>
        </div>
      </div>
      <ErrorMessage message={error} />
      {refreshNote && <div className="notice">{refreshNote}</div>}
      {action === "refresh" && <Loading label="בודק עדכונים…" />}
      <PlanOverview plan={plan} />
      {topics.moduleNames().map((moduleName) => <ModuleSection key={moduleName} name={moduleName} topics={topics.inModule(moduleName)} />)}
      <TopicRequestForm plan={plan} topics={topics} busy={!!action} onSubmit={(work) => perform("request", work)} submitting={action === "request"} />
    </div>
  );
}

function EmptyPlan({ track, error, onBuild }: { track: Track; error: string; onBuild: () => void }) {
  return (
    <div className="page"><div className="card narrow">
      {track === "ai" ? <>
        <h1>AI ואייג'נטים</h1>
        <p>מהשימוש הבסיסי ב-ChatGPT ועד לבנות ולהוביל אייג'נטים שעושים עבודה אמיתית. המסלול עובר דרך prompting ו-context engineering, tool use, RAG, לולאת האייג'נט, MCP, evals, עבודה עם coding agents, multi-agent ומערכות AI בפרודקשן.</p>
      </> : <><h1>התוכנית שלי</h1><p>עדיין אין לכם תוכנית לימודים.</p></>}
      <ErrorMessage message={error} />
      <button className="btn primary" onClick={onBuild}>{track === "ai" ? "בנו לי את המסלול" : "בנו לי תוכנית"}</button>
    </div></div>
  );
}

function PlanOverview({ plan }: { plan: StudyPlan }) {
  return (
    <section className="card">
      <p>{plan.summary}</p>
      {plan.marketNotes.length > 0 && <><h4>מגמות בשוק</h4><ul>{plan.marketNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></>}
      {plan.trends.length > 0 && <details><summary>מה השתנה לאחרונה</summary>
        {plan.trends.map((trend, index) => <p key={index}><b>{trend.title}:</b> {trend.what_changed} <span className="muted">{trend.why_it_matters}</span></p>)}</details>}
      {plan.excellence.length > 0 && <details><summary>מה מבדיל את הטובים ביותר</summary>
        <ul>{plan.excellence.map((note, index) => <li key={index}><b>{note.title}:</b> {note.why}</li>)}</ul></details>}
      {plan.interviewFormatNotes.length > 0 && <details><summary>מבנה הראיונות</summary>
        <ul>{plan.interviewFormatNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
      {plan.sources.length > 0 && <details><summary>מקורות ({plan.sources.length})</summary>
        <ul className="ltr sources">{plan.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer noopener">{source.title || source.url}</a></li>)}</ul></details>}
    </section>
  );
}

function ModuleSection({ name, topics }: { name: string; topics: Topic[] }) {
  return (
    <section className="card">
      <h3>{name}</h3>
      <div className="topics">{topics.map((topic) => (
        <Link key={topic.id} to={`/lesson/${topic.id}`} className="topic">
          <div className="topic-main">
            <b>{topic.title}</b>
            {topic.isHighPriority && <span className="pill hot">עדיפות גבוהה</span>}
            {topic.isDueForReview() && <span className="pill warn">לחזרה</span>}
            <small className="muted">{topic.description}</small>
            <small className="muted">{topic.kindLabel} · {topic.testLabel} · {topic.estimatedMinutes} דק׳</small>
          </div>
          <div className="topic-side">
            <span className={`pill ${topic.masteryLevel.tone}`}>{topic.masteryLevel.label}</span>
            {topic.isStudied && <ProgressBar value={topic.mastery} />}
          </div>
        </Link>
      ))}</div>
    </section>
  );
}

/** "What else do you want to learn?" */
function TopicRequestForm({ plan, topics, busy, submitting, onSubmit }: {
  plan: StudyPlan; topics: TopicList; busy: boolean; submitting: boolean; onSubmit: (work: () => Promise<void>) => Promise<void>;
}) {
  const { plans } = useServices();
  const [request, setRequest] = useState("");
  const [resultNote, setResultNote] = useState("");

  const submit = () => onSubmit(async () => {
    setResultNote("");
    const { note, addedCount } = await plans.addRequestedTopics(plan, topics, request.trim());
    setRequest("");
    setResultNote(note || (addedCount ? "נוסף לסוף התוכנית." : "לא נוספו נושאים."));
  });

  return (
    <section className="card wish">
      <h3>הוספת נושא</h3>
      <textarea dir="auto" rows={3} value={request} maxLength={2000} onChange={(event) => setRequest(event.target.value)}
        placeholder="מה עוד תרצו ללמוד? למשל: Kafka לעומק, כתיבת design doc, OpenTelemetry" />
      {submitting ? <Loading label="מוסיף…" /> : <button className="btn primary" disabled={!request.trim() || busy} onClick={submit}>הוספה</button>}
      {resultNote && <div className="notice">{resultNote}</div>}
    </section>
  );
}
