import { useEffect, useState } from "react";
import { formatById } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { formatInsights, observations } from "@/learning/adapt";
import { db } from "@/services/store";
import type { Feedback, Lesson } from "@/types";
import { Bar, Busy, ErrorBox } from "@/components/ui";

export default function Insights() {
  const { user } = useMe();
  const [d, setD] = useState<{ lessons: Lesson[]; feedback: Feedback[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    Promise.all([db.list<Lesson>("prep_lessons", { eq: { user_id: user.id }, order: "created_at", asc: false }), db.list<Feedback>("prep_feedback", { eq: { user_id: user.id } })])
      .then(([lessons, feedback]) => setD({ lessons, feedback })).catch((e) => setErr(e.message));
  }, [user.id]);
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Busy label="טוען…" />;

  const ins = formatInsights(observations(d.lessons, d.feedback));
  const done = d.lessons.filter((l) => l.status === "done");
  const best = ins.bestByScore ? formatById(ins.bestByScore.format) : null;

  return (
    <div className="page">
      <div className="page-head"><h1>תובנות</h1></div>

      <div className="stats">
        <div className="card stat"><div><span className="stat-label">שיעורים שהושלמו</span><div className="big-num">{done.length}</div></div></div>
        <div className="card stat"><div><span className="stat-label">ציון ממוצע</span><div className="big-num">{done.length ? Math.round(done.reduce((s, l) => s + (l.score ?? 0), 0) / done.length) : "—"}</div></div></div>
        <div className="card stat"><div><span className="stat-label">פורמט מוביל</span><div className="stat-value">{best ? best.name : "—"}</div></div></div>
      </div>

      <section className="card">
        <h3>לפי פורמט</h3>
        <div className="table-wrap" role="region" aria-label="טבלת הפורמטים" tabIndex={0}><table>
          <thead><tr><th>פורמט</th><th>שיעורים</th><th>ציון ממוצע</th><th>דירוג</th></tr></thead>
          <tbody>{ins.rows.map((r) => { const f = formatById(r.format); return (
            <tr key={r.format}><td>{f.name}</td><td>{r.n}</td>
              <td>{r.avgScore != null ? <div className="cell-bar"><b>{Math.round(r.avgScore)}</b><Bar value={r.avgScore} /></div> : <span className="muted">—</span>}</td>
              <td>{r.avgRating != null ? r.avgRating.toFixed(1) : <span className="muted">—</span>}</td></tr>
          ); })}</tbody>
        </table></div>
      </section>

      {done.length > 0 && <section className="card">
        <h3>שיעורים אחרונים</h3>
        <ul className="list">{done.slice(0, 10).map((l) => (
          <li key={l.id}><div className="row between"><span>{l.content.title}</span><span className="muted">{formatById(l.format).name} · {l.score != null ? Math.round(l.score) : "—"}</span></div></li>
        ))}</ul>
      </section>}
    </div>
  );
}
