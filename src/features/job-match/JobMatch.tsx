import { useState } from "react";
import type { TopicKind } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { runJob } from "@/services/ai";
import { addTopics, profileBrief } from "@/services/plans";
import { db } from "@/services/store";
import type { Plan, Topic } from "@/types";
import { Busy, ErrorBox, ScoreRing } from "@/components/ui";

interface JD {
  role_title: string; company_type: string; fit_summary: string; match_percent: number; must_have: string[]; nice_to_have: string[];
  gaps: { skill: string; why: string; priority: number }[];
  suggested_topics: { title: string; description: string; kind: TopicKind; module: string }[];
  likely_rounds: string[]; questions_to_expect: string[];
}

export default function JobMatch() {
  const { user, profile } = useMe();
  const [text, setText] = useState("");
  const [r, setR] = useState<JD | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [added, setAdded] = useState(false);

  async function plan() { return (await db.list<Plan>("prep_plans", { eq: { user_id: user.id, track: "main", active: true } }))[0]; }
  async function analyse() {
    setBusy(true); setErr(""); setAdded(false);
    try {
      const p = await plan();
      const topics = p ? await db.list<Topic>("prep_topics", { eq: { plan_id: p.id } }) : [];
      setR(await runJob<JD>("jd", { jd_text: text, profile: profileBrief(profile), existing_titles: topics.map((t) => t.title) }, user.id));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function addAll() {
    const p = await plan();
    if (!p || !r) return;
    const topics = await db.list<Topic>("prep_topics", { eq: { plan_id: p.id } });
    await addTopics(user, p, r.suggested_topics.map((t) => ({ ...t, module: `משרה: ${r.role_title}`, priority: 1 })), topics.length);
    setAdded(true);
  }

  return (
    <div className="page">
      <div className="page-head"><h1>התאמה למשרה</h1><p className="muted">הדביקו תיאור משרה שמעניינת אתכם. תקבלו ניתוח פערים מול הפרופיל שלכם, אילו סבבי ראיון לצפות, ונושאים להוסיף לתוכנית.</p></div>
      <div className="card">
        <textarea dir="auto" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="הדביקו כאן את תיאור המשרה (בעברית או באנגלית)…" />
        <button className="btn primary" disabled={busy || text.trim().length < 80} onClick={analyse}>ניתוח המשרה</button>
      </div>
      <ErrorBox msg={err} />
      {busy && <Busy label="מנתחים את המשרה" steps={["קוראים את הדרישות…", "משווים לפרופיל ולתוכנית שלכם…"]} />}
      {r && !busy && <>
        <div className="card"><div className="review-head"><ScoreRing score={r.match_percent} label="התאמה" /><div><h2>{r.role_title}</h2><small className="muted">{r.company_type}</small><p>{r.fit_summary}</p></div></div></div>
        <div className="grid2">
          <div className="card"><h3>דרישות חובה</h3><ul>{r.must_have.map((x, i) => <li key={i}>{x}</li>)}</ul>{r.nice_to_have.length > 0 && <><h4>יתרון</h4><ul>{r.nice_to_have.map((x, i) => <li key={i}>{x}</li>)}</ul></>}</div>
          <div className="card"><h3>הפערים שלכם</h3>{r.gaps.length === 0 ? <p className="muted">לא נמצאו פערים משמעותיים.</p> : <ul className="list">{r.gaps.map((g, i) => <li key={i}><div><b>{g.skill}</b> {g.priority === 1 && <span className="pill hot">קריטי</span>}<br /><small className="muted">{g.why}</small></div></li>)}</ul>}</div>
          <div className="card"><h3>סבבי ראיון צפויים</h3><ol>{r.likely_rounds.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
          <div className="card"><h3>שאלות שכדאי להתכונן אליהן</h3><ul>{r.questions_to_expect.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>
        {r.suggested_topics.length > 0 && <div className="card"><h3>נושאים שיסגרו את הפער</h3>
          <ul className="list">{r.suggested_topics.map((t) => <li key={t.title}><div><b>{t.title}</b><br /><small className="muted">{t.description}</small></div></li>)}</ul>
          {added ? <div className="notice">הנושאים נוספו לתוכנית שלכם כ"חובה לראיון".</div> : <button className="btn primary" onClick={addAll}>הוסיפו את כולם לתוכנית</button>}</div>}
      </>}
    </div>
  );
}
