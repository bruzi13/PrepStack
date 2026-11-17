// The maintainer board: who uses PrepStack, what it costs, how many lessons are made and served from the
// shared cache, what is failing, and the two decisions maintainers make (cache rollout, learner topic requests).
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/services/ai";
import { Busy, ErrorBox } from "@/components/ui";

interface NV { name: string; value: number }
interface Stats {
  generated_at: string; demo?: boolean;
  users: { total: number; new_7d: number; active_7d: number; maintainers: number };
  cost: { today: number; d7: number; d30: number; by_day: { day: string; value: number }[]; by_feature: NV[]; by_model: NV[]; top_users: NV[]; tokens_30d: { input: number; output: number; cache_read: number } };
  lessons: { created_7d: number; cached_7d: number; templates_ready: number; templates_stale: number; templates_generating: number; tests_active: number;
    top_templates: { id: string; topic_key: string; format: string; level_band: string; variant: string; uses: number; status: string }[] };
  jobs: { total_7d: number; failed_7d: number; by_kind: NV[]; recent_failures: { kind: string; error: string; created_at: string; request_id: string | null }[] };
  errors: { source: string; event: string; message: string; created_at: string; request_id: string | null }[];
  requests: { id: string; request: string; title: string | null; description: string | null; kind: string | null; created_at: string }[];
  rollout_percent: number;
}

const usd = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`);
const int = (n: number) => n.toLocaleString("en-US");
const when = (iso: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const FEATURE: Record<string, string> = {
  lesson_body: "שיעור (גוף)", lesson_test: "מבחן שיעור", personal_note: "הערה אישית", grade: "בדיקת מבחן", complete: "בדיקת מבחן",
  lesson: "שיעור", plan: "תוכנית", research: "מחקר שוק", diagnostic: "מבחן מיקום", debrief: "משוב ראיון", jd: "התאמה למשרה", custom: "נושא שביקשו",
  chat_interview: "ראיון חי", chat_tutor: "מורה בשיעור", chat_pair: "עוזר AI בראיון",
};

export default function AdminPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => { setErr(""); adminApi<Stats>().then(setS).catch((e) => setErr(e.message)); }, []);
  useEffect(load, [load]);

  async function act(body: Record<string, unknown>, done: string) {
    setNote(""); setErr("");
    try { await adminApi(body); setNote(done); load(); } catch (e) { setErr((e as Error).message); }
  }

  if (err && !s) return <div className="page"><ErrorBox msg={err} retry={load} /></div>;
  if (!s) return <Busy label="טוען את לוח התחזוקה…" />;
  const cacheShare = s.lessons.created_7d ? Math.round((s.lessons.cached_7d / s.lessons.created_7d) * 100) : 0;

  return (
    <div className="page admin">
      <header className="row between page-head">
        <div><span className="eyebrow">תחזוקה{s.demo ? " · נתוני הדגמה" : ""}</span><h1>לוח תחזוקה</h1>
          <p className="muted">עודכן {when(s.generated_at)} · {s.users.maintainers} {s.users.maintainers === 1 ? "מתחזק" : "מתחזקים"}</p></div>
        <button className="btn" onClick={load}>רענון</button>
      </header>
      {note && <div className="notice" role="status">{note}</div>}
      <ErrorBox msg={err} />

      <section className="kpis" aria-label="מדדים עיקריים">
        <Kpi label="משתמשים" value={int(s.users.total)} sub={`${int(s.users.active_7d)} פעילים · ${int(s.users.new_7d)} חדשים השבוע`} />
        <Kpi label="עלות AI היום" value={usd(s.cost.today)} sub={`7 ימים ${usd(s.cost.d7)} · 30 ימים ${usd(s.cost.d30)}`} />
        <Kpi label="שיעורים השבוע" value={int(s.lessons.created_7d)} sub={`${cacheShare}% מהמטמון המשותף`} />
        <Kpi label="עבודות AI שנכשלו" value={int(s.jobs.failed_7d)} sub={`מתוך ${int(s.jobs.total_7d)} השבוע`} tone={s.jobs.failed_7d > 0 ? "warn" : undefined} />
      </section>

      <section className="card" aria-labelledby="cost-h">
        <div className="row between card-head"><h3 id="cost-h">עלות AI ליום, 30 ימים אחרונים</h3><small className="muted">בדולרים, לפי מחירון ה-API</small></div>
        <CostChart days={s.cost.by_day} />
        <details><summary>הצגה כטבלה</summary>
          <div className="table-wrap" role="region" aria-label="עלות לפי יום" tabIndex={0}><table><thead><tr><th>יום</th><th>עלות</th></tr></thead>
            <tbody>{[...s.cost.by_day].reverse().map((d) => <tr key={d.day}><td className="ltr">{d.day}</td><td className="num">{usd(d.value)}</td></tr>)}</tbody></table></div>
        </details>
      </section>

      <div className="grid2">
        <section className="card" aria-labelledby="feat-h"><h3 id="feat-h">עלות לפי שימוש (30 ימים)</h3><Breakdown rows={s.cost.by_feature} label={(n) => FEATURE[n] ?? n} fmt={usd} /></section>
        <section className="card" aria-labelledby="model-h"><h3 id="model-h">עלות לפי מודל (30 ימים)</h3><Breakdown rows={s.cost.by_model} label={(n) => n} fmt={usd} ltr />
          <p className="muted small">טוקנים: {int(s.cost.tokens_30d.input)} קלט · {int(s.cost.tokens_30d.output)} פלט · {int(s.cost.tokens_30d.cache_read)} מהמטמון של Claude</p></section>
      </div>

      <div className="grid2">
        <section className="card" aria-labelledby="cache-h">
          <h3 id="cache-h">מטמון השיעורים המשותף</h3>
          <dl className="facts">
            <div><dt>שיעורים מוכנים</dt><dd>{int(s.lessons.templates_ready)}</dd></div>
            <div><dt>בהכנה עכשיו</dt><dd>{int(s.lessons.templates_generating)}</dd></div>
            <div><dt>מסומנים לעדכון</dt><dd>{int(s.lessons.templates_stale)}</dd></div>
            <div><dt>מבחנים בבנק</dt><dd>{int(s.lessons.tests_active)}</dd></div>
          </dl>
          <Rollout percent={s.rollout_percent} onSave={(p) => act({ action: "set_rollout", percent: p }, `המטמון פעיל עכשיו ל-${p}% מהלומדים.`)} />
        </section>
        <section className="card" aria-labelledby="top-h">
          <h3 id="top-h">משתמשים לפי עלות (30 ימים)</h3>
          {s.cost.top_users.length === 0 ? <p className="muted">אין עדיין שימוש.</p> : <Breakdown rows={s.cost.top_users} label={(n) => n} fmt={usd} />}
        </section>
      </div>

      <section className="card" aria-labelledby="req-h">
        <div className="row between card-head"><h3 id="req-h">בקשות נושא שממתינות לבדיקה</h3><span className={`pill ${s.requests.length ? "warn" : ""}`}>{s.requests.length}</span></div>
        <p className="muted small">בקשות שסווגו כנושא כללי. אישור מוסיף את הנושא לרשימה המשותפת, והשיעורים עליו יישמרו במטמון. בקשות פרטיות לא מגיעות לכאן.</p>
        {s.requests.length === 0 ? <p className="muted">אין בקשות שממתינות.</p> : s.requests.map((r) => <RequestRow key={r.id} r={r}
          onApprove={(title, description) => act({ action: "review_request", id: r.id, decision: "approve", title, description }, "הנושא נוסף לרשימה המשותפת.")}
          onReject={() => act({ action: "review_request", id: r.id, decision: "reject" }, "הבקשה נדחתה.")} />)}
      </section>

      {s.lessons.top_templates.length > 0 && <section className="card" aria-labelledby="tpl-h">
        <h3 id="tpl-h">השיעורים המשותפים הכי בשימוש</h3>
        <div className="table-wrap" role="region" aria-label="שיעורים משותפים" tabIndex={0}><table>
          <thead><tr><th>נושא</th><th>פורמט</th><th>רמה</th><th>סוג</th><th>שימושים</th><th /></tr></thead>
          <tbody>{s.lessons.top_templates.map((t) => <tr key={t.id}><td>{t.topic_key}</td><td className="ltr">{t.format}</td><td>{t.level_band}</td><td>{t.variant === "review" ? "חזרה" : "מלא"}</td><td className="num">{t.uses}</td>
            <td>{t.status === "ready" ? <button className="btn small" onClick={() => act({ action: "mark_stale", templateId: t.id }, "השיעור יתעדכן בפעם הבאה שמישהו יפתח אותו.")}>לעדכן</button> : <span className="pill warn">ממתין לעדכון</span>}</td></tr>)}</tbody>
        </table></div>
      </section>}

      <div className="grid2">
        <section className="card" aria-labelledby="fail-h">
          <h3 id="fail-h">עבודות AI שנכשלו לאחרונה</h3>
          {s.jobs.recent_failures.length === 0 ? <p className="muted">אין כשלונות.</p> : <ul className="list">{s.jobs.recent_failures.map((f, i) => (
            <li key={i}><div><b>{FEATURE[f.kind] ?? f.kind}</b> <small className="muted">· {when(f.created_at)}{f.request_id ? ` · ${f.request_id.slice(0, 8)}` : ""}</small><br /><small>{f.error}</small></div></li>))}</ul>}
        </section>
        <section className="card" aria-labelledby="err-h">
          <h3 id="err-h">שגיאות אחרונות</h3>
          {s.errors.length === 0 ? <p className="muted">אין שגיאות.</p> : <ul className="list">{s.errors.map((e, i) => (
            <li key={i}><div><span className={`pill ${e.source === "web" ? "ok" : "bad"}`}>{e.source === "web" ? "דפדפן" : "שרת"}</span> <small className="muted">{e.event} · {when(e.created_at)}{e.request_id ? ` · ${e.request_id.slice(0, 8)}` : ""}</small><br /><small className="ltr err-msg">{e.message}</small></div></li>))}</ul>}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" }) {
  return <div className="card kpi"><span className="stat-label">{label}</span><span className={`big-num ${tone ?? ""}`}>{value}</span><small className="muted">{sub}</small></div>;
}

/** One series, one hue, bars anchored to the baseline; hover or focus shows the day's value. */
function CostChart({ days }: { days: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 200, padL = 44, padB = 22, padT = 10;
  const max = Math.max(0.01, ...days.map((d) => d.value));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const bw = (W - padL) / days.length;
  const y = (v: number) => H - padB - ((H - padB - padT) * v) / nice;
  const ticks = [0, nice / 2, nice];
  const h = hover != null ? days[hover] : null;
  return (
    <div className="chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`עלות AI יומית, שיא ${usd(max)}`}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" /><text x={padL - 6} y={y(t) + 4} textAnchor="end" className="axis">{usd(t)}</text></g>)}
        {days.map((d, i) => {
          const x = padL + i * bw + 1, w = Math.max(1, bw - 2), top = y(d.value), hgt = H - padB - top;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.day}: ${usd(d.value)}`}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} className="hit" />
              {hgt > 0 && <path className={`bar ${hover === i ? "on" : ""}`} d={`M${x},${H - padB} V${top + Math.min(4, hgt)} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - padB} Z`} />}
            </g>
          );
        })}
        {[0, 14, 29].map((i) => <text key={i} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="axis">{days[i].day.slice(5)}</text>)}
      </svg>
      {h && <div className="tip" style={{ left: `${((padL + (hover! + 0.5) * bw) / W) * 100}%` }}><b>{usd(h.value)}</b><span>{h.day}</span></div>}
    </div>
  );
}

function Breakdown({ rows, label, fmt, ltr }: { rows: NV[]; label: (n: string) => string; fmt: (n: number) => string; ltr?: boolean }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">אין נתונים.</p>;
  return <ul className="breakdown">{rows.slice(0, 8).map((r) => (
    <li key={r.name}><span className={ltr ? "ltr" : ""}>{label(r.name)}</span><span className="track"><i style={{ width: `${(r.value / max) * 100}%` }} /></span><b className="num">{fmt(r.value)}</b></li>
  ))}</ul>;
}

function Rollout({ percent, onSave }: { percent: number; onSave: (p: number) => void }) {
  const [p, setP] = useState(percent);
  useEffect(() => setP(percent), [percent]);
  return (
    <div className="rollout">
      <label htmlFor="rollout">חלק הלומדים שמקבלים שיעורים מהמטמון: <b className="num">{p}%</b></label>
      <input id="rollout" type="range" min={0} max={100} step={5} value={p} onChange={(e) => setP(Number(e.target.value))} />
      <div className="row"><button className="btn primary small" disabled={p === percent} onClick={() => onSave(p)}>שמירה</button>
        <small className="muted">כל לומד נשאר באותו צד של החלוקה, כך שאפשר להשוות ציונים ודירוגים.</small></div>
    </div>
  );
}

function RequestRow({ r, onApprove, onReject }: { r: Stats["requests"][number]; onApprove: (title: string, description: string) => void; onReject: () => void }) {
  const [title, setTitle] = useState(r.title ?? "");
  const [desc, setDesc] = useState(r.description ?? "");
  return (
    <div className="request">
      <p className="muted small">הבקשה המקורית ({when(r.created_at)}): "{r.request}"</p>
      <label>שם הנושא ברשימה המשותפת<input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" /></label>
      <label>מה הלומד ידע לעשות<input value={desc} onChange={(e) => setDesc(e.target.value)} dir="auto" /></label>
      <div className="row"><button className="btn primary small" disabled={title.trim().length < 2} onClick={() => onApprove(title.trim(), desc.trim())}>אישור והוספה</button><button className="btn small" onClick={onReject}>דחייה</button></div>
    </div>
  );
}
