import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatById, KIND_LABEL } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { formatInsights, observations } from "@/learning/adapt";
import { isDue, levelOf, streak, weekStart } from "@/learning/srs";
import { db } from "@/services/store";
import type { Feedback, Interview, Lesson, Plan, Topic } from "@/types";
import { Bar, Busy, ErrorBox, ScoreRing } from "@/components/ui";

export default function Dashboard() {
  const { user, profile } = useMe();
  const [d, setD] = useState<{ topics: Topic[]; lessons: Lesson[]; interviews: Interview[]; feedback: Feedback[]; plans: Plan[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const eq = { user_id: user.id };
    Promise.all([
      db.list<Topic>("prep_topics", { eq, order: "ord" }), db.list<Lesson>("prep_lessons", { eq, order: "created_at" }),
      db.list<Interview>("prep_interviews", { eq, order: "created_at" }), db.list<Feedback>("prep_feedback", { eq }),
      db.list<Plan>("prep_plans", { eq: { ...eq, active: true } }),
    ]).then(([topics, lessons, interviews, feedback, plans]) => {
      const live = new Set(plans.map((p) => p.id));
      setD({ topics: topics.filter((t) => live.has(t.plan_id)), lessons, interviews, feedback, plans });
    }).catch((e) => setErr(e.message));
  }, [user.id]);

  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Busy label="טוען את לוח הבקרה…" />;

  const since = weekStart();
  const doneLessons = d.lessons.filter((l) => l.status === "done" && l.completed_at);
  const week = doneLessons.filter((l) => l.completed_at! >= since);
  const weekInterviews = d.interviews.filter((x) => x.status === "done" && x.created_at >= since);
  const weekMinutes = Math.round(week.reduce((s, l) => s + (l.minutes ?? 0), 0));
  const weekAvg = week.length ? Math.round(week.reduce((s, l) => s + (l.score ?? 0), 0) / week.length) : null;
  const goalMinutes = (profile.answers.hours_per_week ?? 5) * 60;
  const days = streak([...doneLessons.map((l) => l.completed_at!), ...d.interviews.filter((x) => x.status === "done").map((x) => x.created_at)]);

  const main = d.topics.filter((t) => t.track === "main");
  const weight = (t: Topic) => 4 - t.priority;
  const readiness = main.length ? Math.round(main.reduce((s, t) => s + t.mastery * weight(t), 0) / main.reduce((s, t) => s + weight(t), 0)) : 0;
  const due = d.topics.filter(isDue).sort((a, b) => a.mastery - b.mastery);
  const next = d.topics.filter((t) => t.reviews === 0).sort((a, b) => (a.track === b.track ? a.ord - b.ord : a.track === "main" ? -1 : 1))[0];
  const weekTopics = week.map((l) => d.topics.find((t) => t.id === l.topic_id)).filter((t): t is Topic => !!t);
  const modules = [...new Set(d.topics.map((t) => `${t.track}|${t.module}`))].map((key) => {
    const ts = d.topics.filter((t) => `${t.track}|${t.module}` === key);
    return { name: ts[0].module, track: ts[0].track, done: ts.filter((t) => t.reviews > 0).length, total: ts.length, mastery: Math.round(ts.reduce((s, t) => s + t.mastery, 0) / ts.length) };
  });
  const ins = formatInsights(observations(d.lessons, d.feedback));
  const daysLeft = profile.answers.interview_date ? Math.ceil((new Date(profile.answers.interview_date).getTime() - Date.now()) / 86400000) : null;
  const notes = d.plans.find((p) => p.track === "main")?.data.market_notes ?? [];

  return (
    <div className="page">
      <div className="row between page-head">
        <div><span className="eyebrow">לוח בקרה</span><h1>שלום {profile.display_name}</h1><p className="muted">{profile.answers.role_title}{daysLeft != null && daysLeft >= 0 ? ` · ${daysLeft} ימים לראיון` : ""}</p></div>
        {next && <Link className="btn primary next-btn" to={`/lesson/${next.id}`}><span><small>השיעור הבא</small>{next.title}</span></Link>}
      </div>

      <div className="stats">
        <div className="card stat stat-lead"><ScoreRing score={readiness} size={84} /><div><span className="stat-label">מוכנות לראיון</span></div></div>
        <div className="card stat"><div><span className="stat-label">שיעורים השבוע</span><div className="big-num">{week.length}</div><small className="muted">{weekAvg != null ? `ציון ממוצע ${weekAvg}` : "—"}</small></div></div>
        <div className="card stat"><div><span className="stat-label">דקות למידה השבוע</span><div className="big-num">{weekMinutes}<small> / {goalMinutes}</small></div><Bar value={(weekMinutes / goalMinutes) * 100} tone="ok" /></div></div>
        <div className="card stat"><div><span className="stat-label">ימים ברצף</span><div className="big-num">{days}</div><small className="muted">{weekInterviews.length} ראיונות השבוע</small></div></div>
      </div>

      <div className="grid2">
        <section className="card">
          <h3>לחזרה היום</h3>
          {due.length === 0 ? <p className="muted">אין חזרות להיום.</p> : (
            <ul className="list">{due.slice(0, 6).map((t) => { const lv = levelOf(t.mastery, t.reviews); return (
              <li key={t.id}><Link to={`/lesson/${t.id}`}><span>{t.title}</span><span className={`pill ${lv.tone}`}>{lv.label} · {Math.round(t.mastery)}</span></Link></li>
            ); })}</ul>
          )}
        </section>

        <section className="card">
          <h3>השבוע</h3>
          {weekTopics.length === 0 ? <p className="muted">עוד לא הושלם שיעור השבוע.</p> : (
            <ul className="list">{weekTopics.map((t, i) => { const lv = levelOf(t.mastery, t.reviews); return (
              <li key={i}><Link to={`/lesson/${t.id}`}><span>{t.title} <small className="muted">· {KIND_LABEL[t.kind]}</small></span><span className={`pill ${lv.tone}`}>{lv.label} · {Math.round(t.mastery)}</span></Link></li>
            ); })}</ul>
          )}
        </section>

        <section className="card">
          <h3>לפי תחום</h3>
          {modules.length === 0 ? <p className="muted">אין עדיין תוכנית.</p> : modules.map((m) => (
            <div key={m.track + m.name} className="mod-row"><div className="row between"><span>{m.name}{m.track === "ai" && <span className="pill hot">AI</span>}</span><small className="muted">{m.done}/{m.total} נלמדו · {m.mastery}</small></div><Bar value={m.mastery} /></div>
          ))}
        </section>

        <section className="card">
          <h3>ביצועים</h3>
          <div className="kv"><span>פורמט מוביל</span><b>{ins.bestByScore ? formatById(ins.bestByScore.format).name : "—"}</b></div>
          {ins.bestByScore && <div className="kv"><span>ציון ממוצע בו</span><b>{Math.round(ins.bestByScore.avgScore!)}</b></div>}
          <Link to="/insights" className="link">לכל התובנות</Link>
          {d.interviews.filter((x) => x.score != null).length > 0 && <>
            <h4>ראיונות אחרונים</h4>
            <ul className="list">{d.interviews.filter((x) => x.score != null).slice(-3).reverse().map((x) => <li key={x.id}><Link to={`/interview/${x.id}`}><span>{x.config.title ?? x.type}</span><span className="pill">{Math.round(x.score!)}</span></Link></li>)}</ul>
          </>}
        </section>
      </div>

      {notes.length > 0 && <section className="card"><h3>מגמות בשוק</h3><ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul><Link to="/plan" className="link">לתוכנית</Link></section>}
    </div>
  );
}
