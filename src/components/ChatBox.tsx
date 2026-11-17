import { useEffect, useRef, useState, type ReactNode } from "react";
import { START_MESSAGE } from "@/domain/MockInterview";
import type { ChatMessage } from "@/domain/records";
import { Markdown } from "@/components/ui";

/** Sent when the interview clock runs out; never shown. */
const TIME_UP_MESSAGE = "[TIME]";

// The Web Speech API is not in TypeScript's DOM types yet; this is the part we use.
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void; onerror: () => void;
  start(): void; stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
const browserWindow = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
const SpeechRecognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;

function speakerLabel(message: ChatMessage, otherSpeaker: string): string {
  if (message.tool) return message.role === "user" ? "אתם → עוזר AI" : "עוזר AI";
  return message.role === "user" ? "אתם" : otherSpeaker;
}

/** Chat transcript and composer. Supports dictation (speak your answer, as in a real interview) where the browser allows it. */
export function ChatBox({ messages, streaming, busy, onSend, lang = "he", placeholder, otherSpeaker = "המראיין", footer }: {
  messages: ChatMessage[]; streaming: string; busy: boolean; onSend: (text: string) => void;
  lang?: string; placeholder?: string; otherSpeaker?: string; footer?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, streaming]);

  function toggleDictation() {
    if (!SpeechRecognition) return;
    if (listening) { recognition.current?.stop(); return; }
    const session = new SpeechRecognition();
    recognition.current = session;
    session.lang = lang === "en" ? "en-US" : "he-IL";
    session.continuous = true;
    session.interimResults = false;
    session.onresult = (event) => {
      const spoken = event.results[event.results.length - 1][0].transcript.trim();
      setDraft((current) => (current ? `${current} ` : "") + spoken);
    };
    session.onend = () => setListening(false);
    session.onerror = () => setListening(false);
    session.start();
    setListening(true);
  }

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    recognition.current?.stop();
    setDraft("");
    onSend(text);
  }

  const visible = messages.filter((message) => !message.content.startsWith(START_MESSAGE) && message.content !== TIME_UP_MESSAGE);

  return (
    <div className="chat">
      <div className="chat-log">
        {visible.map((message, index) => (
          <div key={index} className={`msg ${message.role} ${message.tool ? "tool" : ""}`}>
            <span className="who">{speakerLabel(message, otherSpeaker)}</span>
            <Markdown>{message.content}</Markdown>
          </div>
        ))}
        {streaming && <div className="msg assistant"><span className="who">{otherSpeaker}</span><Markdown>{streaming}</Markdown></div>}
        {busy && !streaming && <div className="msg assistant typing"><span className="who">{otherSpeaker}</span>כותב…</div>}
        <div ref={logEnd} />
      </div>
      <div className="composer">
        <textarea rows={3} value={draft} placeholder={placeholder ?? "התשובה שלך…"} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send(); }} />
        <div className="row between">
          <div className="row">
            {SpeechRecognition && <button className={`btn small ${listening ? "rec" : ""}`} onClick={toggleDictation} title="הכתבה בקול">{listening ? "⏹ עצירה" : "🎤 דברו"}</button>}
            {footer}
          </div>
          <button className="btn primary" onClick={send} disabled={busy || !draft.trim()}>שליחה</button>
        </div>
      </div>
    </div>
  );
}
