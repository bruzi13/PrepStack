import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db, type User } from "@/services/store";
import type { Profile } from "@/types";

interface Ctx {
  user: User | null; profile: Profile | null; ready: boolean; error: string;
  saveProfile: (patch: Partial<Profile>) => Promise<Profile>;
}
const C = createContext<Ctx>(null as never);
export const useApp = () => useContext(C);
/** Inside signed-in pages the user and profile always exist. */
export const useMe = () => { const c = useContext(C); return { ...c, user: c.user!, profile: c.profile! }; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // Whose profile is loaded. Until it matches the signed-in user we are still loading, so a user who
  // already answered the questionnaire is never sent back to it while their profile is on its way.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ready = authChecked && (!user || loadedFor === user.id);

  useEffect(() => {
    let alive = true;
    auth.current().then((u) => { if (alive) { setUser(u); setAuthChecked(true); } });
    const off = auth.onChange((u) => setUser((prev) => (prev?.id === u?.id ? prev : u)));
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); setLoadedFor(null); return; }
    let alive = true;
    db.list<Profile>("prep_profiles", { eq: { id: user.id } })
      .then((rows) => { if (alive) { setProfile(rows[0] ?? null); setError(""); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoadedFor(user.id));
    return () => { alive = false; };
  }, [user]);

  const saveProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!user) throw new Error("לא מחוברים");
    const next = await db.upsert<Profile>("prep_profiles", {
      id: user.id, user_id: user.id, display_name: profile?.display_name ?? user.name, role_key: profile?.role_key ?? null,
      answers: profile?.answers ?? {}, ...patch, updated_at: new Date().toISOString(),
    });
    setProfile(next);
    return next;
  }, [user, profile]);

  return <C.Provider value={{ user, profile, ready, error, saveProfile }}>{children}</C.Provider>;
}
