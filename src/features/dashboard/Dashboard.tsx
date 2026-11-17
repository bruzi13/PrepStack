import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatById, KIND_LABEL, TEST_FOR_KIND, TEST_LABEL } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { formatInsights, observations } from "@/learning/adapt";
import { isDue, levelOf, streak, weekStart } from "@/learning/srs";
import { db } from "@/services/store";
import type { Feedback, Interview, Lesson, Plan, Topic } from "@/types";
import { Bar, ErrorBox, ScoreRing } from "@/components/ui";

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
  if (!d) return <TodaySkeleton />;

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

  const lastIv = d.interviews.filter((x) => x.score != null).slice(-1)[0];
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const first = due[0] ?? next;

  return (
    <div className="page">
      <header className="row between page-head">
        <div><span className="eyebrow">{today}</span><h1>שלום {profile.display_name}</h1><p className="muted">{profile.answers.role_title}</p></div>
        {daysLeft != null && daysLeft >= 0 && <div className="countdown"><b>{daysLeft}</b>{daysLeft === 1 ? "יום לראיון" : "ימים לראיון"}</div>}
      </header>

      <section className="next-card" aria-labelledby="next-h">
        <div className="next-main">
          {first ? <>
            <span className="next-label">הצעד הבא{next && !due.length ? ` · כ-${next.est_minutes} דקות` : ""}</span>
            <h2 id="next-h">{due.length && next ? `${due.length} ${due.length === 1 ? "חזרה" : "חזרות"}, ואז ${next.title}` : due.length ? `${due.length} ${due.length === 1 ? "חזרה ממתינה" : "חזרות ממתינות"}` : next!.title}</h2>
            {next && <p className="next-meta">{KIND_LABEL[next.kind]} · מבחן: {TEST_LABEL[TEST_FOR_KIND[next.kind]]}</p>}
            <div className="row">
              <Link className="btn primary big" to={`/lesson/${first.id}`}>{due.length ? "להתחיל בחזרות" : "להתחיל שיעור"}</Link>
              {due.length > 0 && next && <Link className="btn big" to={`/lesson/${next.id}`}>ישר לשיעור</Link>}
            </div>
          </> : <>
            <span className="next-label">הצעד הבא</span>
            <h2 id="next-h">כל הנושאים בתוכנית נלמדו ואין חזרות שממתינות</h2>
            <div className="row"><Link className="btn primary big" to="/interviews">לסימולציית ראיון</Link><Link className="btn big" to="/plan">הוספת נושאים</Link></div>
          </>}
        </div>
        <div className="next-side"><ScoreRing score={readiness} size={112} /><b>מוכנות לראיון</b><small>ממוצע השליטה בנושאי התוכנית, לפי חשיבות</small></div>
      </section>

      <section className="stats" aria-label="השבוע">
        <div className="card stat"><div><span className="stat-label">שיעורים השבוע</span><div className="big-num">{week.length}</div><small className="muted">{weekAvg != null ? `ציון ממוצע ${weekAvg}` : "עוד לא התחלתם השבוע"}</small></div></div>
        <div className="card stat"><div><span className="stat-label">דקות למידה</span><div className="big-num">{weekMinutes}<small> / {goalMinutes}</small></div><Bar value={(weekMinutes / goalMinutes) * 100} tone="ok" label="יעד שבועי" /></div></div>
        <div className="card stat"><div><span className="stat-label">ימים ברצף</span><div className="big-num">{days}</div><small className="muted">{weekInterviews.length} סימולציות השבוע</small></div></div>
        <div className="card stat"><div><span className="stat-label">סימולציה אחרונה</span>{lastIv ? <><div className="big-num">{Math.round(lastIv.score!)}</div><Link to={`/interview/${lastIv.id}`} className="muted small-link">{lastIv.config.title ?? lastIv.type}</Link></> : <><div className="big-num">–</div><Link to="/interviews" className="muted small-link">להתחיל סימולציה</Link></>}</div></div>
      </section>

      <div className="grid2">
        <section className="card" aria-labelledby="due-h">
          <div className="row between card-head"><h3 id="due-h">חזרות להיום</h3>{due.length > 0 && <span className="pill warn">↻ {due.length} ממתינות</span>}</div>
          {due.length === 0 ? <p className="muted">אין חזרות שממתינות. {next ? "אפשר להתקדם לשיעור הבא." : ""}</p> : (
            <ul className="list">{due.slice(0, 6).map((t) => { const lv = levelOf(t.mastery, t.reviews); return (
              <li key={t.id}><Link to={`/lesson/${t.id}`}><span>{t.title}</span><span className={`pill ${lv.tone}`}>{lv.label} · {Math.round(t.mastery)}</span></Link></li>
            ); })}</ul>
          )}
          {due.length > 0 && <small className="muted">חזרה במרווחים: נושא שנלמד חוזר לתרגול בדיוק כשמתחילים לשכוח אותו.</small>}
        </section>

        <section className="card" aria-labelledby="lvl-h">
          <div className="row between card-head"><h3 id="lvl-h">רמה לפי תחום</h3><Link to="/plan" className="link">לתוכנית המלאה</Link></div>
          {modules.length === 0 ? <p className="muted">אין עדיין תוכנית.</p> : modules.map((m) => (
            <div key={m.track + m.name} className="mod-row"><div className="row between"><span>{m.name}{m.track === "ai" && <span className="pill hot">AI</span>}</span><small className="muted">{m.done}/{m.total} · שליטה {m.mastery}</small></div><Bar value={m.mastery} label={m.name} /></div>
          ))}
        </section>

        <section className="card" aria-labelledby="how-h">
          <h3 id="how-h">איך אתם לומדים הכי טוב</h3>
          {ins.bestByScore ? <>
            <p>התוצאות הטובות ביותר שלכם הגיעו אחרי שיעורים בפורמט <b>{formatById(ins.bestByScore.format).name}</b> (ציון ממוצע {Math.round(ins.bestByScore.avgScore!)}).</p>
            {ins.mismatch && <p className="muted">מעניין: הפורמט שדירגתם הכי גבוה הוא דווקא {formatById(ins.bestByRating!.format).name}.</p>}
          </> : <p className="muted">אחרי כמה שיעורים בפורמטים שונים נדע איזה סוג שיעור מביא אתכם לציונים הכי גבוהים, והשיעורים יותאמו לזה.</p>}
          <Link to="/insights" className="link">לפירוט המלא</Link>
        </section>

        {weekTopics.length > 0 && <section className="card" aria-labelledby="wk-h">
          <h3 id="wk-h">מה למדתם השבוע</h3>
          <ul className="list">{weekTopics.map((t, i) => { const lv = levelOf(t.mastery, t.reviews); return (
            <li key={i}><Link to={`/lesson/${t.id}`}><span>{t.title} <small className="muted">· {KIND_LABEL[t.kind]}</small></span><span className={`pill ${lv.tone}`}>{lv.label} · {Math.round(t.mastery)}</span></Link></li>
          ); })}</ul>
        </section>}
      </div>

      {notes.length > 0 && <section className="card"><h3>מה השוק מצפה עכשיו</h3><ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul><Link to="/plan" className="link">לתוכנית ולעדכוני שוק</Link></section>}
    </div>
  );
}

/** Shown while the dashboard's data loads: the same shapes, so nothing jumps when it arrives. */
function TodaySkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="טוען את היום">
      <div className="sk" style={{ height: 64, width: "40%" }} />
      <div className="sk" style={{ height: 200, borderRadius: 20 }} />
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 110 }} />)}</div>
      <div className="grid2"><div className="sk" style={{ height: 220 }} /><div className="sk" style={{ height: 220 }} /></div>
    </div>
  );
}
