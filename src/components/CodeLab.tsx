import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { runTests, verifiedTests, type TestCase, type TestResult } from "@/learning/runner";
import type { CodeTest } from "@/types";
import { Md } from "@/components/ui";

export type Lang = "js" | "py";

export function CodeEditor({ value, onChange, lang, height = "340px" }: { value: string; onChange: (v: string) => void; lang: Lang; height?: string }) {
  return (
    <div className="ltr editor">
      <CodeMirror value={value} height={height} extensions={[lang === "py" ? python() : javascript()]} onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }} />
    </div>
  );
}

export interface CodeSubmission { lang: Lang; code: string; passed: number; total: number; failures: { args: string; expected: string; got: string; error?: string }[] }

/** LeetCode-style test: statement, editor, run against hidden-in-plain-sight test cases, submit for grading. */
export function CodeLab({ test, onSubmit, busy }: { test: CodeTest; onSubmit: (s: CodeSubmission) => void; busy: boolean }) {
  const [lang, setLang] = useState<Lang>("js");
  const [code, setCode] = useState({ js: test.starter_js, py: test.starter_py });
  const [tests, setTests] = useState<TestCase[] | null>(null);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [hints, setHints] = useState(0);

  // Check the AI-written tests against the reference solution before trusting them.
  useEffect(() => { let alive = true; verifiedTests(test.reference_js, test.fn_name, test.tests).then((t) => alive && setTests(t)); return () => { alive = false; }; }, [test]);

  async function run(): Promise<TestResult[] | null> {
    if (!tests) return null;
    setRunning(true); setError("");
    const r = await runTests(lang, code[lang], test.fn_name, tests);
    setRunning(false);
    if (r.error) { setError(r.error); setResults(null); return null; }
    setResults(r.results); return r.results;
  }
  async function submit() {
    const r = (await run()) ?? [];
    onSubmit({ lang, code: code[lang], passed: r.filter((x) => x.ok).length, total: tests?.length ?? 0,
      failures: r.filter((x) => !x.ok).slice(0, 4).map(({ args, expected, got, error }) => ({ args, expected, got, error })) });
  }
  const passed = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="codelab">
      <div className="card">
        <h3>{test.title}</h3>
        <Md>{test.statement}</Md>
        {test.hints.slice(0, hints).map((h, i) => <div key={i} className="hint">{h}</div>)}
        {hints < test.hints.length && <button className="btn ghost small" onClick={() => setHints(hints + 1)}>רמז ({hints + 1}/{test.hints.length})</button>}
      </div>
      <div className="card">
        <div className="row between">
          <div className="seg">
            <button className={lang === "js" ? "on" : ""} onClick={() => { setLang("js"); setResults(null); }}>JavaScript</button>
            <button className={lang === "py" ? "on" : ""} onClick={() => { setLang("py"); setResults(null); }}>Python</button>
          </div>
          <div className="row">
            <button className="btn" disabled={running || !tests || busy} onClick={run}>{running ? "מריץ…" : "הרצה"}</button>
            <button className="btn primary" disabled={running || !tests || busy} onClick={submit}>הגשה</button>
          </div>
        </div>
        <CodeEditor value={code[lang]} lang={lang} onChange={(v) => setCode({ ...code, [lang]: v })} />
        {error && <pre className="error ltr">{error}</pre>}
        {results && (
          <div className="tests">
            <b>{passed}/{results.length} עברו</b>
            {results.map((r, i) => (
              <div key={i} className={`test ltr ${r.ok ? "pass" : "fail"}`}>
                <span>{r.ok ? "✓" : "✗"} {test.fn_name}({r.args.slice(1, -1)})</span>
                {!r.ok && <span>expected {r.expected} · got {r.error ?? r.got}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
