import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useServices, useSession } from "@/app/AppContext";
import { ErrorMessage, Loading } from "@/components/ui";
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

// The heavy screens (code editor, architecture canvas, charts) load only when opened.
const LessonPage = lazy(() => import("@/features/lessons/LessonPage"));
const InterviewRoom = lazy(() => import("@/features/interviews/InterviewRoom"));
const AdminPage = lazy(() => import("@/features/admin/AdminPage"));

interface NavDestination { path: string; label: string; icon: IconName }

const DESTINATIONS: NavDestination[] = [
  { path: "/", label: "היום", icon: "dashboard" },
  { path: "/plan", label: "תוכנית", icon: "map" },
  { path: "/interviews", label: "ראיונות", icon: "mic" },
  { path: "/jd", label: "התאמה למשרה", icon: "target" },
  { path: "/insights", label: "תובנות", icon: "flask" },
  { path: "/settings", label: "הגדרות", icon: "gear" },
];
/** On phones the first three sit in the bottom bar; the rest open from "More". */
const TAB_BAR_DESTINATIONS = DESTINATIONS.slice(0, 3);
const MORE_DESTINATIONS = DESTINATIONS.slice(3);

/** Maintainers see the board link (null while checking). The server checks again on every board request. */
function useIsMaintainer(userId?: string): boolean | null {
  const { maintainers } = useServices();
  const [isMaintainer, setIsMaintainer] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    maintainers.isMaintainer(userId).then((result) => mounted && setIsMaintainer(result));
    return () => { mounted = false; };
  }, [maintainers, userId]);
  return isMaintainer;
}

/** Plan screen with its two tracks as tabs; the track lives in the URL so it can be linked and survives reload. */
function PlanTabs() {
  const [searchParams] = useSearchParams();
  const track = searchParams.get("track") === "ai" ? "ai" : "main";
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

function UserBadge({ name, initial }: { name: string; initial: string }) {
  return <div className="side-user"><span className="avatar" aria-hidden>{initial}</span><span>{name}</span></div>;
}

/** Phone navigation: a bottom bar for the three main places, and "More" opening a modal drawer with the rest. */
function PhoneNavigation({ name, initial, isMaintainer }: { name: string; initial: string; isMaintainer: boolean }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => { drawer.current?.close(); }, [location.pathname, location.search]);

  const moreIsActive = MORE_DESTINATIONS.some(({ path }) => location.pathname.startsWith(path)) || location.pathname.startsWith("/admin");
  const openDrawer = () => { drawer.current?.showModal(); moreButton.current?.setAttribute("aria-expanded", "true"); };
  const onDrawerClosed = () => {
    moreButton.current?.setAttribute("aria-expanded", "false");
    // Return focus to "More" unless the learner already moved it elsewhere (for example by following a link).
    if (drawer.current?.contains(document.activeElement) || document.activeElement === document.body) moreButton.current?.focus();
  };

  return (
    <>
      <nav className="tabbar" aria-label="ניווט ראשי">
        {TAB_BAR_DESTINATIONS.map(({ path, label, icon }) => <NavLink key={path} to={path} end={path === "/"}><Icon name={icon} size={22} />{label}</NavLink>)}
        <button ref={moreButton} type="button" className={moreIsActive ? "active" : ""} aria-haspopup="dialog" aria-expanded="false" aria-controls="more-nav" onClick={openDrawer}>
          <Icon name="menu" size={22} />עוד
        </button>
      </nav>
      <dialog ref={drawer} id="more-nav" className="drawer" aria-label="עוד יעדים" onClose={onDrawerClosed}
        onClick={(event) => { if (event.target === drawer.current) drawer.current?.close(); }}>
        <div className="drawer-sheet">
          <div className="drawer-head">
            <span className="brand"><span className="brand-mark" aria-hidden />PrepStack</span>
            <button type="button" className="btn ghost" autoFocus onClick={() => drawer.current?.close()} aria-label="סגירה"><Icon name="close" size={20} /></button>
          </div>
          <nav aria-label="עוד">
            {MORE_DESTINATIONS.map(({ path, label, icon }) => <NavLink key={path} to={path}><Icon name={icon} />{label}</NavLink>)}
            {isMaintainer && <NavLink to="/admin"><Icon name="chart" />תחזוקה</NavLink>}
          </nav>
          <UserBadge name={name} initial={initial} />
        </div>
      </dialog>
    </>
  );
}

export default function App() {
  const { isDemo } = useServices();
  const { user, profile, ready, error } = useSession();
  const location = useLocation();
  const maintainerCheck = useIsMaintainer(user?.id);
  const isMaintainer = maintainerCheck === true;
  if (!ready) return <div className="center"><Loading label="טוען…" /></div>;

  if (!user) return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
  if (error) return <div className="center"><ErrorMessage message={error} onRetry={() => window.location.reload()} /></div>;
  const onboarded = !!profile?.isOnboarded;
  if (location.pathname === "/onboarding") return onboarded ? <Navigate to="/" replace /> : <Onboarding />;
  if (!onboarded) return <Navigate to="/onboarding" replace />;

  const name = profile.displayName, initial = profile.initial;
  const inInterviewRoom = location.pathname.startsWith("/interview/");
  return (
    <div className={`shell${inInterviewRoom ? " shell--focus" : ""}`}>
      <a className="skip" href="#main">דלגו לתוכן</a>
      <aside className="side">
        <div className="brand"><span className="brand-mark" aria-hidden />PrepStack</div>
        <nav aria-label="ניווט ראשי" className="side-nav">
          {DESTINATIONS.map(({ path, label, icon }) => <NavLink key={path} to={path} end={path === "/"}><Icon name={icon} />{label}</NavLink>)}
          {isMaintainer && <NavLink to="/admin" className="nav-admin"><Icon name="chart" />תחזוקה</NavLink>}
        </nav>
        {isDemo && <div className="demo-tag"><b>מצב הדגמה</b>התוכן לדוגמה והנתונים נשמרים בדפדפן בלבד</div>}
        <UserBadge name={name} initial={initial} />
      </aside>
      <main className="main" id="main" tabIndex={-1}>
        <Suspense fallback={<Loading label="טוען…" />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plan" element={<PlanTabs />} />
            <Route path="/ai" element={<Navigate to="/plan?track=ai" replace />} />
            <Route path="/lesson/:topicId" element={<LessonPage />} />
            <Route path="/interviews" element={<Interviews />} />
            <Route path="/interview/:interviewId" element={<InterviewRoom />} />
            <Route path="/jd" element={<JobMatch />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={maintainerCheck === null ? <Loading label="טוען…" /> : isMaintainer ? <AdminPage /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <PhoneNavigation name={name} initial={initial} isMaintainer={isMaintainer} />
    </div>
  );
}
