import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KIND_LABEL, TEST_FOR_KIND, TEST_LABEL } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { addCustomTopics, createPlan, refreshPlan } from "@/services/plans";
import { isDue, levelOf, localDate } from "@/learning/srs";
import { db } from "@/services/store";
import type { Plan, Topic } from "@/types";
import { Bar, Busy, ErrorBox } from "@/components/ui";


export default function PlanPage({ track }: { track: "main" | "ai" }) {
  const { user, profile } = useMe();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [wish, setWish] = useState("");
  const [wishNote, setWishNote] = useState("");

  const load = useCallback(async () => {
    const [p] = await db.list<Plan>("prep_plans", { eq: { user_id: user.id, track, active: true } });
    setPlan(p ?? null);
    setTopics(p ? await db.list<Topic>("prep_topics", { eq: { plan_id: p.id }, order: "ord" }) : []);
  }, [user.id, track]);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  async function build() {
    setBusy("build"); setErr("");
    try { await createPlan(user, profile, track); await load(); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  async function refresh() {
    if (!plan) return;
    setBusy("refresh"); setErr(""); setNote("");
    try { const n = await refreshPlan(user, profile, plan, topics); await load(); setNote(n ? `נוספו ${n} נושאים.` : "התוכנית מעודכנת."); }
    catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  async function addWish() {
    if (!plan || !wish.trim()) return;
    setBusy("wish"); setErr(""); setWishNote("");
    try { const r = await addCustomTopics(user, profile, plan, topics, wish.trim()); await load(); setWish(""); setWishNote(r.note || (r.added ? "נוסף לסוף התוכנית." : "לא נוספו נושאים.")); }
    catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  if (plan === undefined && !err) return <Busy label="טוען…" />;
  if (busy === "build") return <Busy label="בונה תוכנית…" hint="זה לוקח דקה או שתיים" />;

  if (!plan) return (
    <div className="page"><div className="card narrow">
      {track === "ai" ? <>
        <h1>AI ואייג'נטים</h1>
        <p>מהשימוש הבסיסי ב-ChatGPT ועד לבנות ולהוביל אייג'נטים שעושים עבודה אמיתית. המסלול עובר דרך prompting ו-context engineering, tool use, RAG, לולאת האייג'נט, MCP, evals, עבודה עם coding agents, multi-agent ומערכות AI בפרודקשן.</p>
      </> : <><h1>התוכנית שלי</h1><p>עדיין אין לכם תוכנית לימודים.</p></>}
      <ErrorBox msg={err} />
      <button className="btn primary" onClick={build}>{track === "ai" ? "בנו לי את המסלול" : "בנו לי תוכנית"}</button>
    </div></div>
  );

  const modules = [...new Set(topics.map((t) => t.module))];
  const learned = topics.filter((t) => t.reviews > 0).length;
  const refreshed = plan.data.map_refreshed_at ? localDate(plan.data.map_refreshed_at) : "";

  return (
    <div className="page">
      <div className="row between page-head">
        <div><h1>{plan.title}</h1><p className="muted">{learned}/{topics.length} נושאים נלמדו{refreshed ? ` · עודכן ${refreshed}` : ""}</p></div>
        <div className="row">
          <button className="btn" onClick={refresh} disabled={!!busy}>{busy === "refresh" ? "בודק…" : "עדכון מהשוק"}</button>
          <button className="btn ghost" onClick={() => { if (window.confirm("לבנות את התוכנית מחדש? נושאים שכבר למדתם יישמרו בהיסטוריה.")) build(); }} disabled={!!busy}>בנייה מחדש</button>
        </div>
      </div>
      <ErrorBox msg={err} />
      {note && <div className="notice">{note}</div>}
      {busy === "refresh" && <Busy label="בודק עדכונים…" />}

      <section className="card">
        <p>{plan.data.summary}</p>
        {!!plan.data.market_notes?.length && <><h4>מגמות בשוק</h4><ul>{plan.data.market_notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
        {!!plan.data.trends?.length && <details><summary>מה השתנה לאחרונה</summary>{plan.data.trends.map((t, i) => <p key={i}><b>{t.title}:</b> {t.what_changed} <span className="muted">{t.why_it_matters}</span></p>)}</details>}
        {!!plan.data.excellence?.length && <details><summary>מה מבדיל את הטובים ביותר</summary><ul>{plan.data.excellence.map((x, i) => <li key={i}><b>{x.title}:</b> {x.why}</li>)}</ul></details>}
        {!!plan.data.interview_format_notes?.length && <details><summary>מבנה הראיונות</summary><ul>{plan.data.interview_format_notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
        {!!plan.data.sources?.length && <details><summary>מקורות ({plan.data.sources.length})</summary><ul className="ltr sources">{plan.data.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title || s.url}</a></li>)}</ul></details>}
      </section>

      {modules.map((m) => (
        <section key={m} className="card">
          <h3>{m}</h3>
          <div className="topics">{topics.filter((t) => t.module === m).map((t) => { const lv = levelOf(t.mastery, t.reviews); return (
            <Link key={t.id} to={`/lesson/${t.id}`} className="topic">
              <div className="topic-main">
                <b>{t.title}</b>{t.priority === 1 && <span className="pill hot">עדיפות גבוהה</span>}{isDue(t) && <span className="pill warn">לחזרה</span>}
                <small className="muted">{t.description}</small>
                <small className="muted">{KIND_LABEL[t.kind]} · {TEST_LABEL[TEST_FOR_KIND[t.kind]]} · {t.est_minutes} דק׳</small>
              </div>
              <div className="topic-side"><span className={`pill ${lv.tone}`}>{lv.label}</span>{t.reviews > 0 && <Bar value={t.mastery} />}</div>
            </Link>
          ); })}</div>
        </section>
      ))}

      <section className="card wish">
        <h3>הוספת נושא</h3>
        <textarea dir="auto" rows={3} value={wish} maxLength={2000} onChange={(e) => setWish(e.target.value)} placeholder="מה עוד תרצו ללמוד? למשל: Kafka לעומק, כתיבת design doc, OpenTelemetry" />
        {busy === "wish" ? <Busy label="מוסיף…" /> : <button className="btn primary" disabled={!wish.trim() || !!busy} onClick={addWish}>הוספה</button>}
        {wishNote && <div className="notice">{wishNote}</div>}
      </section>
    </div>
  );
}
