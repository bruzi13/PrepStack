// Lesson quality check. Run before shipping a change to the lesson or test prompts (and before bumping
// PROMPT_VERSION): it generates lessons for a fixed set of sample topics and checks each one.
//
//   npm run eval:lessons -- --dry-run          what would run, no API calls
//   npm run eval:lessons                       generate and check (needs ANTHROPIC_API_KEY; costs real money)
//   npm run eval:lessons -- --file x.json      check a saved lesson (free; CI runs this on a fixture)
//
// Exit code 1 when any check fails.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { LessonBody } from "../netlify/functions/_core/schemas";
import { usageListeners } from "../netlify/functions/_core/usage";

type J = Record<string, any>;
interface Sample { title: string; description: string; kind: string; format: string; band: string }

/** Fixed sample topics: one per test type, different formats and bands. Change only together with a note in the PR. */
export const SAMPLES: Sample[] = [
  { title: "Hash tables ו-heaps", description: "לבחור מבנה נתונים לבעיית top-k ולנתח סיבוכיות", kind: "coding", format: "worked_examples", band: "mid" },
  { title: "Caching ו-CDN", description: "להסביר מתי ואיך משתמשים ב-cache ומה קורה כשהוא לא עקבי", kind: "concept", format: "visual_story", band: "junior" },
  { title: "תכנון מערכת קיצור קישורים", description: "לתכנן שירות קיצור קישורים בקנה מידה גדול", kind: "design", format: "scenario_sim", band: "senior" },
  { title: "כתיבת Dockerfile יעיל", description: "לכתוב Dockerfile קטן ומהיר לבנייה לשירות Node.js", kind: "practical", format: "deep_reference", band: "mid" },
];
const TEST_FOR: J = { concept: "quiz", coding: "code", design: "architecture", practical: "practical", behavioral: "practical" };

interface Result { name: string; ok: boolean; detail?: string }
const hebrew = /[֐-׿]/;

/** Run a code test's reference solution against its own tests, sandboxed, with a time limit. */
function runReference(code: J): Result {
  if (!code.fn_name || !code.reference_js) return { name: "code: reference solution present", ok: false };
  const tests = (code.tests ?? []) as { args_json: string; expected_json: string }[];
  if (tests.length < 3) return { name: "code: at least 3 tests", ok: false, detail: `${tests.length}` };
  try {
    const sandbox = vm.createContext({});
    const fn = vm.runInContext(`${code.reference_js}\n;${code.fn_name}`, sandbox, { timeout: 2000 });
    const bad = tests.filter((t) => {
      const got = JSON.stringify(vm.runInContext("f(...a)", vm.createContext({ f: fn, a: JSON.parse(t.args_json) }), { timeout: 2000 }) ?? null);
      return got !== JSON.stringify(JSON.parse(t.expected_json));
    });
    return { name: "code: reference passes every test", ok: bad.length === 0, detail: bad.length ? `${bad.length}/${tests.length} fail, e.g. ${bad[0].args_json}` : undefined };
  } catch (e) {
    return { name: "code: reference runs", ok: false, detail: (e as Error).message };
  }
}

/** All checks for one lesson (body plus its test). */
export function checkLesson(lesson: J, expect: { format?: string; kind?: string } = {}): Result[] {
  const r: Result[] = [];
  const body = LessonBody.safeParse(lesson);
  r.push({ name: "body matches the schema", ok: body.success, detail: body.success ? undefined : body.error.issues[0]?.path.join(".") + ": " + body.error.issues[0]?.message });
  const blocks = (lesson.blocks ?? []) as J[];
  r.push({ name: "at least 3 blocks", ok: blocks.length >= 3, detail: `${blocks.length}` });
  r.push({ name: "intro is in Hebrew", ok: hebrew.test(String(lesson.intro ?? "")) });
  r.push({ name: "takeaways present", ok: (lesson.takeaways ?? []).length >= 2 });
  if (expect.format === "visual_story") {
    const diagrams = blocks.filter((b) => b.type === "diagram");
    r.push({ name: "visual_story: has a diagram", ok: diagrams.length >= 1 });
    r.push({ name: "diagrams use flowchart/sequenceDiagram", ok: diagrams.every((d) => /^\s*(flowchart|graph|sequenceDiagram)\b/.test(d.mermaid ?? "")) });
  }
  for (const b of blocks.filter((x) => x.type === "check")) {
    r.push({ name: `check "${String(b.title).slice(0, 30)}": answer index valid`, ok: Number.isInteger(b.answer) && b.answer >= 0 && b.answer < (b.options ?? []).length });
  }
  const test = lesson.test as J | undefined;
  if (!test) { r.push({ name: "has a test", ok: false }); return r; }
  if (expect.kind) r.push({ name: "test type fits the topic kind", ok: test.type === TEST_FOR[expect.kind], detail: test.type });
  if (test.type === "quiz") {
    const q = (test.quiz ?? []) as J[];
    r.push({ name: "quiz: at least 3 questions", ok: q.length >= 3, detail: `${q.length}` });
    r.push({ name: "quiz: answer indexes valid", ok: q.every((x) => Number.isInteger(x.answer) && x.answer >= 0 && x.answer < (x.options ?? []).length) });
  } else if (test.type === "code") {
    r.push(runReference(test.code ?? {}));
  } else if (test.type === "architecture") {
    r.push({ name: "architecture: requirements and rubric", ok: (test.architecture?.requirements ?? []).length >= 2 && (test.architecture?.rubric ?? []).length >= 2 });
  } else {
    r.push({ name: "practical: task and rubric", ok: !!test.practical?.task && (test.practical?.rubric ?? []).length >= 2 });
  }
  return r;
}

function print(title: string, results: Result[]) {
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${failed.length ? "FAIL" : "PASS"}  ${title}`);
  for (const x of results) console.log(`  ${x.ok ? "ok  " : "FAIL"} ${x.name}${x.detail ? ` (${x.detail})` : ""}`);
  return failed.length;
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv[argv.indexOf("--file") + 1];
  if (argv.includes("--file") && file) {
    const lesson = JSON.parse(readFileSync(file, "utf8"));
    process.exit(print(file, checkLesson(lesson, lesson._expect ?? {})) ? 1 : 0);
  }
  if (argv.includes("--dry-run")) {
    console.log(`Would generate ${SAMPLES.length} lessons (body + 1 test each) with the production prompts:`);
    for (const s of SAMPLES) console.log(`  - ${s.title} · ${s.format} · ${s.band} · test ${TEST_FOR[s.kind]}`);
    console.log("This calls the Claude API and costs real money. Run without --dry-run to execute.");
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(2); }
  const ai = await import("../netlify/functions/_lib/jobs");
  let cost = 0;
  usageListeners.push((u) => { cost += u.cost_usd; });
  let failures = 0;
  for (const s of SAMPLES) {
    const { about, testType } = ai.lessonAbout({ title: s.title, description: s.description, kind: s.kind }, { band: s.band });
    try {
      const [body, test] = await Promise.all([ai.lessonBody(about, s.format), ai.lessonTest(about, testType)]);
      failures += print(`${s.title} (${s.format}, ${s.band})`, checkLesson({ ...body, test }, { format: s.format, kind: s.kind }));
    } catch (e) {
      failures++; console.log(`\nFAIL  ${s.title}: generation failed: ${(e as Error).message}`);
    }
  }
  console.log(`\n${failures ? `${failures} failed checks` : "All checks passed"} · cost $${cost.toFixed(2)}`);
  process.exit(failures ? 1 : 0);
}

if (process.argv[1]?.includes("eval-lessons")) main();
