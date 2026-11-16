// Public landing page. Built to the tasteskill deal for a software page:
// palette soot-pale-lime (near-black ground, lime action: a tool people open at night before an interview),
// type Manrope + IBM Plex Sans Hebrew + JetBrains Mono, hero "centred" (one product window in a lit frame),
// rhythm "space", pill buttons, arc mark, close-word with the liquid-type moment, dark footer.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FORMATS, INTERVIEW_TYPES } from "@shared/catalog";
import { useLiquidType } from "@/components/useLiquidType";
import "@/styles/landing.css";

const Mark = () => <span className="lp-mark" aria-hidden />;

/** The interview window loops: the question stays, then the answer, the test run and the follow-up arrive 0.9 s apart. */
function useSteps(count: number) {
  const [n, setN] = useState(count);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0, t: ReturnType<typeof setTimeout>;
    const run = () => { i = i >= count ? 0 : i + 1; setN(i); t = setTimeout(run, i >= count ? 2400 : 900); };
    setN(0); t = setTimeout(run, 700);
    return () => clearTimeout(t);
  }, [count]);
  return n;
}

function InterviewWindow() {
  const n = useSteps(4);
  const dims: [string, number][] = [["פתרון בעיות", 86], ["תקשורת", 78], ["איכות קוד", 71], ["ניתוח סיבוכיות", 64]];
  return (
    <div className="lp-window" role="img" aria-label="סימולציית ראיון קוד: המראיין שואל, המועמד עונה, הבדיקות רצות וכרטיס הציונים מתעדכן">
      <div className="lp-win" aria-hidden>
        <div className="lp-win__bar"><span className="lp-win__dots"><i /><i /><i /></span><b>סימולציה · Coding</b><span className="sp" /><span className="lp-clock">32:14</span></div>
        <div className="lp-win__body">
          <div className="lp-convo">
            <div className="lp-msg lp-msg--them"><small>מראיינת</small>כתבו פונקציה שמחזירה את k המספרים השכיחים ביותר במערך. מה הסיבוכיות?</div>
            <div className={`lp-msg lp-msg--me ${n >= 1 ? "in" : ""}`}><small>אתם</small>סופרים עם <bdi className="ltr-run">hash map</bdi>, ושומרים <bdi className="ltr-run">heap</bdi> בגודל k. סך הכול <bdi className="ltr-run">O(n log k)</bdi>.</div>
            <div className={`lp-tool ${n >= 2 ? "in" : ""}`}><span className="ok-dot" />12 מתוך 12 בדיקות עברו · 41ms</div>
            <div className={`lp-msg lp-msg--them ${n >= 3 ? "in" : ""}`}><small>מראיינת</small>יפה. ומה משתנה אם המערך לא נכנס בזיכרון?</div>
            <div className={`lp-acts ${n >= 4 ? "in" : ""}`}><span className="on">לענות</span><span>לבקש רמז</span></div>
          </div>
          <div className="lp-score">
            <div className="lp-score__top"><b>כרטיס ציונים</b><span className="lp-signal">Lean Hire</span></div>
            {dims.map(([d, v]) => <div key={d} className="lp-dim"><div><span>{d}</span><b>{v}</b></div><i><s style={{ width: `${v}%` }} /></i></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

const CARDS = [
  { t: "תוכנית לימוד לפי התפקיד", d: "שאלון ומבחן מיקום, ומהם רשימת נושאים מסודרת לפי מה שמשרות בתפקיד שלכם דורשות עכשיו.",
    ui: <div className="frag frag-plan">{[["Hash tables", 82], ["Caching", 55], ["Message queues", 20]].map(([t, v]) => <div key={t as string}><bdi className="ltr-run">{t}</bdi><i><s style={{ width: `${v}%` }} /></i></div>)}</div> },
  { t: "מבחן מעשי בסוף כל שיעור", d: "קוד שרץ מול בדיקות, לוח ארכיטקטורה שמקבל ציון, או משימה עם ביקורת מפורטת.",
    ui: <div className="frag frag-tests">{["empty input", "k equals n", "ties keep order"].map((t) => <div key={t}><span className="ok-dot" /><code>{t}</code><b>pass</b></div>)}<div className="bad"><span className="bad-dot" /><code>10^6 items</code><b>timeout</b></div></div> },
  { t: `${FORMATS.length} פורמטים של שיעור`, d: "המערכת מודדת אחרי איזה פורמט הציון שלכם הכי גבוה, ונותנת לו עדיפות בשיעור הבא.",
    ui: <div className="frag frag-formats">{FORMATS.map((f, i) => <span key={f.id} className={i === 0 ? "on" : ""}>{f.name}</span>)}</div> },
  { t: `${INTERVIEW_TYPES.length} סוגי סימולציות ראיון`, d: "מראיין AI ששואל, חופר ומקשה, כולל סבב עם עוזר AI, ובסוף כרטיס ציונים כמו של ועדת גיוס.",
    ui: <div className="frag frag-chat"><div>איך הייתם מגבילים קצב בקשות ל-API?</div><div className="me"><bdi>Token bucket</bdi> לכל משתמש, שמור ב-<bdi>Redis</bdi></div></div> },
  { t: "מסלול AI ואייג'נטים", d: "מהשימוש הבסיסי ועד בנייה עם אייג'נטים ועבודה עם coding agents.",
    ui: <div className="frag frag-formats ltr-chips">{["tool use", "RAG", "MCP", "evals", "agents"].map((x, i) => <span key={x} className={i === 2 ? "on" : ""}>{x}</span>)}</div> },
  { t: "חזרה במרווחים", d: "נושא שלמדתם חוזר לתרגול קצר בדיוק כשמתחילים לשכוח אותו, ולוח הבקרה מראה מה מחכה היום.",
    ui: <div className="frag frag-due">{[["היום", 3], ["מחר", 1], ["בעוד 3 ימים", 4]].map(([d, k]) => <div key={d as string}><span>{d}</span><b>{k} נושאים</b></div>)}</div> },
];

const STEPS: [string, string, JSX.Element][] = [
  ["תפקיד ותאריך ראיון", "מספרים לאיזה תפקיד אתם מכוונים, באיזה סטאק אתם עובדים ומתי הראיון.",
    <div className="frag frag-form"><label>תפקיד<span>Backend Engineer</span></label><label>סטאק<span>Node.js · PostgreSQL</span></label><label>ראיון<span>בעוד 21 יום</span></label></div>],
  ["שיעור ומבחן בכל נושא", "שיעור קצר בפורמט שמתאים לכם, ומבחן שמקבל ציון וביקורת עם תיקונים.",
    <div className="frag frag-grade"><b>82</b><div><span>Caching ו-CDN</span><small>חסר: מדיניות invalidation</small></div></div>],
  ["סימולציה וכרטיס ציונים", "ראיון מלא מול מראיין AI. נושאים חלשים מהכרטיס נכנסים לתוכנית.",
    <div className="frag frag-due"><div><span>כרטיס ציונים</span><b className="ltr-run">Lean Hire</b></div><div><span>נוסף לתוכנית</span><b>Message queues</b></div></div>],
];

export default function Landing() {
  const close = useLiquidType<HTMLDivElement>();
  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">דלגו לתוכן</a>
      <header className="nav lp-nav">
        <div className="wrap lp-wrap lp-nav__in">
          <Link to="/" className="lp-brand"><Mark />PrepStack</Link>
          <nav aria-label="חלקי הדף"><a href="#features">מה יש בפנים</a><a href="#how">איך זה עובד</a></nav>
          <div className="lp-nav__act"><Link className="lp-btn lp-btn--ghost" to="/auth">התחברות</Link><Link className="lp-btn lp-btn--primary" to="/auth?new=1">קבלו תוכנית אישית</Link></div>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-hero" data-enter aria-labelledby="hero-h">
          <div className="wrap lp-wrap"><div className="hero-text lp-hero__in">
            <a className="lp-news" href="#features"><span>חדש</span>סבב ראיון עם עוזר AI</a>
            <h1 id="hero-h">הכנה לראיונות טכניים למפתחים</h1>
            <p className="lp-lead">תוכנית לימוד לפי התפקיד שאתם רוצים, מבחן מעשי בסוף כל שיעור, וסימולציות ב-{INTERVIEW_TYPES.length} סוגי ראיונות שנגמרות בכרטיס ציונים.</p>
            <div className="lp-btns"><Link className="lp-btn lp-btn--primary lp-btn--lg" to="/auth?new=1">קבלו תוכנית אישית</Link><a className="lp-btn lp-btn--ghost lp-btn--lg" href="#how">ראו איך זה עובד</a></div>
            <div className="lp-frame"><InterviewWindow /></div>
          </div></div>
        </section>

        <section id="features" className="lp-sec" aria-labelledby="f-h">
          <div className="wrap lp-wrap">
            <div className="lp-head"><h2 id="f-h">שישה כלים בתוכנית אחת</h2><p>כל מה שצריך בין שליחת קורות חיים ליום הראיון, באותו מקום ובעברית.</p></div>
            <div className="lp-cards">{CARDS.map((c) => <article key={c.t} className="lp-card"><div className="lp-card__ui" aria-hidden>{c.ui}</div><h3>{c.t}</h3><p>{c.d}</p></article>)}</div>
          </div>
        </section>

        <section id="how" className="lp-sec lp-sec--surface" aria-labelledby="h-h">
          <div className="wrap lp-wrap">
            <div className="lp-head"><h2 id="h-h">שלושה שלבים עד יום הראיון</h2><p>בלי לנחש מה ללמוד ובאיזה סדר. התוכנית מתעדכנת אחרי כל מבחן וכל סימולציה.</p></div>
            <ol className="lp-steps">{STEPS.map(([t, d, ui], i) => <li key={t}><div className="lp-card__ui" aria-hidden>{ui}</div><span className="lp-step__n">0{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
          </div>
        </section>
      </main>

      {/* close-word + dark footer in one screen (footer.closing) */}
      <footer className="lp-close closing" aria-labelledby="c-h">
        <div className="wrap lp-wrap lp-close__wrap" ref={close} data-moment="liquid-type">
          <div className="lp-close__in">
            <p className="lp-word" aria-hidden>PrepStack</p>
            <h2 id="c-h">תוכנית לימוד לתפקיד שלכם</h2>
            <p className="lp-close__lead">שאלון קצר ומבחן מיקום, ואחריהם רשימת נושאים מסודרת עם שיעור ומבחן לכל אחד. ההרשמה חינם.</p>
            <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/auth?new=1">קבלו תוכנית אישית</Link>
          </div>
          <div className="lp-foot__in">
            <div><span className="lp-brand"><Mark />PrepStack</span><p>הכנה לראיונות טכניים למפתחים, בעברית.</p></div>
            <nav aria-label="קישורים"><a href="#features">מה יש בפנים</a><a href="#how">איך זה עובד</a><Link to="/auth">התחברות</Link></nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
