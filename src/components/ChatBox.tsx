import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMsg } from "@/types";
import { Md } from "@/components/ui";

/** Chat transcript + composer. Supports dictation (speak your answer, as in a real interview) where the browser allows it. */
export function ChatBox({ messages, streaming, busy, onSend, lang = "he", placeholder, other = "המראיין", footer }: {
  messages: ChatMsg[]; streaming: string; busy: boolean; onSend: (text: string) => void;
  lang?: string; placeholder?: string; other?: string; footer?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, streaming]);

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  function dictate() {
    if (listening) { rec.current?.stop(); return; }
    const r = new SR(); rec.current = r;
    r.lang = lang === "en" ? "en-US" : "he-IL"; r.continuous = true; r.interimResults = false;
    r.onresult = (e: any) => { const said = e.results[e.results.length - 1][0].transcript; setText((t) => (t ? `${t} ` : "") + said.trim()); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    r.start(); setListening(true);
  }
  function send() { const t = text.trim(); if (!t || busy) return; rec.current?.stop(); setText(""); onSend(t); }

  return (
    <div className="chat">
      <div className="chat-log">
        {messages.filter((m) => !m.content.startsWith("[START]") && m.content !== "[TIME]").map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.tool ? "tool" : ""}`}>
            <span className="who">{m.tool ? (m.role === "user" ? "אתם → עוזר AI" : "עוזר AI") : m.role === "user" ? "אתם" : other}</span>
            <Md>{m.content}</Md>
          </div>
        ))}
        {streaming && <div className="msg assistant"><span className="who">{other}</span><Md>{streaming}</Md></div>}
        {busy && !streaming && <div className="msg assistant typing"><span className="who">{other}</span>כותב…</div>}
        <div ref={end} />
      </div>
      <div className="composer">
        <textarea rows={3} value={text} placeholder={placeholder ?? "התשובה שלך…"} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} />
        <div className="row between">
          <div className="row">{SR && <button className={`btn small ${listening ? "rec" : ""}`} onClick={dictate} title="הכתבה בקול">{listening ? "⏹ עצירה" : "🎤 דברו"}</button>}{footer}</div>
          <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>שליחה</button>
        </div>
      </div>
    </div>
  );
}
