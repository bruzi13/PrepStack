// React context for the app's services and the signed-in learner's session.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { SignedInUser } from "@/data/AuthService";
import type { ProfileChanges } from "@/data/repositories/ProfileRepository";
import type { LearnerProfile } from "@/domain/LearnerProfile";
import type { AppServices } from "./AppServices";

export interface Session {
  user: SignedInUser | null;
  profile: LearnerProfile | null;
  /** False until we know who is signed in and, if someone is, their profile has loaded. */
  ready: boolean;
  error: string;
  saveProfile: (changes: ProfileChanges) => Promise<LearnerProfile>;
}

/** Inside signed-in pages the user and profile always exist. */
export interface LearnerSession extends Session { user: SignedInUser; profile: LearnerProfile }

const ServicesContext = createContext<AppServices | null>(null);
const SessionContext = createContext<Session | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside AppProvider");
  return services;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside AppProvider");
  return session;
}

export function useLearner(): LearnerSession {
  return useSession() as LearnerSession;
}

export function AppProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // Whose profile is loaded. Until it matches the signed-in user we are still loading, so a learner who already
  // answered the questionnaire is never sent back to it while their profile is on its way.
  const [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ready = authChecked && (!user || profileLoadedFor === user.id);

  useEffect(() => {
    let mounted = true;
    services.auth.currentUser().then((current) => { if (mounted) { setUser(current); setAuthChecked(true); } });
    const stopListening = services.auth.onChange((changed) => setUser((previous) => (previous?.id === changed?.id ? previous : changed)));
    return () => { mounted = false; stopListening(); };
  }, [services]);

  useEffect(() => {
    if (!user) { setProfile(null); setProfileLoadedFor(null); return; }
    let mounted = true;
    services.profiles.findForUser(user.id)
      .then((loaded) => { if (mounted) { setProfile(loaded); setError(""); } })
      .catch((failure: Error) => mounted && setError(failure.message))
      .finally(() => mounted && setProfileLoadedFor(user.id));
    return () => { mounted = false; };
  }, [services, user]);

  const saveProfile = useCallback(async (changes: ProfileChanges) => {
    if (!user) throw new Error("לא מחוברים");
    const saved = await services.profiles.save(user, profile, changes);
    setProfile(saved);
    return saved;
  }, [services, user, profile]);

  return (
    <ServicesContext.Provider value={services}>
      <SessionContext.Provider value={{ user, profile, ready, error, saveProfile }}>{children}</SessionContext.Provider>
    </ServicesContext.Provider>
  );
}
