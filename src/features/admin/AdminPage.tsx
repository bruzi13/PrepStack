// The maintainer board: who uses PrepStack, what it costs, how many lessons are made and served from the
// shared cache, what is failing, and the two decisions maintainers make (cache rollout, learner topic requests).
import { useEffect, useState } from "react";
import type { DailyCost, MaintainerAction, MaintainerBoardStats, NamedAmount, PendingTopicRequest } from "@shared/maintainerBoard";
import { supportCode } from "@/ai/AiEngine";
import { useServices } from "@/app/AppContext";
import { useAsyncData } from "@/app/useAsyncData";
import { ErrorMessage, Loading } from "@/components/ui";

const formatUsd = (amount: number) => (amount < 10 ? `$${amount.toFixed(2)}` : `$${Math.round(amount).toLocaleString("en-US")}`);
const formatCount = (count: number) => count.toLocaleString("en-US");
const formatWhen = (isoTimestamp: string) =>
  new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(isoTimestamp));

/** What each AI usage feature is, in the maintainers' words. */
const FEATURE_LABEL: Record<string, string> = {
  lesson_body: "שיעור (גוף)", lesson_test: "מבחן שיעור", personal_note: "הערה אישית", grade: "בדיקת מבחן", complete: "בדיקת מבחן",
  lesson: "שיעור", plan: "תוכנית", research: "מחקר שוק", diagnostic: "מבחן מיקום", debrief: "משוב ראיון", jd: "התאמה למשרה", custom: "נושא שביקשו",
  chat_interview: "ראיון חי", chat_tutor: "מורה בשיעור", chat_pair: "עוזר AI בראיון",
};

export default function AdminPage() {
  const { maintainerBoard } = useServices();
  const { data: stats, error: loadError, reload } = useAsyncData(() => maintainerBoard.loadStats(), [maintainerBoard]);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  async function perform(action: MaintainerAction, successNotice: string) {
    setNotice(""); setActionError("");
    try { await maintainerBoard.perform(action); setNotice(successNotice); await reload(); } catch (failure) { setActionError((failure as Error).message); }
  }

  const error = actionError || loadError;
  if (error && !stats) return <div className="page"><ErrorMessage message={error} onRetry={reload} /></div>;
  if (!stats) return <Loading label="טוען את לוח התחזוקה…" />;

  return (
    <div className="page admin">
      <header className="row between page-head">
        <div><span className="eyebrow">תחזוקה{stats.isDemo ? " · נתוני הדגמה" : ""}</span><h1>לוח תחזוקה</h1>
          <p className="muted">עודכן {formatWhen(stats.generatedAt)} · {stats.users.maintainers} {stats.users.maintainers === 1 ? "מתחזק" : "מתחזקים"}</p></div>
        <button className="btn" onClick={reload}>רענון</button>
      </header>
      {notice && <div className="notice" role="status">{notice}</div>}
      <ErrorMessage message={error} />
      <KpiRow stats={stats} />
      <CostSection stats={stats} />
      <div className="grid2">
        <section className="card" aria-labelledby="cache-heading">
          <h3 id="cache-heading">מטמון השיעורים המשותף</h3>
          <dl className="facts">
            <div><dt>שיעורים מוכנים</dt><dd>{formatCount(stats.lessons.templatesReady)}</dd></div>
            <div><dt>בהכנה עכשיו</dt><dd>{formatCount(stats.lessons.templatesGenerating)}</dd></div>
            <div><dt>מסומנים לעדכון</dt><dd>{formatCount(stats.lessons.templatesStale)}</dd></div>
            <div><dt>מבחנים בבנק</dt><dd>{formatCount(stats.lessons.activeBankTests)}</dd></div>
          </dl>
          <RolloutControl percent={stats.cacheRolloutPercent} onSave={(percent) => perform({ action: "set_rollout", percent }, `המטמון פעיל עכשיו ל-${percent}% מהלומדים.`)} />
        </section>
        <section className="card" aria-labelledby="top-users-heading">
          <h3 id="top-users-heading">משתמשים לפי עלות (30 ימים)</h3>
          {stats.cost.topUsers.length === 0 ? <p className="muted">אין עדיין שימוש.</p> : <BreakdownBars rows={stats.cost.topUsers} labelOf={(name) => name} format={formatUsd} />}
        </section>
      </div>
      <TopicRequestsSection requests={stats.pendingTopicRequests} perform={perform} />
      <TopTemplatesSection stats={stats} perform={perform} />
      <ProblemsSection stats={stats} />
    </div>
  );
}

function KpiRow({ stats }: { stats: MaintainerBoardStats }) {
  const { users, cost, lessons, jobs } = stats;
  const cacheSharePercent = lessons.createdThisWeek ? Math.round((lessons.servedFromCacheThisWeek / lessons.createdThisWeek) * 100) : 0;
  return (
    <section className="kpis" aria-label="מדדים עיקריים">
      <KpiTile label="משתמשים" value={formatCount(users.total)} detail={`${formatCount(users.activeThisWeek)} פעילים · ${formatCount(users.newThisWeek)} חדשים השבוע`} />
      <KpiTile label="עלות AI היום" value={formatUsd(cost.today)} detail={`7 ימים ${formatUsd(cost.last7Days)} · 30 ימים ${formatUsd(cost.last30Days)}`} />
      <KpiTile label="שיעורים השבוע" value={formatCount(lessons.createdThisWeek)} detail={`${cacheSharePercent}% מהמטמון המשותף`} />
      <KpiTile label="עבודות AI שנכשלו" value={formatCount(jobs.failedThisWeek)} detail={`מתוך ${formatCount(jobs.totalThisWeek)} השבוע`} warn={jobs.failedThisWeek > 0} />
    </section>
  );
}

function KpiTile({ label, value, detail, warn }: { label: string; value: string; detail: string; warn?: boolean }) {
  return <div className="card kpi"><span className="stat-label">{label}</span><span className={`big-num ${warn ? "warn" : ""}`}>{value}</span><small className="muted">{detail}</small></div>;
}

function CostSection({ stats }: { stats: MaintainerBoardStats }) {
  const { cost } = stats;
  return <>
    <section className="card" aria-labelledby="cost-heading">
      <div className="row between card-head"><h3 id="cost-heading">עלות AI ליום, 30 ימים אחרונים</h3><small className="muted">בדולרים, לפי מחירון ה-API</small></div>
      <DailyCostChart days={cost.byDay} />
      <details><summary>הצגה כטבלה</summary>
        <div className="table-wrap" role="region" aria-label="עלות לפי יום" tabIndex={0}><table><thead><tr><th>יום</th><th>עלות</th></tr></thead>
          <tbody>{[...cost.byDay].reverse().map((day) => <tr key={day.day}><td className="ltr">{day.day}</td><td className="num">{formatUsd(day.usd)}</td></tr>)}</tbody></table></div>
      </details>
    </section>
    <div className="grid2">
      <section className="card" aria-labelledby="feature-heading"><h3 id="feature-heading">עלות לפי שימוש (30 ימים)</h3>
        <BreakdownBars rows={cost.byFeature} labelOf={(name) => FEATURE_LABEL[name] ?? name} format={formatUsd} /></section>
      <section className="card" aria-labelledby="model-heading"><h3 id="model-heading">עלות לפי מודל (30 ימים)</h3>
        <BreakdownBars rows={cost.byModel} labelOf={(name) => name} format={formatUsd} leftToRight />
        <p className="muted small">טוקנים: {formatCount(cost.tokens30Days.input)} קלט · {formatCount(cost.tokens30Days.output)} פלט · {formatCount(cost.tokens30Days.cacheRead)} מהמטמון של Claude</p></section>
    </div>
  </>;
}

const CHART_WIDTH = 720, CHART_HEIGHT = 200, AXIS_WIDTH = 44, AXIS_HEIGHT = 22, TOP_PADDING = 10, BAR_CORNER = 4;
const LABELLED_DAY_INDEXES = [0, 14, 29];

/** A round axis maximum just above the largest value (0.37 -> 0.4, 2.3 -> 3). */
function roundAxisMaximum(maximum: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  return Math.ceil(maximum / magnitude) * magnitude;
}

/** One series, one hue, bars anchored to the baseline; hover or focus shows the day's value. */
function DailyCostChart({ days }: { days: DailyCost[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const largest = Math.max(0.01, ...days.map((day) => day.usd));
  const axisMaximum = roundAxisMaximum(largest);
  const slotWidth = (CHART_WIDTH - AXIS_WIDTH) / days.length;
  const baseline = CHART_HEIGHT - AXIS_HEIGHT;
  const yFor = (usd: number) => baseline - ((baseline - TOP_PADDING) * usd) / axisMaximum;
  const hovered = hoveredIndex != null ? days[hoveredIndex] : null;

  return (
    <div className="chart" dir="ltr">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`עלות AI יומית, שיא ${formatUsd(largest)}`}>
        {[0, axisMaximum / 2, axisMaximum].map((tick) => (
          <g key={tick}>
            <line x1={AXIS_WIDTH} x2={CHART_WIDTH} y1={yFor(tick)} y2={yFor(tick)} className="grid" />
            <text x={AXIS_WIDTH - 6} y={yFor(tick) + 4} textAnchor="end" className="axis">{formatUsd(tick)}</text>
          </g>
        ))}
        {days.map((day, index) => {
          const slotX = AXIS_WIDTH + index * slotWidth;
          const barX = slotX + 1, barWidth = Math.max(1, slotWidth - 2), barTop = yFor(day.usd), barHeight = baseline - barTop;
          return (
            <g key={day.day} tabIndex={0} aria-label={`${day.day}: ${formatUsd(day.usd)}`}
              onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)}>
              <rect x={slotX} y={TOP_PADDING} width={slotWidth} height={baseline - TOP_PADDING} className="hit" />
              {barHeight > 0 && <path className={`bar ${hoveredIndex === index ? "on" : ""}`}
                d={`M${barX},${baseline} V${barTop + Math.min(BAR_CORNER, barHeight)} q0,-${BAR_CORNER} ${BAR_CORNER},-${BAR_CORNER} h${barWidth - 2 * BAR_CORNER} q${BAR_CORNER},0 ${BAR_CORNER},${BAR_CORNER} V${baseline} Z`} />}
            </g>
          );
        })}
        {LABELLED_DAY_INDEXES.filter((index) => days[index]).map((index) => (
          <text key={index} x={AXIS_WIDTH + index * slotWidth + slotWidth / 2} y={CHART_HEIGHT - 6} textAnchor="middle" className="axis">{days[index].day.slice(5)}</text>
        ))}
      </svg>
      {hovered && hoveredIndex != null && (
        <div className="tip" style={{ left: `${((AXIS_WIDTH + (hoveredIndex + 0.5) * slotWidth) / CHART_WIDTH) * 100}%` }}><b>{formatUsd(hovered.usd)}</b><span>{hovered.day}</span></div>
      )}
    </div>
  );
}

const MAX_BREAKDOWN_ROWS = 8;

function BreakdownBars({ rows, labelOf, format, leftToRight }: { rows: NamedAmount[]; labelOf: (name: string) => string; format: (value: number) => string; leftToRight?: boolean }) {
  if (!rows.length) return <p className="muted">אין נתונים.</p>;
  const largest = Math.max(1e-9, ...rows.map((row) => row.value));
  return (
    <ul className="breakdown">{rows.slice(0, MAX_BREAKDOWN_ROWS).map((row) => (
      <li key={row.name}>
        <span className={leftToRight ? "ltr" : ""}>{labelOf(row.name)}</span>
        <span className="track"><i style={{ width: `${(row.value / largest) * 100}%` }} /></span>
        <b className="num">{format(row.value)}</b>
      </li>
    ))}</ul>
  );
}

const ROLLOUT_STEP_PERCENT = 5;

function RolloutControl({ percent, onSave }: { percent: number; onSave: (percent: number) => void }) {
  const [draftPercent, setDraftPercent] = useState(percent);
  useEffect(() => setDraftPercent(percent), [percent]);
  return (
    <div className="rollout">
      <label htmlFor="rollout">חלק הלומדים שמקבלים שיעורים מהמטמון: <b className="num">{draftPercent}%</b></label>
      <input id="rollout" type="range" min={0} max={100} step={ROLLOUT_STEP_PERCENT} value={draftPercent} onChange={(event) => setDraftPercent(Number(event.target.value))} />
      <div className="row">
        <button className="btn primary small" disabled={draftPercent === percent} onClick={() => onSave(draftPercent)}>שמירה</button>
        <small className="muted">כל לומד נשאר באותו צד של החלוקה, כך שאפשר להשוות ציונים ודירוגים.</small>
      </div>
    </div>
  );
}

type Perform = (action: MaintainerAction, successNotice: string) => Promise<void>;

function TopicRequestsSection({ requests, perform }: { requests: PendingTopicRequest[]; perform: Perform }) {
  return (
    <section className="card" aria-labelledby="requests-heading">
      <div className="row between card-head"><h3 id="requests-heading">בקשות נושא שממתינות לבדיקה</h3><span className={`pill ${requests.length ? "warn" : ""}`}>{requests.length}</span></div>
      <p className="muted small">בקשות שסווגו כנושא כללי. אישור מוסיף את הנושא לרשימה המשותפת, והשיעורים עליו יישמרו במטמון. בקשות פרטיות לא מגיעות לכאן.</p>
      {requests.length === 0 ? <p className="muted">אין בקשות שממתינות.</p> : requests.map((request) => (
        <TopicRequestReview key={request.id} request={request}
          onApprove={(title, description) => perform({ action: "review_request", requestId: request.id, decision: "approve", title, description }, "הנושא נוסף לרשימה המשותפת.")}
          onReject={() => perform({ action: "review_request", requestId: request.id, decision: "reject" }, "הבקשה נדחתה.")} />
      ))}
    </section>
  );
}

function TopicRequestReview({ request, onApprove, onReject }: { request: PendingTopicRequest; onApprove: (title: string, description: string) => void; onReject: () => void }) {
  const [title, setTitle] = useState(request.title ?? "");
  const [description, setDescription] = useState(request.description ?? "");
  return (
    <div className="request">
      <p className="muted small">הבקשה המקורית ({formatWhen(request.createdAt)}): "{request.request}"</p>
      <label>שם הנושא ברשימה המשותפת<input value={title} onChange={(event) => setTitle(event.target.value)} dir="auto" /></label>
      <label>מה הלומד ידע לעשות<input value={description} onChange={(event) => setDescription(event.target.value)} dir="auto" /></label>
      <div className="row">
        <button className="btn primary small" disabled={title.trim().length < 2} onClick={() => onApprove(title.trim(), description.trim())}>אישור והוספה</button>
        <button className="btn small" onClick={onReject}>דחייה</button>
      </div>
    </div>
  );
}

function TopTemplatesSection({ stats, perform }: { stats: MaintainerBoardStats; perform: Perform }) {
  const templates = stats.lessons.topTemplates;
  if (!templates.length) return null;
  return (
    <section className="card" aria-labelledby="templates-heading">
      <h3 id="templates-heading">השיעורים המשותפים הכי בשימוש</h3>
      <div className="table-wrap" role="region" aria-label="שיעורים משותפים" tabIndex={0}><table>
        <thead><tr><th>נושא</th><th>פורמט</th><th>רמה</th><th>סוג</th><th>שימושים</th><th /></tr></thead>
        <tbody>{templates.map((template) => (
          <tr key={template.id}>
            <td>{template.topicKey}</td><td className="ltr">{template.format}</td><td>{template.levelBand}</td>
            <td>{template.variant === "review" ? "חזרה" : "מלא"}</td><td className="num">{template.uses}</td>
            <td>{template.status === "ready"
              ? <button className="btn small" onClick={() => perform({ action: "mark_stale", templateId: template.id }, "השיעור יתעדכן בפעם הבאה שמישהו יפתח אותו.")}>לעדכן</button>
              : <span className="pill warn">ממתין לעדכון</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function ProblemsSection({ stats }: { stats: MaintainerBoardStats }) {
  const failures = stats.jobs.recentFailures, errors = stats.errors;
  return (
    <div className="grid2">
      <section className="card" aria-labelledby="failures-heading">
        <h3 id="failures-heading">עבודות AI שנכשלו לאחרונה</h3>
        {failures.length === 0 ? <p className="muted">אין כשלונות.</p> : <ul className="list">{failures.map((failure, index) => (
          <li key={index}><div>
            <b>{FEATURE_LABEL[failure.kind] ?? failure.kind}</b> <small className="muted">· {formatWhen(failure.createdAt)}{failure.requestId ? ` · ${supportCode(failure.requestId)}` : ""}</small>
            <br /><small>{failure.error}</small>
          </div></li>
        ))}</ul>}
      </section>
      <section className="card" aria-labelledby="errors-heading">
        <h3 id="errors-heading">שגיאות אחרונות</h3>
        {errors.length === 0 ? <p className="muted">אין שגיאות.</p> : <ul className="list">{errors.map((event, index) => (
          <li key={index}><div>
            <span className={`pill ${event.source === "web" ? "ok" : "bad"}`}>{event.source === "web" ? "דפדפן" : "שרת"}</span>{" "}
            <small className="muted">{event.event} · {formatWhen(event.createdAt)}{event.requestId ? ` · ${supportCode(event.requestId)}` : ""}</small>
            <br /><small className="ltr err-msg">{event.message}</small>
          </div></li>
        ))}</ul>}
      </section>
    </div>
  );
}
