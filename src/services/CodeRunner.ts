// Runs the learner's code against test cases in the browser, inside a Web Worker, so an infinite loop cannot
// freeze the page. JavaScript runs natively; Python runs on Pyodide, loaded on first use.
import type { CodeTestCase } from "@/domain/records";

export type CodeLanguage = "js" | "py";

export interface TestCaseResult { passed: boolean; args: string; expected: string; actual: string; error?: string }
export interface TestRun { results: TestCaseResult[]; error?: string }

const JAVASCRIPT_WORKER = `self.onmessage = (event) => {
  const { code, functionName, testCases } = event.data; let fn;
  try { fn = new Function(code + "\\n;return typeof " + functionName + " !== 'undefined' ? " + functionName + " : null;")(); }
  catch (error) { postMessage({ error: String(error) }); return; }
  if (typeof fn !== "function") { postMessage({ error: "לא נמצאה פונקציה בשם " + functionName }); return; }
  postMessage({ outputs: testCases.map((testCase) => {
    try { const value = fn(...JSON.parse(testCase.args_json)); return { actual: JSON.stringify(value === undefined ? null : value) }; }
    catch (error) { return { error: String(error) }; }
  }) });
};`;

const PYTHON_WORKER = `importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
let pyodideReady = loadPyodide();
self.onmessage = async (event) => {
  const { code, functionName, testCases } = event.data;
  try {
    const pyodide = await pyodideReady;
    pyodide.globals.set("_test_cases", JSON.stringify(testCases));
    const outputs = pyodide.runPython(code + "\\nimport json as _json\\n_outputs=[]\\nfor _case in _json.loads(_test_cases):\\n    try:\\n        _outputs.append({'actual': _json.dumps(" + functionName + "(*_json.loads(_case['args_json'])))})\\n    except Exception as _error:\\n        _outputs.append({'error': repr(_error)})\\n_json.dumps(_outputs)");
    postMessage({ outputs: JSON.parse(outputs) });
  } catch (error) { postMessage({ error: String(error).split("\\n").slice(-4).join("\\n") }); }
};`;

const TIMEOUT_MS: Record<CodeLanguage, number> = { js: 5000, py: 40000 };
const TIMEOUT_MESSAGE: Record<CodeLanguage, string> = {
  js: "הריצה לקחה יותר מדי זמן. אולי יש לולאה אינסופית?",
  py: "הריצה לקחה יותר מדי זמן (או ש-Python לא נטען).",
};
const NUMBER_TOLERANCE = 1e-6;

export class CodeRunner {
  /** Deep equality where numbers may differ by floating-point noise. */
  static sameValue(actual: unknown, expected: unknown): boolean {
    if (typeof actual === "number" && typeof expected === "number") return Math.abs(actual - expected) < NUMBER_TOLERANCE;
    if (Array.isArray(actual) && Array.isArray(expected)) {
      return actual.length === expected.length && actual.every((item, index) => CodeRunner.sameValue(item, expected[index]));
    }
    if (actual && expected && typeof actual === "object" && typeof expected === "object") {
      const actualKeys = Object.keys(actual), expectedKeys = Object.keys(expected);
      return actualKeys.length === expectedKeys.length
        && actualKeys.every((key) => CodeRunner.sameValue((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]));
    }
    return actual === expected;
  }

  run(language: CodeLanguage, code: string, functionName: string, testCases: CodeTestCase[]): Promise<TestRun> {
    return new Promise((resolve) => {
      const source = new Blob([language === "py" ? PYTHON_WORKER : JAVASCRIPT_WORKER], { type: "text/javascript" });
      const worker = new Worker(URL.createObjectURL(source));
      const fail = (error: string) => { worker.terminate(); resolve({ results: [], error }); };
      const timer = setTimeout(() => fail(TIMEOUT_MESSAGE[language]), TIMEOUT_MS[language]);
      worker.onerror = (event) => { clearTimeout(timer); fail(event.message || "שגיאה בהרצת הקוד"); };
      worker.onmessage = (event) => {
        clearTimeout(timer);
        worker.terminate();
        if (event.data.error) { resolve({ results: [], error: event.data.error }); return; }
        resolve({ results: testCases.map((testCase, index) => CodeRunner.compare(testCase, event.data.outputs[index])) });
      };
      worker.postMessage({ code, functionName, testCases });
    });
  }

  /** AI-written tests can be wrong: keep only well-formed tests the reference solution itself passes. */
  async keepPassingTests(referenceJs: string, functionName: string, testCases: CodeTestCase[]): Promise<CodeTestCase[]> {
    const wellFormed = testCases.filter((testCase) => {
      try { JSON.parse(testCase.args_json); JSON.parse(testCase.expected_json); return true; } catch { return false; }
    });
    if (!referenceJs.trim()) return wellFormed;
    const { results, error } = await this.run("js", referenceJs, functionName, wellFormed);
    if (error) return wellFormed;
    return wellFormed.filter((_, index) => results[index]?.passed);
  }

  private static compare(testCase: CodeTestCase, output: { actual?: string; error?: string } | undefined): TestCaseResult {
    const result = output ?? { error: "אין תוצאה" };
    let passed = false;
    try { passed = !result.error && CodeRunner.sameValue(JSON.parse(result.actual ?? ""), JSON.parse(testCase.expected_json)); } catch { passed = false; }
    return { passed, args: testCase.args_json, expected: testCase.expected_json, actual: result.actual ?? "", error: result.error };
  }
}
