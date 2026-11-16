// Shared by the site and the server functions: roles, lesson formats, topic kinds, interview types.

export type TopicKind = "concept" | "coding" | "design" | "practical" | "behavioral";
export type TestType = "quiz" | "code" | "architecture" | "practical";

export const KIND_LABEL: Record<TopicKind, string> = {
  concept: "מושגים",
  coding: "קוד ואלגוריתמים",
  design: "ארכיטקטורה",
  practical: "מעשי",
  behavioral: "התנהגותי",
};

export const TEST_FOR_KIND: Record<TopicKind, TestType> = {
  concept: "quiz",
  coding: "code",
  design: "architecture",
  practical: "practical",
  behavioral: "practical",
};

export const TEST_LABEL: Record<TestType, string> = {
  quiz: "מבחן ידע",
  code: "מבחן קוד (בסגנון LeetCode)",
  architecture: "מבחן ארכיטקטורה אינטראקטיבי",
  practical: "מבחן מעשי",
};

/** The ways we can teach the same topic. The adaptation algorithm picks between these per learner. */
export const FORMATS = [
  { id: "worked_examples", name: "דוגמאות פתורות", icon: "🧩", blurb: "לומדים דרך דוגמאות מהעולם האמיתי שנפתרות צעד אחר צעד.",
    guide: "Teach mainly through 3-4 fully worked, realistic examples that build on each other (fading: the last one leaves a step for the learner). Each example: the situation, the reasoning step by step, the result, the common mistake." },
  { id: "visual_story", name: "אנלוגיות ותרשימים", icon: "🗺️", blurb: "סיפור, אנלוגיה מהחיים ותרשימים שמראים איך הדברים זורמים.",
    guide: "Teach through one strong everyday analogy that runs through the lesson, plus 2-3 Mermaid diagrams (flowchart or sequenceDiagram) that show the flow. Short text between the diagrams. Say where the analogy breaks." },
  { id: "scenario_sim", name: "סימולציה", icon: "🎮", blurb: "אתם בתוך תרחיש אמיתי (תקלה, עומס, החלטת תכנון) ובוחרים מה לעשות.",
    guide: "Teach through an interactive branching scenario: the learner is the engineer on the spot (an incident, a traffic spike, a design decision). Use 2 'scenario' blocks with 3-4 steps each; every choice has a realistic consequence that teaches the concept. Short explanation blocks before and after." },
  { id: "drill_repetition", name: "תרגול וחזרה", icon: "🔁", blurb: "הסבר קצר ואז הרבה שאלות קצרות, כרטיסיות וחזרה על העקרונות.",
    guide: "Teach with short explanations (max 120 words each) each immediately followed by a 'check' question, 5-7 checks in total, one 'flashcards' block with 8-10 cards, and a best-practices checklist. Repeat the key ideas in different wording (retrieval practice)." },
  { id: "deep_reference", name: "העמקה ופרקטיקות", icon: "📚", blurb: "הסבר מעמיק ומסודר: איך זה עובד מבפנים, trade-offs ו-best practices.",
    guide: "Teach as a rigorous, well-organised deep dive: how it works internally, trade-offs table, production best practices, pitfalls, and what senior interviewers probe. Dense but structured with headers and tables." },
  { id: "socratic", name: "שאלות מנחות", icon: "💬", blurb: "השיעור שואל אתכם שאלות ואתם מגיעים לתשובה בעצמכם, עם רמזים.",
    guide: "Teach Socratically: pose a guiding question, let the learner think (a 'check' block), then reveal and explain; repeat 5-6 times building from first principles to the full concept. Explanations come AFTER each question, in the 'explain' field and a following text block." },
] as const;
export type FormatId = (typeof FORMATS)[number]["id"];
export const formatById = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

export const ROLES = [
  { key: "backend", title: "Backend Developer", hint: "מערכות מבוזרות, סקייל, דאטהבייסים, APIs" },
  { key: "frontend", title: "Frontend Developer", hint: "React, ביצועים, נגישות, state" },
  { key: "fullstack", title: "Full Stack Developer", hint: "צד לקוח וצד שרת מקצה לקצה" },
  { key: "devops", title: "DevOps / SRE / Platform", hint: "Kubernetes, CI/CD, observability, ענן" },
  { key: "data-engineer", title: "Data Engineer", hint: "pipelines, warehouses, streaming" },
  { key: "ml-engineer", title: "ML / AI Engineer", hint: "מודלים, LLMs, RAG, evals, MLOps" },
  { key: "mobile", title: "Mobile Developer", hint: "iOS / Android / React Native" },
  { key: "qa-automation", title: "QA / Automation", hint: "אוטומציה, אסטרטגיית בדיקות" },
  { key: "security", title: "Security Engineer", hint: "AppSec, ענן, threat modeling" },
  { key: "data-scientist", title: "Data Scientist / Analyst", hint: "סטטיסטיקה, SQL, ניסויים" },
  { key: "engineering-manager", title: "Engineering Manager / Tech Lead", hint: "הובלה טכנית, אנשים, תכנון" },
] as const;

export const LEVELS = [
  { key: "student", title: "סטודנט/ית או לפני משרה ראשונה" },
  { key: "junior", title: "Junior (0–2 שנים)" },
  { key: "mid", title: "Mid (2–5 שנים)" },
  { key: "senior", title: "Senior (5+ שנים)" },
  { key: "staff", title: "Staff / Principal / מנהל/ת" },
] as const;

/** The level of the role the learner is aiming for (separate from their experience today). */
export const TARGET_LEVELS = [["junior", "Junior"], ["mid", "Mid"], ["senior", "Senior"], ["staff", "Staff / Lead"]] as const;

export const IMPROVE_GOALS = [
  { key: "dsa", title: "אלגוריתמים ושאלות קוד" },
  { key: "system_design", title: "System Design וארכיטקטורה" },
  { key: "depth", title: "העמקה בטכנולוגיות שאני כבר עובד/ת איתן" },
  { key: "new_stack", title: "ללמוד סטאק או טכנולוגיה חדשה" },
  { key: "ai", title: "עבודה עם AI ובניית אייג'נטים" },
  { key: "behavioral", title: "ראיונות התנהגותיים וסיפור הקריירה" },
  { key: "communication", title: "להסביר את עצמי בקול רם ובביטחון" },
  { key: "english", title: "להתראיין באנגלית" },
  { key: "confidence", title: "לחץ וביטחון בזמן ראיון" },
  { key: "negotiation", title: "משא ומתן על שכר" },
] as const;

export interface InterviewType {
  id: string;
  title: string;
  icon: string;
  minutes: number;
  workspace: "code" | "canvas" | "none";
  blurb: string;
  /** What the interviewer does, in order. */
  flow: string;
  /** Rubric dimensions the debrief scores. */
  rubric: string[];
}

export const INTERVIEW_TYPES: InterviewType[] = [
  { id: "coding", title: "ראיון קוד (DSA)", icon: "⌨️", minutes: 45, workspace: "code",
    blurb: "שאלת אלגוריתמים קלאסית: מבהירים, מתכננים, כותבים, בודקים ומנתחים סיבוכיות.",
    flow: "Give ONE algorithmic problem suited to the level (state it briefly, with one example). Let the candidate ask clarifying questions, expect them to describe an approach before coding, then code in the shared editor, then test with edge cases, then discuss time/space complexity. Give a follow-up variation if time remains. Give hints only when stuck, smallest hint first.",
    rubric: ["הבנת הבעיה ושאלות הבהרה", "גישה לפתרון ואלגוריתם", "איכות ונכונות הקוד", "בדיקות ומקרי קצה", "ניתוח סיבוכיות", "תקשורת וחשיבה בקול רם"] },
  { id: "system_design", title: "System Design", icon: "🏗️", minutes: 50, workspace: "canvas",
    blurb: "מתכננים מערכת בסקייל: דרישות, הערכות, תכנון על, העמקה ו-trade-offs. עם לוח ארכיטקטורה.",
    flow: "Give ONE open design prompt (e.g. a feed, a rate limiter, a chat system, a job scheduler) suited to the level. Expect: functional + non-functional requirements, rough capacity estimates, API and data model, high-level design on the shared canvas, then drive 2-3 deep dives into the riskiest parts (bottlenecks, consistency, failure modes). Push on trade-offs: ask 'why not X?'. Add a changing requirement (10x traffic, multi-region) late.",
    rubric: ["בירור דרישות והיקף", "הערכות קיבולת", "תכנון על ומודל נתונים", "העמקה בנקודות הקריטיות", "Trade-offs והצדקת החלטות", "סקייל, אמינות וכשלים", "תקשורת והובלת הדיון"] },
  { id: "behavioral", title: "ראיון התנהגותי", icon: "🤝", minutes: 35, workspace: "none",
    blurb: "סיפורי STAR: קונפליקט, כישלון, הובלה, אי־ודאות. המראיין חופר לפרטים.",
    flow: "Ask 4-5 behavioral questions one at a time (conflict, failure, ownership, ambiguity, influence without authority, a project you are proud of). After each answer ask 1-2 probing follow-ups to get specifics: what exactly did YOU do, what was the measurable result, what would you do differently. Do not accept vague answers.",
    rubric: ["מבנה התשובה (Situation, Task, Action, Result)", "ספציפיות וראיות", "בעלות ותרומה אישית", "תוצאה מדידה", "רפלקציה ולמידה", "התאמה לרמה המבוקשת"] },
  { id: "ai_assisted", title: "ראיון קוד עם AI", icon: "🤖", minutes: 50, workspace: "code",
    blurb: "הפורמט החדש: מותר להשתמש בעוזר AI. נבחן איך מפרקים בעיה, מנחים את ה-AI ומאמתים את התוצאה.",
    flow: "This is an AI-assisted coding round. Give a small multi-part practical task (e.g. extend a small service: parse, validate, add a feature, then handle an edge case) rather than a pure puzzle. The candidate may use the built-in AI assistant (their requests to it and its replies appear in the transcript marked [AI-TOOL]). Evaluate how they decompose, what they delegate, how they review and test AI output, and whether they can explain every line. Ask them to explain a piece of AI-written code and to find a weakness in it.",
    rubric: ["פירוק הבעיה", "איכות ההנחיות ל-AI", "אימות וביקורת על קוד שנוצר", "הבנה והיכולת להסביר את הקוד", "בדיקות", "שיקול דעת: מה להאציל ומה לא"] },
  { id: "code_review", title: "קריאת קוד ו-Code Review", icon: "🔍", minutes: 35, workspace: "code",
    blurb: "מקבלים קוד קיים: מבינים מה הוא עושה, מוצאים באגים ובעיות תכנון ומציעים שיפורים.",
    flow: "Paste a realistic 40-70 line code snippet (in the candidate's language) with 4-6 planted issues of different kinds: a correctness bug, a concurrency or edge-case issue, a security problem, a performance problem, a readability/design smell. Ask the candidate to first explain what the code does, then review it as if it were a pull request, prioritising issues. Then ask how they would fix the most serious one.",
    rubric: ["הבנת הקוד", "מציאת באגים", "אבטחה וביצועים", "תעדוף הממצאים", "איכות ההצעות לתיקון", "טון וניסוח של ביקורת"] },
  { id: "debugging", title: "דיבאגינג ותקלת פרודקשן", icon: "🚨", minutes: 35, workspace: "none",
    blurb: "תקלה חיה: המראיין מגלם את המערכת. שואלים, בודקים מדדים ולוגים, ומאתרים שורש בעיה.",
    flow: "Run a live incident simulation: describe symptoms (e.g. p99 latency tripled after a deploy, errors on 5% of requests). You play the system: when the candidate asks to check a metric, log, dashboard or config, answer with realistic concrete data. Have a hidden root cause decided in advance and keep it consistent. Reward hypothesis-driven investigation and mitigation before root cause. End with: how to prevent a recurrence.",
    rubric: ["גישה שיטתית והיפותזות", "שימוש במדדים ולוגים", "מיתון לפני חקירה", "איתור שורש הבעיה", "מניעה ולקחים", "תקשורת בזמן תקלה"] },
  { id: "project_deep_dive", title: "העמקה בפרויקט מהעבר", icon: "🧭", minutes: 35, workspace: "none",
    blurb: "מספרים על פרויקט שעשיתם, והמראיין צולל להחלטות הטכניות, לחלופות ולתוצאות.",
    flow: "Ask the candidate to describe a significant project they built. Then dig: architecture, their personal contribution, the hardest technical decision and the alternatives considered, what broke in production, how success was measured, what they would redesign today. Probe for depth until you reach the edge of their knowledge.",
    rubric: ["בהירות ההסבר", "עומק טכני", "תרומה אישית", "החלטות וחלופות", "השפעה ומדדים", "רפלקציה"] },
  { id: "recruiter_screen", title: "שיחת HR ומשא ומתן על שכר", icon: "📞", minutes: 25, workspace: "none",
    blurb: "שיחת סינון ראשונה: ספרו על עצמכם, למה אתם עוזבים, ציפיות שכר ושאלות לחברה.",
    flow: "Run a recruiter phone screen: 'tell me about yourself', why this role and why leaving, what they are looking for, availability, salary expectations (push once for a number and react realistically to the answer), then invite their questions. Be friendly but time-conscious.",
    rubric: ["פיץ' אישי קצר וברור", "מוטיבציה והתאמה לתפקיד", "התמודדות עם שאלת השכר", "שאלות טובות לחברה", "רושם כללי ומקצועיות"] },
];
export const interviewById = (id: string) => INTERVIEW_TYPES.find((t) => t.id === id) ?? INTERVIEW_TYPES[0];

/** The fixed spine of the AI & agents track. The server refreshes the details from the web. */
export const AI_TRACK_SPINE = [
  "איך LLM עובד בפועל: tokens, context window, sampling, מגבלות",
  "Prompting ו-context engineering: להנחות מודל כמו שמנחים עמית חכם",
  "Structured outputs ו-tool use (function calling)",
  "RAG: אחזור מידע, embeddings, chunking, הערכת איכות",
  "לולאת האייג'נט: מה זה agent, מתי צריך אחד ומתי workflow מספיק",
  "MCP (Model Context Protocol): לחבר אייג'נטים לכלים ולמידע",
  "Evals: איך יודעים שהאייג'נט באמת עובד",
  "עבודה עם coding agents (Claude Code, Cursor וכו'): לפרק משימה, להנחות, לאמת",
  "Multi-agent ו-orchestration: מתי לפצל ואיך לתאם",
  "אייג'נטים בפרודקשן: עלות, latency, אבטחה, prompt injection, guardrails",
  "System design למוצרי AI: ארכיטקטורה של מערכת מבוססת LLM",
  "פרויקט מסכם: לבנות אייג'נט שימושי מקצה לקצה",
];
