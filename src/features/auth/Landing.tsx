import { Link } from "react-router-dom";
import { FORMATS, INTERVIEW_TYPES } from "@shared/catalog";

const FEATURES = [
  ["🗺️", "תוכנית אישית שמתעדכנת", "שאלון קצר ומבחן מיקום, ומהם תוכנית לימודים לתפקיד שאתם מכוונים אליו, בנויה ממה שהשוק דורש עכשיו."],
  ["🧪", "מבחן אמיתי בסוף כל שיעור", "קוד שרץ מול בדיקות, לוח ארכיטקטורה שמקבל ציון וביקורת מפורטת, או משימה מעשית."],
  ["🧬", "שיעורים בדרך שעובדת לכם", "המערכת לומדת מהציונים ומהמשוב שלכם איזה סוג שיעור מביא אתכם לתוצאות, ומתאימה את עצמה."],
  ["🎙️", "סימולציות ראיון", `${INTERVIEW_TYPES.length} סוגי ראיונות עם מראיין AI, כולל הסבב החדש עם עוזר AI, ובסוף כרטיס ציונים כמו של ועדת גיוס.`],
  ["🤖", "מסלול AI ואייג'נטים", "מהשימוש הבסיסי ועד בנייה עם אייג'נטים: tool use, RAG, MCP, evals ועבודה עם coding agents."],
  ["📊", "לוח התקדמות", "מה למדתם השבוע, באיזו רמה אתם בכל נושא ומה צריך לתרגל היום כדי לא לשכוח."],
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="land-top">
        <div className="brand">Prep<span>Stack</span></div>
        <Link className="btn" to="/auth">התחברות</Link>
      </header>
      <section className="hero">
        <h1>להגיע לראיון הטכני הבא מוכנים באמת</h1>
        <p>הכנה לראיונות עבודה בהייטק ולמידת טכנולוגיות חדשות, בתוכנית שנבנית סביבכם: התפקיד שאתם רוצים, מה שאתם כבר יודעים והדרך שבה אתם לומדים הכי טוב.</p>
        <Link className="btn primary big" to="/auth?new=1">מתחילים בחינם</Link>
      </section>
      <section className="grid3">
        {FEATURES.map(([icon, title, text]) => <div key={title} className="card"><div className="f-icon" aria-hidden>{icon}</div><h3>{title}</h3><p className="muted">{text}</p></div>)}
      </section>
      <section className="land-formats">
        <h2>אותו נושא, שש דרכים ללמוד אותו</h2>
        <div className="chips">{FORMATS.map((f) => <span key={f.id} className="chip static">{f.icon} {f.name}</span>)}</div>
      </section>
    </div>
  );
}
