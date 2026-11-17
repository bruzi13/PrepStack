import { Link } from "react-router-dom";
import { formatById } from "@shared/catalog";
import { useLearner, useServices } from "@/app/AppContext";
import { useAsyncData } from "@/app/useAsyncData";
import { Calendar } from "@/domain/Calendar";
import type { ProgressReport } from "@/domain/ProgressReport";
import type { Topic } from "@/domain/Topic";
import { ErrorMessage, ProgressBar, ScoreRing } from "@/components/ui";

const MAX_LISTED_REVIEWS = 6;
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export default function Dashboard() {
  const { profile } = useLearner();
  const { progress } = useServices();
  const { data: report, error } = useAsyncData(() => progress.loadReport(profile), [progress, profile]);

  if (error) return <ErrorMessage message={error} />;
  if (!report) return <DashboardSkeleton />;

  const daysUntilInterview = profile.daysUntilInterview();
  return (
    <div className="page">
      <header className="row between page-head">
        <div><span className="eyebrow">{Calendar.longHebrewDate()}</span><h1>שלום {profile.displayName}</h1><p className="muted">{profile.roleTitle}</p></div>
        {daysUntilInterview != null && daysUntilInterview >= 0 && (
          <div className="countdown"><b>{daysUntilInterview}</b>{plural(daysUntilInterview, "יום לראיון", "ימים לראיון")}</div>
        )}
      </header>
      <NextStepCard report={report} />
      <WeekStats report={report} />
      <div className="grid2">
        <DailyPracticeCard report={report} />
        <DueReviewsCard report={report} />
        <ModuleLevelsCard report={report} />
        <LearningStyleCard report={report} />
        <StudiedThisWeekCard topics={report.topicsStudiedThisWeek} />
      </div>
      {report.marketNotes.length > 0 && (
        <section className="card">
          <h3>מה השוק מצפה עכשיו</h3>
          <ul>{report.marketNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
          <Link to="/plan" className="link">לתוכנית ולעדכוני שוק</Link>
        </section>
      )}
    </div>
  );
}

function NextStepCard({ report }: { report: ProgressReport }) {
  const due = report.dueForReview, next = report.nextToStudy, first = report.firstStep;
  const headline = due.length && next
    ? `${due.length} ${plural(due.length, "חזרה", "חזרות")}, ואז ${next.title}`
    : due.length ? `${due.length} ${plural(due.length, "חזרה ממתינה", "חזרות ממתינות")}` : next?.title;
  return (
    <section className="next-card" aria-labelledby="next-step-heading">
      <div className="next-main">
        {first ? <>
          <span className="next-label">הצעד הבא{next && !due.length ? ` · כ-${next.estimatedMinutes} דקות` : ""}</span>
          <h2 id="next-step-heading">{headline}</h2>
          {next && <p className="next-meta">{next.kindLabel} · מבחן: {next.testLabel}</p>}
          <div className="row">
            <Link className="btn primary big" to={`/lesson/${first.id}`}>{due.length ? "להתחיל בחזרות" : "להתחיל שיעור"}</Link>
            {due.length > 0 && next && <Link className="btn big" to={`/lesson/${next.id}`}>ישר לשיעור</Link>}
          </div>
        </> : <>
          <span className="next-label">הצעד הבא</span>
          <h2 id="next-step-heading">כל הנושאים בתוכנית נלמדו ואין חזרות שממתינות</h2>
          <div className="row"><Link className="btn primary big" to="/interviews">לסימולציית ראיון</Link><Link className="btn big" to="/plan">הוספת נושאים</Link></div>
        </>}
      </div>
      <div className="next-side"><ScoreRing score={report.readiness} size={112} /><b>מוכנות לראיון</b></div>
    </section>
  );
}

function WeekStats({ report }: { report: ProgressReport }) {
  const latestInterview = report.latestScoredInterview;
  const averageScore = report.averageScoreThisWeek;
  return (
    <section className="stats" aria-label="השבוע">
      <div className="card stat"><div>
        <span className="stat-label">שיעורים השבוע</span><div className="big-num">{report.lessonsThisWeek.length}</div>
        <small className="muted">{averageScore != null ? `ציון ממוצע ${averageScore}` : "עוד לא התחלתם השבוע"}</small>
      </div></div>
      <div className="card stat"><div>
        <span className="stat-label">דקות למידה</span>
        <div className="big-num">{report.minutesThisWeek}<small> / {report.weeklyGoalMinutes}</small></div>
        <ProgressBar value={(report.minutesThisWeek / report.weeklyGoalMinutes) * 100} tone="ok" label="יעד שבועי" />
      </div></div>
      <div className="card stat"><div>
        <span className="stat-label">ימים ברצף</span><div className="big-num">{report.streakDays}</div>
        <small className="muted">{report.interviewsThisWeek} סימולציות השבוע</small>
      </div></div>
      <div className="card stat"><div>
        <span className="stat-label">סימולציה אחרונה</span>
        {latestInterview
          ? <><div className="big-num">{Math.round(latestInterview.score!)}</div><Link to={`/interview/${latestInterview.id}`} className="muted small-link">{latestInterview.title}</Link></>
          : <><div className="big-num">–</div><Link to="/interviews" className="muted small-link">להתחיל סימולציה</Link></>}
      </div></div>
    </section>
  );
}

function TopicLink({ topic, showKind }: { topic: Topic; showKind?: boolean }) {
  const level = topic.masteryLevel;
  return (
    <Link to={`/lesson/${topic.id}`}>
      <span>{topic.title}{showKind && <small className="muted"> · {topic.kindLabel}</small>}</span>
      <span className={`pill ${level.tone}`}>{level.label} · {Math.round(topic.mastery)}</span>
    </Link>
  );
}

function DailyPracticeCard({ report }: { report: ProgressReport }) {
  const due = report.mistakesDue;
  return (
    <section className="card" aria-labelledby="practice-heading">
      <div className="row between card-head"><h3 id="practice-heading">תרגול יומי</h3>{due > 0 && <span className="pill warn">{due} מהמחברת</span>}</div>
      <p className="muted">{report.openMistakes} טעויות פתוחות במחברת</p>
      <div className="row">
        <Link className="btn primary" to="/practice">התחלה</Link>
        <Link className="link" to="/practice?tab=notebook">למחברת</Link>
      </div>
    </section>
  );
}

function DueReviewsCard({ report }: { report: ProgressReport }) {
  const due = report.dueForReview;
  return (
    <section className="card" aria-labelledby="due-heading">
      <div className="row between card-head"><h3 id="due-heading">חזרות להיום</h3>{due.length > 0 && <span className="pill warn">↻ {due.length} ממתינות</span>}</div>
      {due.length === 0
        ? <p className="muted">אין חזרות להיום.</p>
        : <ul className="list">{due.slice(0, MAX_LISTED_REVIEWS).map((topic) => <li key={topic.id}><TopicLink topic={topic} /></li>)}</ul>}
    </section>
  );
}

function ModuleLevelsCard({ report }: { report: ProgressReport }) {
  const modules = report.topics.moduleProgress();
  return (
    <section className="card" aria-labelledby="levels-heading">
      <div className="row between card-head"><h3 id="levels-heading">רמה לפי תחום</h3><Link to="/plan" className="link">לתוכנית המלאה</Link></div>
      {modules.length === 0 ? <p className="muted">אין עדיין תוכנית.</p> : modules.map((module) => (
        <div key={module.track + module.name} className="mod-row">
          <div className="row between">
            <span>{module.name}{module.track === "ai" && <span className="pill hot">AI</span>}</span>
            <small className="muted">{module.studiedCount}/{module.totalCount} · שליטה {module.averageMastery}</small>
          </div>
          <ProgressBar value={module.averageMastery} label={module.name} />
        </div>
      ))}
    </section>
  );
}

function LearningStyleCard({ report }: { report: ProgressReport }) {
  const insights = report.formatInsights();
  return (
    <section className="card" aria-labelledby="style-heading">
      <h3 id="style-heading">איך אתם לומדים הכי טוב</h3>
      {insights.bestByScore ? <>
        <p>התוצאות הטובות ביותר שלכם הגיעו אחרי שיעורים בפורמט <b>{formatById(insights.bestByScore.format).name}</b> (ציון ממוצע {Math.round(insights.bestByScore.averageScore!)}).</p>
        {insights.feelingDiffersFromResults && <p className="muted">מעניין: הפורמט שדירגתם הכי גבוה הוא דווקא {formatById(insights.bestByRating!.format).name}.</p>}
      </> : <p className="muted">אחרי כמה שיעורים בפורמטים שונים נדע איזה סוג שיעור מביא אתכם לציונים הכי גבוהים, והשיעורים יותאמו לזה.</p>}
      <Link to="/insights" className="link">לפירוט המלא</Link>
    </section>
  );
}

function StudiedThisWeekCard({ topics }: { topics: Topic[] }) {
  if (!topics.length) return null;
  return (
    <section className="card" aria-labelledby="week-topics-heading">
      <h3 id="week-topics-heading">מה למדתם השבוע</h3>
      <ul className="list">{topics.map((topic, index) => <li key={index}><TopicLink topic={topic} showKind /></li>)}</ul>
    </section>
  );
}

/** Shown while the dashboard's data loads: the same shapes, so nothing jumps when it arrives. */
function DashboardSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="טוען את היום">
      <div className="sk" style={{ height: 64, width: "40%" }} />
      <div className="sk" style={{ height: 200, borderRadius: 20 }} />
      <div className="stats">{[0, 1, 2, 3].map((index) => <div key={index} className="sk" style={{ height: 110 }} />)}</div>
      <div className="grid2"><div className="sk" style={{ height: 220 }} /><div className="sk" style={{ height: 220 }} /></div>
    </div>
  );
}
