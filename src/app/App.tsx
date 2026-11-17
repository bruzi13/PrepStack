import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useApp } from "@/app/AppContext";
import { db, DEMO } from "@/services/store";
import { Busy, ErrorBox } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import Landing from "@/features/auth/Landing";
import AuthPage from "@/features/auth/AuthPage";
import Onboarding from "@/features/onboarding/Onboarding";
import Dashboard from "@/features/dashboard/Dashboard";
import PlanPage from "@/features/plan/PlanPage";
import Interviews from "@/features/interviews/Interviews";
import Insights from "@/features/insights/Insights";
import JobMatch from "@/features/job-match/JobMatch";
import Settings from "@/features/settings/Settings";

// The heavy screens (code editor, architecture canvas) load only when opened.
const LessonPage = lazy(() => import("@/features/lessons/LessonPage"));
const InterviewRoom = lazy(() => import("@/features/interviews/InterviewRoom"));
const AdminPage = lazy(() => import("@/features/admin/AdminPage"));

/** Maintainers see the board link. The server checks again on every board request. */
function useMaintainer(userId?: string) {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    if (!userId) return;
    if (DEMO) { setYes(true); return; }
    db.list("prep_maintainers", { eq: { user_id: userId } }).then((r) => setYes(r.length > 0)).catch(() => setYes(false));
  }, [userId]);
  return yes;
}

const NAV: [string, string, IconName][] = [
  ["/", "היום", "dashboard"], ["/plan", "תוכנית", "map"], ["/interviews", "ראיונות", "mic"],
  ["/jd", "התאמה למשרה", "target"], ["/insights", "תובנות", "flask"], ["/settings", "הגדרות", "gear"],
];
const TABS = NAV.slice(0, 3), MORE = NAV.slice(3);

/** Plan screen with its two tracks as tabs; the track lives in the URL so it can be linked and survives reload. */
function PlanTabs() {
  const [params] = useSearchParams();
  const track = params.get("track") === "ai" ? "ai" : "main";
  return (
    <>
      <nav className="track-tabs" aria-label="מסלול">
        <Link to="/plan" aria-current={track === "main" ? "page" : undefined}>התוכנית שלי</Link>
        <Link to="/plan?track=ai" aria-current={track === "ai" ? "page" : undefined}>AI ואייג'נטים</Link>
      </nav>
      <PlanPage track={track} key={track} />
    </>
  );
}

/** Phone navigation: a bottom bar for the three main places, and "More" opening a modal drawer with the rest. */
function PhoneNav({ name, maintainer }: { name: string; maintainer: boolean }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const loc = useLocation();
  useEffect(() => { dlg.current?.close(); }, [loc.pathname, loc.search]);
  const moreActive = MORE.some(([to]) => loc.pathname.startsWith(to)) || loc.pathname.startsWith("/admin");
  const open = () => { dlg.current?.showModal(); btn.current?.setAttribute("aria-expanded", "true"); };
  return (
    <>
      <nav className="tabbar" aria-label="ניווט ראשי">
        {TABS.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon name={icon} size={22} />{label}</NavLink>)}
        <button ref={btn} type="button" className={moreActive ? "active" : ""} aria-haspopup="dialog" aria-expanded="false" aria-controls="more-nav" onClick={open}><Icon name="menu" size={22} />עוד</button>
      </nav>
      <dialog ref={dlg} id="more-nav" className="drawer" aria-label="עוד יעדים"
        onClose={() => { btn.current?.setAttribute("aria-expanded", "false"); if (dlg.current?.contains(document.activeElement) || document.activeElement === document.body) btn.current?.focus(); }}
        onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <div className="drawer-sheet">
          <div className="drawer-head"><span className="brand"><span className="brand-mark" aria-hidden />PrepStack</span>
            <button type="button" className="btn ghost" autoFocus onClick={() => dlg.current?.close()} aria-label="סגירה"><Icon name="close" size={20} /></button></div>
          <nav aria-label="עוד">{MORE.map(([to, label, icon]) => <NavLink key={to} to={to}><Icon name={icon} />{label}</NavLink>)}
            {maintainer && <NavLink to="/admin"><Icon name="chart" />תחזוקה</NavLink>}</nav>
          <div className="side-user"><span className="avatar" aria-hidden>{(name || "?").trim().charAt(0)}</span><span>{name}</span></div>
        </div>
      </dialog>
    </>
  );
}

export default function App() {
  const { user, profile, ready, error } = useApp();
  const loc = useLocation();
  const maintainer = useMaintainer(user?.id);
  if (!ready) return <div className="center"><Busy label="טוען…" /></div>;

  if (!user) return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
  if (error) return <div className="center"><ErrorBox msg={error} retry={() => location.reload()} /></div>;
  if (!profile?.answers?.onboarded && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  if (loc.pathname === "/onboarding") return profile?.answers?.onboarded ? <Navigate to="/" replace /> : <Onboarding />;

  const focus = loc.pathname.startsWith("/interview/");
  return (
    <div className={`shell${focus ? " shell--focus" : ""}`}>
      <a className="skip" href="#main">דלגו לתוכן</a>
      <aside className="side">
        <div className="brand"><span className="brand-mark" aria-hidden />PrepStack</div>
        <nav aria-label="ניווט ראשי" className="side-nav">{NAV.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon name={icon} />{label}</NavLink>)}
          {maintainer && <NavLink to="/admin" className="nav-admin"><Icon name="chart" />תחזוקה</NavLink>}</nav>
        {DEMO && <div className="demo-tag"><b>מצב הדגמה</b>התוכן לדוגמה והנתונים נשמרים בדפדפן בלבד</div>}
        <div className="side-user"><span className="avatar" aria-hidden>{(profile?.display_name || "?").trim().charAt(0)}</span><span>{profile?.display_name}</span></div>
      </aside>
      <main className="main" id="main" tabIndex={-1}>
        <Suspense fallback={<Busy label="טוען…" />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plan" element={<PlanTabs />} />
            <Route path="/ai" element={<Navigate to="/plan?track=ai" replace />} />
            <Route path="/lesson/:topicId" element={<LessonPage />} />
            <Route path="/interviews" element={<Interviews />} />
            <Route path="/interview/:id" element={<InterviewRoom />} />
            <Route path="/jd" element={<JobMatch />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={maintainer ? <AdminPage /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <PhoneNav name={profile?.display_name ?? ""} maintainer={maintainer} />
    </div>
  );
}
