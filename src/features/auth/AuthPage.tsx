import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth, DEMO } from "@/services/store";

export default function AuthPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">(params.get("new") ? "up" : "in");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const email = f.email.trim();
    const err = mode === "up" ? await auth.signUp(email, f.password, f.name.trim())
      : mode === "in" ? await auth.signIn(email, f.password)
      : (await auth.reset(email)) ?? "אם יש חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס סיסמה.";
    setBusy(false);
    if (err) setMsg(err); else nav("/");
  }

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden />PrepStack</Link>
        <h2>{mode === "up" ? "יצירת חשבון" : mode === "in" ? "התחברות" : "איפוס סיסמה"}</h2>
        {DEMO && <p className="muted">מצב הדגמה: אפשר להזין כל אימייל וסיסמה.</p>}
        {mode === "up" && <label>שם<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>}
        <label>אימייל<input required type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
        {mode !== "reset" && <label>סיסמה<input required type="password" dir="ltr" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "up" ? "new-password" : "current-password"} /></label>}
        {msg && <div className="error" role="alert">{msg}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? "רגע…" : mode === "up" ? "הרשמה" : mode === "in" ? "כניסה" : "שליחת קישור"}</button>
        <div className="auth-links">
          {mode !== "up" && <button type="button" className="link" onClick={() => { setMode("up"); setMsg(""); }}>אין לי חשבון</button>}
          {mode !== "in" && <button type="button" className="link" onClick={() => { setMode("in"); setMsg(""); }}>יש לי חשבון</button>}
          {mode === "in" && <button type="button" className="link" onClick={() => { setMode("reset"); setMsg(""); }}>שכחתי סיסמה</button>}
        </div>
      </form>
    </div>
  );
}
