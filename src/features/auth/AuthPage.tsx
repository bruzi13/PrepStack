import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useServices } from "@/app/AppContext";

type AuthMode = "signIn" | "signUp" | "reset";

const HEADINGS: Record<AuthMode, string> = { signUp: "יצירת חשבון", signIn: "התחברות", reset: "איפוס סיסמה" };
const SUBMIT_LABELS: Record<AuthMode, string> = { signUp: "הרשמה", signIn: "כניסה", reset: "שליחת קישור" };
const RESET_SENT = "אם יש חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס סיסמה.";

export default function AuthPage() {
  const { auth, isDemo } = useServices();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>(searchParams.get("new") ? "signUp" : "signIn");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const updateForm = (changes: Partial<typeof form>) => setForm({ ...form, ...changes });
  const switchMode = (next: AuthMode) => { setMode(next); setMessage(""); };

  /** Returns a message to show, or null on success. */
  async function authenticate(): Promise<string | null> {
    const email = form.email.trim();
    if (mode === "signUp") return auth.signUp(email, form.password, form.name.trim());
    if (mode === "signIn") return auth.signIn(email, form.password);
    return (await auth.requestPasswordReset(email)) ?? RESET_SENT;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setMessage("");
    const problem = await authenticate();
    setSubmitting(false);
    if (problem) setMessage(problem); else navigate("/");
  }

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden />PrepStack</Link>
        <h2>{HEADINGS[mode]}</h2>
        {isDemo && <p className="muted">מצב הדגמה: אפשר להזין כל אימייל וסיסמה.</p>}
        {mode === "signUp" && <label>שם<input required value={form.name} onChange={(event) => updateForm({ name: event.target.value })} autoComplete="name" /></label>}
        <label>אימייל<input required type="email" dir="ltr" value={form.email} onChange={(event) => updateForm({ email: event.target.value })} autoComplete="email" /></label>
        {mode !== "reset" && <label>סיסמה<input required type="password" dir="ltr" minLength={6} value={form.password} onChange={(event) => updateForm({ password: event.target.value })}
          autoComplete={mode === "signUp" ? "new-password" : "current-password"} /></label>}
        {message && <div className="error" role="alert">{message}</div>}
        <button className="btn primary big" disabled={submitting}>{submitting ? "רגע…" : SUBMIT_LABELS[mode]}</button>
        <div className="auth-links">
          {mode !== "signUp" && <button type="button" className="link" onClick={() => switchMode("signUp")}>אין לי חשבון</button>}
          {mode !== "signIn" && <button type="button" className="link" onClick={() => switchMode("signIn")}>יש לי חשבון</button>}
          {mode === "signIn" && <button type="button" className="link" onClick={() => switchMode("reset")}>שכחתי סיסמה</button>}
        </div>
      </form>
    </div>
  );
}
