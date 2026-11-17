import { formatById } from "@shared/catalog";
import { useLearner, useServices } from "@/app/AppContext";
import { useAsyncData } from "@/app/useAsyncData";
import { LessonHistory } from "@/domain/Lesson";
import { ErrorMessage, Loading, ProgressBar } from "@/components/ui";

const RECENT_LESSON_COUNT = 10;

export default function Insights() {
  const { user } = useLearner();
  const { progress } = useServices();
  const { data, error } = useAsyncData(() => progress.loadInsights(user.id), [progress, user.id]);
  if (error) return <ErrorMessage message={error} />;
  if (!data) return <Loading label="טוען…" />;

  const completed = new LessonHistory(data.lessons).completed();
  const averageScore = LessonHistory.averageScore(completed);
  const leadingFormat = data.insights.bestByScore ? formatById(data.insights.bestByScore.format) : null;

  return (
    <div className="page">
      <div className="page-head"><h1>תובנות</h1></div>

      <div className="stats">
        <div className="card stat"><div><span className="stat-label">שיעורים שהושלמו</span><div className="big-num">{completed.length}</div></div></div>
        <div className="card stat"><div><span className="stat-label">ציון ממוצע</span><div className="big-num">{averageScore ?? "—"}</div></div></div>
        <div className="card stat"><div><span className="stat-label">פורמט מוביל</span><div className="stat-value">{leadingFormat?.name ?? "—"}</div></div></div>
      </div>

      <section className="card">
        <h3>לפי פורמט</h3>
        <div className="table-wrap" role="region" aria-label="טבלת הפורמטים" tabIndex={0}><table>
          <thead><tr><th>פורמט</th><th>שיעורים</th><th>ציון ממוצע</th><th>דירוג</th></tr></thead>
          <tbody>{data.insights.rows.map((row) => (
            <tr key={row.format}>
              <td>{formatById(row.format).name}</td>
              <td>{row.lessonCount}</td>
              <td>{row.averageScore != null
                ? <div className="cell-bar"><b>{Math.round(row.averageScore)}</b><ProgressBar value={row.averageScore} /></div>
                : <span className="muted">—</span>}</td>
              <td>{row.averageRating != null ? row.averageRating.toFixed(1) : <span className="muted">—</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      {completed.length > 0 && <section className="card">
        <h3>שיעורים אחרונים</h3>
        <ul className="list">{completed.slice(0, RECENT_LESSON_COUNT).map((lesson) => (
          <li key={lesson.id}><div className="row between">
            <span>{lesson.title}</span>
            <span className="muted">{lesson.formatName} · {lesson.score != null ? Math.round(lesson.score) : "—"}</span>
          </div></li>
        ))}</ul>
      </section>}
    </div>
  );
}
