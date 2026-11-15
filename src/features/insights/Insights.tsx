import { useEffect, useState } from "react";
import { FORMATS, formatById, KIND_LABEL } from "@shared/catalog";
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

  const obs = observations(d.lessons, d.feedback);
  const ins = formatInsights(obs);
  const wanted = d.feedback.flatMap((f) => (f.wanted ?? "").split(", ").filter(Boolean));
  const wantedCount = [...new Set(wanted)].map((w) => [w, wanted.filter((x) => x === w).length] as const).sort((a, b) => b[1] - a[1]);
  const hard = d.feedback.filter((f) => f.difficulty === 5).length, easy = d.feedback.filter((f) => f.difficulty === 1).length;

  return (
    <div className="page">
      <div className="page-head"><h1>מה עובד לי</h1><p className="muted">איך המערכת מחליטה באיזו דרך ללמד אתכם, ומה היא למדה עליכם עד עכשיו.</p></div>

      <section className="card">
        <h3>השורה התחתונה</h3>
        {ins.bestByScore ? <>
          <p>הציונים הגבוהים ביותר שלכם מגיעים אחרי שיעורים בפורמט <b>{formatById(ins.bestByScore.format).icon} {formatById(ins.bestByScore.format).name}</b> (ממוצע {Math.round(ins.bestByScore.avgScore!)}).</p>
          {ins.mismatch ? <p>לעומת זאת, הפורמט שאתם הכי <b>נהנים</b> ממנו הוא {formatById(ins.bestByRating!.format).icon} {formatById(ins.bestByRating!.format).name} (דירוג {ins.bestByRating!.avgRating!.toFixed(1)}). זה קורה הרבה: שיעור שמרגיש קל ונעים לא תמיד מלמד הכי טוב. המערכת נותנת לציון במבחן משקל גדול פי שלושה מהדירוג.</p>
            : ins.bestByRating && <p>זה גם הפורמט שדירגתם הכי גבוה, כך שהתחושה והתוצאות מסכימות.</p>}
        </> : <p className="muted">עוד אין מספיק נתונים. אחרי שתשלימו לפחות שני שיעורים בכמה פורמטים, יופיעו כאן מסקנות.</p>}
      </section>

      <section className="card">
        <h3>הפורמטים שלכם</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>פורמט</th><th>שיעורים</th><th>ציון ממוצע במבחן</th><th>הדירוג שלכם</th></tr></thead>
          <tbody>{ins.rows.map((r) => { const f = formatById(r.format); return (
            <tr key={r.format}><td><b>{f.icon} {f.name}</b><br /><small className="muted">{f.blurb}</small></td><td>{r.n}</td>
              <td>{r.avgScore != null ? <><b>{Math.round(r.avgScore)}</b><Bar value={r.avgScore} /></> : <span className="muted">טרם נוסה</span>}</td>
              <td>{r.avgRating != null ? `${"★".repeat(Math.round(r.avgRating))} ${r.avgRating.toFixed(1)}` : <span className="muted">אין דירוג</span>}</td></tr>
          ); })}</tbody>
        </table></div>
      </section>

      <section className="card">
        <h3>איך ההתאמה עובדת</h3>
        <ol>
          <li>יש {FORMATS.length} דרכים ללמד כל נושא. בהתחלה אנחנו לא יודעים מה מתאים לכם, אז מנסים כמה.</li>
          <li>אחרי כל שיעור יש מבחן. הציון (75%) והדירוג שנתתם (25%) הם ה"תגמול" של הפורמט ששימש באותו שיעור.</li>
          <li>לפני כל שיעור חדש המערכת מעריכה לכל פורמט כמה הוא צפוי להצליח אצלכם בסוג הנושא הזה ({Object.values(KIND_LABEL).join(", ")}), ובוחרת בהסתברות גבוהה את המוביל. פורמט שנוסה מעט עדיין מקבל הזדמנויות, כדי לא לפספס משהו שעובד.</li>
          <li>נושאים קשים לא "מענישים" פורמט: הציון נמדד ביחס לממוצע שלכם באותו סוג נושא.</li>
          <li>למשתמשים חדשים נקודת הפתיחה היא הממוצע האנונימי של כלל הלומדים, והיא מתחלפת בנתונים שלכם ככל שמצטברים.</li>
        </ol>
        <p className="muted">תמיד אפשר לבחור פורמט ידנית בתוך שיעור. גם זה נרשם.</p>
      </section>

      {(wantedCount.length > 0 || hard + easy > 0) && <section className="card">
        <h3>מה ביקשתם במשובים</h3>
        {wantedCount.length > 0 && <div className="chips">{wantedCount.map(([w, n]) => <span key={w} className="chip static">{w} × {n}</span>)}</div>}
        {hard + easy > 0 && <p className="muted">סימנתם {hard} שיעורים כקשים מדי ו-{easy} כקלים מדי.</p>}
      </section>}

      {d.lessons.length > 0 && <section className="card">
        <h3>ההחלטות האחרונות</h3>
        <ul className="list">{d.lessons.slice(0, 8).map((l) => { const c = l.choice as { reason?: string; manual?: boolean } | null; return (
          <li key={l.id}><div><b>{formatById(l.format).icon} {l.content.title}</b> <small className="muted">{l.created_at.slice(0, 10)}{l.score != null ? ` · ציון ${Math.round(l.score)}` : ""}</small><br /><small className="muted">{c?.reason}</small></div></li>
        ); })}</ul>
      </section>}
    </div>
  );
}
