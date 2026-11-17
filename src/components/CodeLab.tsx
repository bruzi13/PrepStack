import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { useServices } from "@/app/AppContext";
import type { CodeTest, CodeTestCase } from "@/domain/records";
import type { CodeLanguage, TestCaseResult } from "@/services/CodeRunner";
import { Markdown } from "@/components/ui";

const MAX_REPORTED_FAILURES = 4;

export function CodeEditor({ value, onChange, language, height = "340px" }: { value: string; onChange: (code: string) => void; language: CodeLanguage; height?: string }) {
  return (
    <div className="ltr editor">
      <CodeMirror value={value} height={height} extensions={[language === "py" ? python() : javascript()]} onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }} />
    </div>
  );
}

/** What the grader receives for a code test. Pass counts are shown to the learner as text only. */
export interface CodeSubmission {
  lang: CodeLanguage;
  code: string;
  passed: number;
  total: number;
  failures: { args: string; expected: string; actual: string; error?: string }[];
}

/** LeetCode-style test: statement, editor, run against visible test cases, submit for grading. */
export function CodeLab({ test, onSubmit, busy }: { test: CodeTest; onSubmit: (submission: CodeSubmission) => void; busy: boolean }) {
  const { codeRunner } = useServices();
  const [language, setLanguage] = useState<CodeLanguage>("js");
  const [codeByLanguage, setCodeByLanguage] = useState<Record<CodeLanguage, string>>({ js: test.starter_js, py: test.starter_py });
  const [testCases, setTestCases] = useState<CodeTestCase[] | null>(null);
  const [results, setResults] = useState<TestCaseResult[] | null>(null);
  const [runError, setRunError] = useState("");
  const [running, setRunning] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);

  // Check the AI-written tests against the reference solution before trusting them.
  useEffect(() => {
    let mounted = true;
    codeRunner.keepPassingTests(test.reference_js, test.fn_name, test.tests).then((verified) => mounted && setTestCases(verified));
    return () => { mounted = false; };
  }, [codeRunner, test]);

  async function runTests(): Promise<TestCaseResult[] | null> {
    if (!testCases) return null;
    setRunning(true); setRunError("");
    const run = await codeRunner.run(language, codeByLanguage[language], test.fn_name, testCases);
    setRunning(false);
    if (run.error) { setRunError(run.error); setResults(null); return null; }
    setResults(run.results);
    return run.results;
  }

  async function submit() {
    const finalResults = (await runTests()) ?? [];
    onSubmit({
      lang: language, code: codeByLanguage[language], passed: finalResults.filter((result) => result.passed).length, total: testCases?.length ?? 0,
      failures: finalResults.filter((result) => !result.passed).slice(0, MAX_REPORTED_FAILURES)
        .map(({ args, expected, actual, error }) => ({ args, expected, actual, error })),
    });
  }

  function switchLanguage(next: CodeLanguage) { setLanguage(next); setResults(null); }
  const passedCount = results?.filter((result) => result.passed).length ?? 0;
  const disabled = running || !testCases || busy;

  return (
    <div className="codelab">
      <div className="card">
        <h3>{test.title}</h3>
        <Markdown>{test.statement}</Markdown>
        {test.hints.slice(0, hintsShown).map((hint, index) => <div key={index} className="hint">{hint}</div>)}
        {hintsShown < test.hints.length && <button className="btn ghost small" onClick={() => setHintsShown(hintsShown + 1)}>רמז ({hintsShown + 1}/{test.hints.length})</button>}
      </div>
      <div className="card">
        <div className="row between">
          <div className="seg">
            <button className={language === "js" ? "on" : ""} onClick={() => switchLanguage("js")}>JavaScript</button>
            <button className={language === "py" ? "on" : ""} onClick={() => switchLanguage("py")}>Python</button>
          </div>
          <div className="row">
            <button className="btn" disabled={disabled} onClick={runTests}>{running ? "מריץ…" : "הרצה"}</button>
            <button className="btn primary" disabled={disabled} onClick={submit}>הגשה</button>
          </div>
        </div>
        <CodeEditor value={codeByLanguage[language]} language={language} onChange={(code) => setCodeByLanguage({ ...codeByLanguage, [language]: code })} />
        {runError && <pre className="error ltr">{runError}</pre>}
        {results && (
          <div className="tests">
            <b>{passedCount}/{results.length} עברו</b>
            {results.map((result, index) => (
              <div key={index} className={`test ltr ${result.passed ? "pass" : "fail"}`}>
                <span>{result.passed ? "✓" : "✗"} {test.fn_name}({result.args.slice(1, -1)})</span>
                {!result.passed && <span>expected {result.expected} · got {result.error ?? result.actual}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
