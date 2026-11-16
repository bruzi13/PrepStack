// Demo mode only (npm run demo): canned stand-ins for the AI engine so every screen can be tried
// without a server. The content here is sample material, not generated for the learner.
import { AI_TRACK_SPINE, formatById, interviewById, TEST_FOR_KIND, type TopicKind } from "@shared/catalog";

type In = Record<string, any>;
const blank = { title: "", md: "", mermaid: "", question: "", options: [], answer: 0, explain: "", steps: [], cards: [] };
const emptyTest = {
  quiz: [], open_question: "", open_rubric: "",
  code: { title: "", statement: "", fn_name: "", starter_js: "", starter_py: "", reference_js: "", tests: [], hints: [] },
  architecture: { prompt: "", requirements: [], constraints: [], rubric: [] },
  practical: { task: "", deliverable: "", rubric: [] },
};

function diagnostic() {
  const areas = ["מבני נתונים ואלגוריתמים", "Databases", "מערכות מבוזרות", "APIs ורשתות"];
  const bank: Record<string, [string, string[], number][]> = {
    [areas[0]]: [
      ["מה סיבוכיות החיפוש הממוצעת ב-hash map?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 0],
      ["איזה מבנה מתאים למציאת k האיברים הגדולים בזרם נתונים?", ["Stack", "Min-heap בגודל k", "Linked list", "Trie"], 1],
      ["מתי BFS עדיף על Dijkstra למציאת מסלול קצר?", ["תמיד", "כשהגרף מכוון", "כשכל הקשתות באותו משקל", "כשיש משקלים שליליים"], 2],
    ],
    [areas[1]]: [
      ["מה תפקידו של index בטבלה?", ["לדחוס נתונים", "להאיץ חיפושים במחיר כתיבות איטיות יותר", "למנוע כפילויות תמיד", "לגבות את הטבלה"], 1],
      ["מה מבטיחה רמת הבידוד Read Committed?", ["אין phantom reads", "לא קוראים נתונים שלא עברו commit", "סריאליזציה מלאה", "אין deadlocks"], 1],
      ["מתי composite index על (a, b) לא יעזור?", ["בסינון לפי a בלבד", "בסינון לפי a ו-b", "בסינון לפי b בלבד", "במיון לפי a"], 2],
    ],
    [areas[2]]: [
      ["מה זה load balancer?", ["מסד נתונים מהיר", "רכיב שמפזר בקשות בין שרתים", "סוג של cache", "פרוטוקול הצפנה"], 1],
      ["מה הבעיה שפותר idempotency key?", ["עומס על ה-CPU", "ביצוע כפול של אותה פעולה ב-retry", "הצפנת מידע", "מיון הודעות"], 1],
      ["לפי CAP, בזמן network partition מערכת CP תעדיף:", ["זמינות על פני עקביות", "עקביות על פני זמינות", "את שתיהן", "ביצועים"], 1],
    ],
    [areas[3]]: [
      ["איזה HTTP method אמור להיות idempotent?", ["POST", "PUT", "PATCH תמיד", "אף אחד"], 1],
      ["מה ההבדל המרכזי בין 401 ל-403?", ["אין הבדל", "401 לא מזוהה, 403 מזוהה אך אין הרשאה", "403 שגיאת שרת", "401 שמור ל-cache"], 1],
      ["מה היתרון של cursor pagination על פני offset?", ["קל יותר לממש", "יציב ומהיר גם כשהנתונים משתנים ובעומק גדול", "מאפשר קפיצה לעמוד כלשהו", "חוסך אינדקסים"], 1],
    ],
  };
  return {
    areas,
    questions: areas.flatMap((a) => bank[a].map(([question, options, answer], i) => ({
      id: `${a}-${i}`, area: a, level: i + 1, question, options, answer, explain: `התשובה הנכונה היא "${options[answer]}".`,
    }))),
  };
}

function plan(input: In) {
  const ai = input.track === "ai";
  const T = (title: string, kind: TopicKind, priority = 2, description = "להבין לעומק ולדעת להסביר בראיון.") => ({ title, description, kind, priority, est_minutes: 30 });
  if (input.existing_titles?.length) {
    return { title: "עדכון", summary: "נמצאו נושאים חדשים ששווה להוסיף.", market_notes: [], role_key: "demo", sources: [], trends: [], interview_format_notes: [],
      modules: [{ name: "חדש בשוק", why: "טכנולוגיות שנכנסו לדרישות לאחרונה", topics: [T("MCP: חיבור אייג'נטים לכלים", "practical", 2)] }] };
  }
  const modules = ai
    ? [0, 4, 8].map((s, i) => ({ name: ["יסודות", "אייג'נטים", "פרודקשן"][i], why: "שלב במסלול", topics: AI_TRACK_SPINE.slice(s, s + 4).map((t, j) => T(t, (["concept", "practical", "practical", "design"] as TopicKind[])[j], 1)) }))
    : [
      { name: "אלגוריתמים", why: "נשאלים בכל ראיון קוד", topics: [T("Hash maps ובעיות Two Sum", "coding", 1), T("Sliding window", "coding", 2), T("BFS ו-DFS על גרפים", "coding", 2)] },
      { name: "מערכות מבוזרות", why: "הליבה של תפקיד backend", topics: [T("Caching: אסטרטגיות ו-invalidation", "concept", 1), T("תכנון Rate Limiter", "design", 1), T("Message queues ו-backpressure", "concept", 2), T("Consistent hashing", "concept", 2)] },
      { name: "Databases", why: "כל מערכת נשענת עליהם", topics: [T("אינדקסים ותכנון שאילתות", "practical", 1), T("Transactions ורמות בידוד", "concept", 2)] },
      { name: "ראיון התנהגותי", why: "חצי מההחלטה", topics: [T("לספר על קונפליקט בשיטת STAR", "behavioral", 2)] },
    ];
  return {
    title: ai ? "מסלול AI ואייג'נטים" : `תוכנית הכנה: ${input.profile?.role_title ?? "Backend Developer"}`,
    summary: "זו תוכנית לדוגמה של מצב ההדגמה. באתר האמיתי התוכנית נבנית ממחקר עדכני ברשת ומהתשובות שלכם.",
    market_notes: ["יותר חברות מוסיפות סבב קוד עם עוזר AI.", "מצפים מ-backend להבין observability ועלות.", "MCP הפך לסטנדרט לחיבור אייג'נטים לכלים."],
    modules, role_key: "demo", map_refreshed_at: new Date().toISOString(),
    sources: [{ title: "מקור לדוגמה", url: "https://example.com" }],
    trends: [{ title: "ראיונות עם AI", what_changed: "סבב קוד שבו מותר להשתמש בעוזר AI", why_it_matters: "נבחנים על שיקול דעת ואימות, לא רק על הקלדה" }],
    interview_format_notes: ["סינון טלפוני, שני סבבי קוד, System Design, התנהגותי."],
    excellence: [{ title: "שיקול דעת בפרודקשן", why: "יודעים מה יכול להישבר ומתכננים לזה מראש." }],
  };
}

function lesson(input: In) {
  const t = input.topic ?? {};
  const kind: TopicKind = t.kind ?? "concept";
  const type = TEST_FOR_KIND[kind];
  const fmt = formatById(input.format);
  const test: In = { ...emptyTest, type };
  if (type === "quiz") {
    test.quiz = [1, 2, 3].map((i) => ({ question: `שאלה ${i} על ${t.title}: מה נכון?`, options: ["התשובה הנכונה", "מסיח א", "מסיח ב", "מסיח ג"], answer: 0, explain: "כי כך זה עובד בפועל." }));
    test.open_question = `הסבירו למראיין במילים שלכם: ${t.title}`; test.open_rubric = "הגדרה, דוגמה, trade-off אחד.";
  } else if (type === "code") {
    test.code = {
      title: "Two Sum", fn_name: "twoSum",
      statement: "נתון מערך מספרים `nums` ומספר `target`. החזירו את **האינדקסים** של שני מספרים שסכומם `target`, בסדר עולה.\n\n```\ntwoSum([2,7,11,15], 9) -> [0,1]\n```\nמובטח שיש פתרון אחד בדיוק.",
      starter_js: "function twoSum(nums, target) {\n  // הקוד שלכם\n}\n", starter_py: "def twoSum(nums, target):\n    # הקוד שלכם\n    pass\n",
      reference_js: "function twoSum(nums, target){const m=new Map();for(let i=0;i<nums.length;i++){const j=m.get(target-nums[i]);if(j!==undefined)return [j,i];m.set(nums[i],i);}return [];}",
      tests: [["[[2,7,11,15],9]", "[0,1]"], ["[[3,2,4],6]", "[1,2]"], ["[[3,3],6]", "[0,1]"], ["[[-1,-2,-3,-4],-6]", "[1,3]"], ["[[0,4,3,0],0]", "[0,3]"]].map(([args_json, expected_json]) => ({ args_json, expected_json })),
      hints: ["אפשר לעבור על כל הזוגות, אבל זה O(n²).", "מה אם תזכרו כל מספר שכבר ראיתם ב-Map?"],
    };
  } else if (type === "architecture") {
    test.architecture = {
      prompt: `תכננו ${t.title?.replace("תכנון ", "") ?? "מערכת"} לשירות API ציבורי.`,
      requirements: ["100K בקשות בשנייה בשיא", "הגבלה לפי משתמש: 100 בקשות בדקה", "תוספת latency של עד 5ms", "המשך עבודה גם כשרכיב נופל"],
      constraints: ["כמה data centers"], rubric: [{ dimension: "עמידה בדרישות", look_for: "ספירה מבוזרת ומהירה" }, { dimension: "כשלים", look_for: "fail-open או fail-closed מנומק" }],
    };
  } else {
    test.practical = { task: `כתבו תשובה מעשית בנושא: **${t.title}**.`, deliverable: "טקסט או קוד קצר", rubric: ["נכונות", "בהירות", "התייחסות למקרי קצה"] };
  }
  return {
    title: t.title ?? "שיעור", intro: `שיעור לדוגמה (מצב הדגמה) בפורמט "${fmt.name}".`,
    blocks: [
      { ...blank, type: "text", title: "הרעיון המרכזי", md: `**${t.title}** הוא נושא שחוזר בראיונות.\n\n- נקודה ראשונה\n- נקודה שנייה\n\n| גישה | יתרון | חיסרון |\n|---|---|---|\n| A | פשוט | לא סקיילבילי |\n| B | מהיר | מורכב |` },
      { ...blank, type: "diagram", title: "איך זה זורם", md: "בקשה עוברת דרך ה-cache לפני ה-DB.", mermaid: 'flowchart LR\n  A["Client"] --> B["API"]\n  B --> C{"Cache hit?"}\n  C -- yes --> D["Return"]\n  C -- no --> E["DB"] --> D' },
      { ...blank, type: "example", title: "דוגמה פתורה", md: "```js\nconst seen = new Map();\nfor (const [i, n] of nums.entries()) {\n  if (seen.has(target - n)) return [seen.get(target - n), i];\n  seen.set(n, i);\n}\n```\nשימו לב: בודקים **לפני** שמכניסים." },
      { ...blank, type: "check", title: "בדיקת הבנה", question: "מה הסיבוכיות של הפתרון עם Map?", options: ["O(n)", "O(n²)", "O(log n)"], answer: 0, explain: "מעבר אחד, כל פעולת Map היא O(1) בממוצע." },
      { ...blank, type: "scenario", title: "סימולציה: עומס פתאומי", steps: [
        { situation: "02:00 בלילה. ה-latency קפץ פי 5 וה-DB ב-95% CPU. מה עושים קודם?", choices: [
          { label: "מגדילים את ה-DB", outcome: "עוזר לזמן קצר, אבל לא יודעים מה הגורם.", good: false },
          { label: "בודקים מה השתנה ומפעילים cache לקריאות הכבדות", outcome: "מצאתם שאילתה חדשה בלי אינדקס. מיתון מהיר ואז תיקון.", good: true },
          { label: "מחכים שיעבור", outcome: "התקלה מחמירה והמשתמשים נוטשים.", good: false }] }] },
      { ...blank, type: "flashcards", title: "כרטיסיות", cards: [{ q: "מה זה cache stampede?", a: "הרבה בקשות שמחשבות את אותו ערך בו־זמנית כשה-cache פג." }, { q: "TTL?", a: "זמן חיים של ערך ב-cache." }] },
    ],
    takeaways: ["לזכור את ה-trade-off המרכזי", "להתחיל מהפתרון הפשוט", "לדבר בקול רם"],
    interview_tips: ["שאלו שאלות הבהרה לפני שמתחילים."], test,
  };
}

const review = (score: number) => ({
  score, verdict: "תשובה סבירה עם מקום לשיפור (ביקורת לדוגמה של מצב ההדגמה).",
  strengths: ["מבנה ברור", "התייחסות לדרישה המרכזית"],
  issues: [{ severity: "major", point: "אין התייחסות לכשל של רכיב מרכזי", fix: "הוסיפו replica ותארו מה קורה כשה-primary נופל." }, { severity: "minor", point: "חסר הסבר לבחירת ה-data store", fix: "נמקו לפי דפוס הגישה לנתונים." }],
  dimensions: [{ name: "נכונות", score: Math.min(100, score + 5), comment: "ברובו נכון" }, { name: "עומק", score: Math.max(0, score - 10), comment: "אפשר להעמיק ב-trade-offs" }],
  model_answer: "תשובה חזקה מתחילה בדרישות, מציגה תכנון פשוט, ואז מעמיקה בצוואר הבקבוק.", next_steps: ["לתרגל הסבר בקול רם", "לחזור על נושא ה-caching"],
});

export function mockJob(kind: string, input: In): unknown {
  switch (kind) {
    case "diagnostic": return diagnostic();
    case "plan": return plan(input);
    case "lesson": return lesson(input);
    case "grade": {
      const s = input.submission ?? {};
      const base = input.kind === "code" ? Math.round((s.passed ?? 0) / Math.max(1, s.total ?? 1) * 75) + 15
        : input.kind === "architecture" ? Math.min(90, 25 + (s.nodes?.length ?? 0) * 8 + (s.edges?.length ?? 0) * 4)
        : Math.min(88, 30 + Math.round(String(s.answer ?? s.open ?? "").length / 6));
      return review(base);
    }
    case "debrief": return {
      score: 68, hire_signal: "lean_yes", summary: "ראיון סביר (משוב לדוגמה של מצב ההדגמה).",
      dimensions: interviewById(input.type).rubric.map((name, i) => ({ name, score: 60 + ((i * 7) % 30), comment: "הערה לדוגמה." })),
      strengths: ["שאלת שאלות הבהרה", "חשיבה בקול רם"], improvements: ["לבדוק מקרי קצה לפני שמכריזים שסיימת", "לנמק החלטות עם מספרים"],
      moments: [{ quote: "אני חושב שזה יעבוד", feedback: "המראיין רצה לראות בדיקה, לא תחושה.", better: "להריץ דוגמה ביד ולהראות שהפלט נכון." }],
      drills: [{ title: "ניתוח סיבוכיות", description: "לנתח זמן ומקום של פתרון", kind: "concept" }],
    };
    case "custom": return { note: "נוספו נושאים לדוגמה (מצב הדגמה).", module: "נושאים שהוספתי", topics: [{ title: String(input.request).slice(0, 40), description: "נושא לדוגמה מהבקשה שלך.", kind: "concept", priority: 2, est_minutes: 30 }] };
    case "jd": return {
      role_title: "Senior Backend Engineer", company_type: "Scale-up", fit_summary: "התאמה טובה ביסודות, פער בניסיון עם streaming (ניתוח לדוגמה).", match_percent: 72,
      must_have: ["Node.js או Go", "PostgreSQL", "מערכות מבוזרות"], nice_to_have: ["Kafka", "Kubernetes"],
      gaps: [{ skill: "Kafka", why: "מופיע בדרישות ולא בפרופיל", priority: 1 }],
      suggested_topics: [{ title: "Kafka: partitions ו-consumer groups", description: "להבין איך Kafka מפזר עומס", kind: "concept", module: "מהמשרה" }],
      likely_rounds: ["שיחת HR", "ראיון קוד", "System Design", "מנהל/ת מגייס/ת"], questions_to_expect: ["איך הייתם מתכננים מערכת התראות?", "ספרו על תקלה בפרודקשן."],
    };
    default: throw new Error(`unknown job ${kind}`);
  }
}

export async function mockChat(body: In, onText: (s: string) => void): Promise<string> {
  const turns = (body.messages as { role: string }[]).filter((m) => m.role === "user").length;
  const t = interviewById(body.type);
  const text = body.mode === "pair" ? "הנה הצעה (עוזר AI לדוגמה):\n```js\nfunction solve(input) {\n  return input;\n}\n```\nכדאי לבדוק מקרי קצה לפני שמשתמשים בזה."
    : body.mode === "tutor" ? "שאלה טובה. בקצרה: חשבו על זה כמו על תור בסופר. (תשובה לדוגמה של מצב ההדגמה.)"
    : turns === 1 ? `שלום, אני אראיין אותך היום ב${t.title}. נתחיל: ${t.id === "behavioral" ? "ספר/י לי על מקרה שבו לא הסכמת עם החלטה טכנית בצוות." : "איך היית ניגש/ת לבעיה הבאה: מציאת האיבר השכיח ביותר במערך?"}`
    : ["מעניין. למה בחרת בגישה הזו ולא באחרת?", "ומה יקרה אם הקלט יהיה גדול פי אלף?", "איך היית בודק/ת שזה עובד?", "תודה, נעצור כאן."][Math.min(turns - 2, 3)];
  let shown = "";
  for (const w of text.split(/(?<=\s)/)) { shown += w; onText(shown); await new Promise((r) => setTimeout(r, 25)); }
  return text;
}
