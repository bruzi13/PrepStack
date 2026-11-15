// The live mock interview: chat with the interviewer, a shared workspace (code editor or architecture canvas),
// a clock, and at the end a hiring-committee style scorecard.
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { interviewById } from "@shared/catalog";
import { useMe } from "@/app/AppContext";
import { chat, runJob } from "@/services/ai";
import { addTopics } from "@/services/plans";
import { db } from "@/services/store";
import type { Canvas, ChatMsg, Interview, Plan, Scorecard, Topic } from "@/types";
import { ArchCanvas, canvasText, emptyCanvas } from "@/components/ArchCanvas";
import { ChatBox } from "@/components/ChatBox";
import { CodeEditor, type Lang } from "@/components/CodeLab";
import { Bar, Busy, ErrorBox, ScoreRing } from "@/components/ui";

const SIGNAL: Record<string, string> = { strong_no: "Strong No Hire", no: "No Hire", lean_no: "Lean No Hire", lean_yes: "Lean Hire", yes: "Hire", strong_yes: "Strong Hire" };

/** The interviewer sees the candidate's AI-tool usage as part of the candidate's next message. */
function toApi(transcript: ChatMsg[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  let tool = "";
  for (const m of transcript) {
    if (m.tool) { tool += `[AI-TOOL] ${m.role === "user" ? "candidate asked the AI assistant" : "AI assistant replied"}: ${m.content}\n`; continue; }
    out.push({ role: m.role, content: m.role === "user" && tool ? `${tool}\n${m.content}` : m.content });
    if (m.role === "user") tool = "";
  }
  return out;
}

export default function InterviewRoom() {
  const { id } = useParams();
  const { user } = useMe();
  const [iv, setIv] = useState<Interview | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [debriefing, setDebriefing] = useState(false);
  const [code, setCode] = useState("");
  const [lang, setLang] = useState<Lang>("js");
  const [left, setLeft] = useState<number | null>(null);
  const [aiAsk, setAiAsk] = useState("");
  const canvas = useRef<Canvas>(emptyCanvas());
  const opened = useRef(false);

  const type = iv ? interviewById(iv.type) : null;
  const workspace = () => (type?.workspace === "code" ? (code.trim() ? `Language: ${lang}\n${code}` : "") : type?.workspace === "canvas" ? canvasText(canvas.current) : "");

  async function turn(history: ChatMsg[], row: Interview) {
    setBusy(true); setErr("");
    try {
      const reply = await chat({ mode: "interview", type: row.type, config: row.config, messages: toApi(history), workspace: workspace() }, setStreaming);
      const next = [...history, { role: "assistant" as const, content: reply }];
      setMsgs(next);
      await db.update("prep_interviews", row.id, { transcript: next, workspace: { code, lang, canvas: canvas.current } });
    } catch (e) { setErr((e as Error).message); }
    setStreaming(""); setBusy(false);
  }

  useEffect(() => {
    db.list<Interview>("prep_interviews", { eq: { id } }).then(([row]) => {
      if (!row) { setErr("הראיון לא נמצא."); return; }
      setIv(row); setMsgs(row.transcript ?? []);
      if (row.workspace) { setCode(row.workspace.code ?? ""); setLang(row.workspace.lang ?? "js"); canvas.current = row.workspace.canvas ?? emptyCanvas(); }
      if (row.status === "live") {
        setLeft((row.config.minutes ?? 30) * 60);
        if (!(row.transcript ?? []).length && !opened.current) { opened.current = true; const first = [{ role: "user" as const, content: "[START]" }]; setMsgs(first); turn(first, row); }
      }
    }).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (left == null || iv?.status !== "live") return;
    const t = setInterval(() => setLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [left == null, iv?.status]);

  function send(text: string) { if (!iv) return; const next = [...msgs, { role: "user" as const, content: text }]; setMsgs(next); turn(next, iv); }

  async function askAi() {
    if (!iv || !aiAsk.trim()) return;
    const q = aiAsk.trim(); setAiAsk("");
    const withQ = [...msgs, { role: "user" as const, content: q, tool: true }];
    setMsgs(withQ); setBusy(true);
    try {
      const reply = await chat({ mode: "pair", config: iv.config, messages: [{ role: "user", content: `${q}${code.trim() ? `\n\nCurrent code:\n${code}` : ""}` }] }, setStreaming);
      const next = [...withQ, { role: "assistant" as const, content: reply, tool: true }];
      setMsgs(next); await db.update("prep_interviews", iv.id, { transcript: next });
    } catch (e) { setErr((e as Error).message); }
    setStreaming(""); setBusy(false);
  }

  async function finish() {
    if (!iv) return;
    setDebriefing(true); setErr("");
    try {
      const ws = { code, lang, canvas: canvas.current };
      const scorecard = await runJob<Scorecard>("debrief", { type: iv.type, config: iv.config, transcript: msgs.filter((m) => m.content !== "[START]"), workspace: workspace() || null }, user.id);
      await db.update("prep_interviews", iv.id, { status: "done", scorecard, score: scorecard.score, transcript: msgs, workspace: ws });
      setIv({ ...iv, status: "done", scorecard, score: scorecard.score });
    } catch (e) { setErr((e as Error).message); }
    setDebriefing(false);
  }

  if (!iv || !type) return err ? <ErrorBox msg={err} /> : <Busy label="טוען את הראיון…" />;
  if (debriefing) return <Busy label="ועדת הגיוס כותבת את המשוב" steps={["קוראים את כל הראיון…", "מדרגים כל מימד ברובריקה…", "מאתרים את הרגעים המכריעים…"]} />;

  if (iv.status === "done" && iv.scorecard) return <ScorecardView iv={iv} msgs={msgs} />;

  const answered = msgs.filter((m) => m.role === "user" && !m.tool && m.content !== "[START]").length;
  const mm = left != null ? `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` : "";

  return (
    <div className="page room">
      <div className="row between page-head">
        <div><h1>{type.icon} {type.title}</h1><p className="muted">{iv.config.level} · {iv.config.lang === "en" ? "English" : "עברית"}</p></div>
        <div className="row"><span className={`clock ${left != null && left < 120 ? "low" : ""}`}>{left === 0 ? "הזמן נגמר" : mm}</span>
          <button className="btn primary" disabled={busy || answered === 0} onClick={() => { if (window.confirm("לסיים את הראיון ולקבל משוב?")) finish(); }}>סיום וקבלת משוב</button></div>
      </div>
      <ErrorBox msg={err} />
      <div className={`room-grid ${type.workspace === "none" ? "solo" : ""}`}>
        <ChatBox messages={msgs} streaming={streaming} busy={busy} onSend={send} lang={iv.config.lang} />
        {type.workspace === "code" && <div className="card ws">
          <div className="row between"><b>עורך משותף</b><div className="seg"><button className={lang === "js" ? "on" : ""} onClick={() => setLang("js")}>JavaScript</button><button className={lang === "py" ? "on" : ""} onClick={() => setLang("py")}>Python</button></div></div>
          <CodeEditor value={code} onChange={setCode} lang={lang} height="420px" />
          <small className="muted">המראיין רואה את הקוד בכל פעם שאתם שולחים הודעה.</small>
          {type.id === "ai_assisted" && <div className="ai-tool">
            <b>🤖 עוזר AI</b><small className="muted"> מותר להשתמש. המראיין רואה מה ביקשתם ומה קיבלתם.</small>
            <div className="row"><input dir="auto" value={aiAsk} onChange={(e) => setAiAsk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAi()} placeholder="בקשו מהעוזר לכתוב, להסביר או לבדוק קוד…" /><button className="btn" disabled={busy || !aiAsk.trim()} onClick={askAi}>שאלו</button></div>
          </div>}
        </div>}
        {type.workspace === "canvas" && <div className="card ws"><b>לוח ארכיטקטורה משותף</b><ArchCanvas value={canvas.current} onChange={(c) => { canvas.current = c; }} height={400} />
          <small className="muted">המראיין רואה את הלוח בכל פעם שאתם שולחים הודעה.</small></div>}
      </div>
    </div>
  );
}

function ScorecardView({ iv, msgs }: { iv: Interview; msgs: ChatMsg[] }) {
  const { user } = useMe();
  const s = iv.scorecard!;
  const [added, setAdded] = useState<string[]>([]);
  async function addDrill(d: Scorecard["drills"][number]) {
    const [plan] = await db.list<Plan>("prep_plans", { eq: { user_id: user.id, track: "main", active: true } });
    if (!plan) return;
    const topics = await db.list<Topic>("prep_topics", { eq: { plan_id: plan.id } });
    await addTopics(user, plan, [{ ...d, module: "מהראיונות שלי", priority: 1 }], topics.length);
    setAdded([...added, d.title]);
  }
  return (
    <div className="page">
      <Link to="/interviews" className="link">→ לכל הסימולציות</Link>
      <div className="card"><div className="review-head"><ScoreRing score={s.score} label="ציון" /><div><h2>{iv.config.title}</h2><span className={`pill ${s.score >= 70 ? "good" : s.score >= 50 ? "warn" : "bad"}`}>{SIGNAL[s.hire_signal] ?? s.hire_signal}</span><p>{s.summary}</p></div></div>
        <div className="dims">{s.dimensions.map((d) => <div key={d.name} className="dim"><div className="dim-top"><span>{d.name}</span><b>{d.score}</b></div><Bar value={d.score} /><small className="muted">{d.comment}</small></div>)}</div></div>
      <div className="grid2">
        <div className="card"><h3>מה עבד</h3><ul className="plus">{s.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div className="card"><h3>מה לשפר</h3><ul>{s.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      {s.moments.length > 0 && <div className="card"><h3>רגעים מכריעים</h3>{s.moments.map((m, i) => <div key={i} className="moment"><blockquote>"{m.quote}"</blockquote><p><b>מה המראיין חשב:</b> {m.feedback}</p><p><b>תשובה חזקה יותר:</b> {m.better}</p></div>)}</div>}
      {s.drills.length > 0 && <div className="card"><h3>מה ללמוד בעקבות הראיון</h3><ul className="list">{s.drills.map((d) => <li key={d.title}><div className="row between"><span><b>{d.title}</b> <small className="muted">{d.description}</small></span>
        <button className="btn small" disabled={added.includes(d.title)} onClick={() => addDrill(d)}>{added.includes(d.title) ? "נוסף לתוכנית" : "הוסיפו לתוכנית"}</button></div></li>)}</ul></div>}
      <details className="card"><summary>תמליל הראיון</summary><ChatLog msgs={msgs} /></details>
    </div>
  );
}

const ChatLog = ({ msgs }: { msgs: ChatMsg[] }) => <div className="chat-log static">{msgs.filter((m) => m.content !== "[START]").map((m, i) => <div key={i} className={`msg ${m.role} ${m.tool ? "tool" : ""}`}><span className="who">{m.tool ? "עוזר AI" : m.role === "user" ? "אתם" : "המראיין"}</span><div className="md">{m.content}</div></div>)}</div>;
