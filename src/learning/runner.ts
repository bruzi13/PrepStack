// Runs the learner's code against the tests, in the browser, inside a Web Worker (so an infinite loop can't freeze the page).
// JavaScript runs natively; Python runs on Pyodide, loaded on first use.
export interface TestCase { args_json: string; expected_json: string }
export interface TestResult { ok: boolean; args: string; expected: string; got: string; error?: string }

const JS_WORKER = `self.onmessage = (e) => {
  const { code, fn, tests } = e.data; let f;
  try { f = new Function(code + "\\n;return typeof " + fn + " !== 'undefined' ? " + fn + " : null;")(); }
  catch (err) { postMessage({ error: String(err) }); return; }
  if (typeof f !== "function") { postMessage({ error: "לא נמצאה פונקציה בשם " + fn }); return; }
  postMessage({ out: tests.map((t) => {
    try { const got = f(...JSON.parse(t.args_json)); return { got: JSON.stringify(got === undefined ? null : got) }; }
    catch (err) { return { error: String(err) }; }
  }) });
};`;

const PY_WORKER = `importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
let ready = loadPyodide();
self.onmessage = async (e) => {
  const { code, fn, tests } = e.data;
  try {
    const py = await ready;
    py.globals.set("_tests", JSON.stringify(tests));
    const out = py.runPython(code + "\\nimport json as _j\\n_out=[]\\nfor _t in _j.loads(_tests):\\n    try:\\n        _out.append({'got': _j.dumps(" + fn + "(*_j.loads(_t['args_json'])))})\\n    except Exception as _e:\\n        _out.append({'error': repr(_e)})\\n_j.dumps(_out)");
    postMessage({ out: JSON.parse(out) });
  } catch (err) { postMessage({ error: String(err).split("\\n").slice(-4).join("\\n") }); }
};`;

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => same((a as any)[k], (b as any)[k]));
  }
  return a === b;
}

export function runTests(lang: "js" | "py", code: string, fn: string, tests: TestCase[]): Promise<{ results: TestResult[]; error?: string }> {
  return new Promise((resolve) => {
    const worker = new Worker(URL.createObjectURL(new Blob([lang === "py" ? PY_WORKER : JS_WORKER], { type: "text/javascript" })));
    const fail = (error: string) => { worker.terminate(); resolve({ results: [], error }); };
    const timer = setTimeout(() => fail(lang === "py" ? "הריצה לקחה יותר מדי זמן (או ש-Python לא נטען)." : "הריצה לקחה יותר מדי זמן. אולי יש לולאה אינסופית?"), lang === "py" ? 40000 : 5000);
    worker.onerror = (e) => { clearTimeout(timer); fail(e.message || "שגיאה בהרצת הקוד"); };
    worker.onmessage = (e) => {
      clearTimeout(timer); worker.terminate();
      if (e.data.error) return resolve({ results: [], error: e.data.error });
      resolve({ results: tests.map((t, i) => {
        const r = e.data.out[i] ?? { error: "אין תוצאה" };
        let ok = false;
        try { ok = !r.error && same(JSON.parse(r.got), JSON.parse(t.expected_json)); } catch { ok = false; }
        return { ok, args: t.args_json, expected: t.expected_json, got: r.got ?? "", error: r.error };
      }) });
    };
    worker.postMessage({ code, fn, tests });
  });
}

/** AI-written tests can be wrong. Keep only the tests the reference solution itself passes. */
export async function verifiedTests(referenceJs: string, fn: string, tests: TestCase[]): Promise<TestCase[]> {
  const valid = tests.filter((t) => { try { JSON.parse(t.args_json); JSON.parse(t.expected_json); return true; } catch { return false; } });
  if (!referenceJs.trim()) return valid;
  const { results, error } = await runTests("js", referenceJs, fn, valid);
  if (error) return valid;
  return valid.filter((_, i) => results[i]?.ok);
}
