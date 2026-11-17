// The live mock interview: chat with the interviewer, a shared workspace (code editor or architecture canvas),
// a clock, and at the end a hiring-committee style scorecard.
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useServices } from "@/app/AppContext";
import { ArchitectureDiagram } from "@/domain/ArchitectureDiagram";
import { InterviewTranscript, START_MESSAGE, type MockInterview } from "@/domain/MockInterview";
import type { ArchitectureCanvas, ChatMessage, InterviewWorkspace } from "@/domain/records";
import type { CodeLanguage } from "@/services/CodeRunner";
import { ArchCanvas } from "@/components/ArchCanvas";
import { ChatBox } from "@/components/ChatBox";
import { CodeEditor } from "@/components/CodeLab";
import { ErrorMessage, Loading } from "@/components/ui";
import { ScorecardView } from "./ScorecardView";

/** The clock turns red in the last two minutes. */
const LOW_TIME_SECONDS = 120;

const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function InterviewRoom() {
  const { interviewId } = useParams();
  const { interviews } = useServices();
  const [interview, setInterview] = useState<MockInterview | null>(null);
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [debriefing, setDebriefing] = useState(false);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<CodeLanguage>("js");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [visiblePane, setVisiblePane] = useState<"chat" | "workspace">("chat");
  const canvas = useRef<ArchitectureCanvas>(ArchitectureDiagram.empty());
  const openingRequested = useRef(false);

  const type = interview?.type ?? null;

  /** The workspace as the interviewer reads it. */
  function workspaceText(): string {
    if (type?.workspace === "code") return code.trim() ? `Language: ${language}\n${code}` : "";
    if (type?.workspace === "canvas") return new ArchitectureDiagram(canvas.current).toText();
    return "";
  }
  const workspaceState = (): InterviewWorkspace => ({ code, lang: language, canvas: canvas.current });

  async function interviewerTurn(current: MockInterview, history: ChatMessage[]) {
    setBusy(true); setError("");
    try { setTranscript(await interviews.interviewerTurn(current, history, workspaceState(), workspaceText(), setStreaming)); }
    catch (failure) { setError((failure as Error).message); }
    setStreaming(""); setBusy(false);
  }

  useEffect(() => {
    interviews.find(interviewId ?? "").then((loaded) => {
      if (!loaded) { setError("הראיון לא נמצא."); return; }
      setInterview(loaded);
      setTranscript(loaded.transcript);
      if (loaded.workspace) {
        setCode(loaded.workspace.code ?? "");
        setLanguage(loaded.workspace.lang ?? "js");
        canvas.current = loaded.workspace.canvas ?? ArchitectureDiagram.empty();
      }
      if (!loaded.isLive) return;
      setSecondsLeft(loaded.durationSeconds);
      // A new interview: ask the interviewer to open (once, even under React's double effects in development).
      if (!loaded.transcript.length && !openingRequested.current) {
        openingRequested.current = true;
        const opening: ChatMessage[] = [{ role: "user", content: START_MESSAGE }];
        setTranscript(opening);
        void interviewerTurn(loaded, opening);
      }
    }).catch((failure: Error) => setError(failure.message));
    // Only a new interview id reloads the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  const clockRunning = secondsLeft != null && !!interview?.isLive;
  useEffect(() => {
    if (!clockRunning) return;
    const timer = setInterval(() => setSecondsLeft((seconds) => (seconds == null ? seconds : Math.max(0, seconds - 1))), 1000);
    return () => clearInterval(timer);
  }, [clockRunning]);

  function sendAnswer(text: string) {
    if (!interview) return;
    const updated: ChatMessage[] = [...transcript, { role: "user", content: text }];
    setTranscript(updated);
    void interviewerTurn(interview, updated);
  }

  async function askAssistant() {
    const question = assistantQuestion.trim();
    if (!interview || !question) return;
    setAssistantQuestion("");
    setTranscript([...transcript, { role: "user", content: question, tool: true }]);
    setBusy(true);
    try { setTranscript(await interviews.askAssistant(interview, transcript, question, code, setStreaming)); }
    catch (failure) { setError((failure as Error).message); }
    setStreaming(""); setBusy(false);
  }

  async function finish() {
    if (!interview) return;
    setDebriefing(true); setError("");
    try { setInterview(await interviews.finish(interview, transcript, { ...workspaceState(), text: workspaceText() || null })); }
    catch (failure) { setError((failure as Error).message); }
    setDebriefing(false);
  }

  if (!interview || !type) return error ? <ErrorMessage message={error} /> : <Loading label="טוען את הראיון…" />;
  if (debriefing) return <Loading label="מכין משוב…" />;
  if (interview.isFinished && interview.scorecard) return <ScorecardView interview={interview} transcript={transcript} />;

  const answerCount = new InterviewTranscript(transcript).answerCount;
  const confirmFinish = () => { if (window.confirm("לסיים את הראיון ולקבל משוב?")) void finish(); };

  return (
    <div className="page room">
      <div className="row between page-head">
        <div><h1>{type.title}</h1><p className="muted">{interview.config.level} · {interview.languageLabel}</p></div>
        <div className="row">
          <span role="timer" aria-label="הזמן שנותר" className={`clock ${secondsLeft != null && secondsLeft < LOW_TIME_SECONDS ? "low" : ""}`}>
            {secondsLeft === 0 ? "הזמן נגמר" : secondsLeft != null ? formatClock(secondsLeft) : ""}
          </span>
          <button className="btn primary" disabled={busy || answerCount === 0} onClick={confirmFinish}>סיום</button>
        </div>
      </div>
      <ErrorMessage message={error} />
      {type.workspace !== "none" && <div className="seg room-tabs" role="group" aria-label="תצוגה">
        <button aria-pressed={visiblePane === "chat"} className={visiblePane === "chat" ? "on" : ""} onClick={() => setVisiblePane("chat")}>שיחה</button>
        <button aria-pressed={visiblePane === "workspace"} className={visiblePane === "workspace" ? "on" : ""} onClick={() => setVisiblePane("workspace")}>
          {type.workspace === "code" ? "עורך קוד" : "לוח"}
        </button>
      </div>}
      <div className={`room-grid ${type.workspace === "none" ? "solo" : ""}`} data-pane={visiblePane === "workspace" ? "ws" : "chat"}>
        <ChatBox messages={transcript} streaming={streaming} busy={busy} onSend={sendAnswer} lang={interview.config.lang} />
        {type.workspace === "code" && <div className="card ws">
          <div className="row between">
            <b>עורך משותף</b>
            <div className="seg">
              <button className={language === "js" ? "on" : ""} onClick={() => setLanguage("js")}>JavaScript</button>
              <button className={language === "py" ? "on" : ""} onClick={() => setLanguage("py")}>Python</button>
            </div>
          </div>
          <CodeEditor value={code} onChange={setCode} language={language} height="420px" />
          {type.id === "ai_assisted" && <div className="ai-tool">
            <b>עוזר AI</b>
            <div className="row">
              <input dir="auto" value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && void askAssistant()}
                placeholder="בקשו מהעוזר לכתוב, להסביר או לבדוק קוד…" />
              <button className="btn" disabled={busy || !assistantQuestion.trim()} onClick={askAssistant}>שאלו</button>
            </div>
          </div>}
        </div>}
        {type.workspace === "canvas" && <div className="card ws">
          <b>לוח ארכיטקטורה משותף</b>
          <ArchCanvas value={canvas.current} onChange={(updated) => { canvas.current = updated; }} height={400} />
        </div>}
      </div>
    </div>
  );
}
