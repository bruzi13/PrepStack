import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "@/app/AppContext";
import { DEMO } from "@/services/store";
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

const NAV: [string, string, IconName][] = [
  ["/", "לוח בקרה", "dashboard"], ["/plan", "התוכנית שלי", "map"], ["/ai", "AI ואייג'נטים", "spark"],
  ["/interviews", "סימולציות ראיון", "mic"], ["/jd", "התאמה למשרה", "target"], ["/insights", "תובנות", "flask"], ["/settings", "הגדרות", "gear"],
];

export default function App() {
  const { user, profile, ready, error } = useApp();
  const loc = useLocation();
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

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="brand-mark" aria-hidden />Prep<span>Stack</span></div>
        <nav aria-label="ניווט ראשי">{NAV.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon name={icon} />{label}</NavLink>)}</nav>
        {DEMO && <div className="demo-tag"><b>מצב הדגמה</b>התוכן לדוגמה והנתונים נשמרים בדפדפן בלבד</div>}
        <div className="side-user"><span className="avatar" aria-hidden>{(profile?.display_name || "?").trim().charAt(0)}</span><span>{profile?.display_name}</span></div>
      </aside>
      <main className="main">
        <Suspense fallback={<Busy label="טוען…" />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plan" element={<PlanPage track="main" key="main" />} />
            <Route path="/ai" element={<PlanPage track="ai" key="ai" />} />
            <Route path="/lesson/:topicId" element={<LessonPage />} />
            <Route path="/interviews" element={<Interviews />} />
            <Route path="/interview/:id" element={<InterviewRoom />} />
            <Route path="/jd" element={<JobMatch />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
