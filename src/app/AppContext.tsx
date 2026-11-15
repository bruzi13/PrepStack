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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    auth.current().then((u) => { if (alive) { setUser(u); if (!u) setReady(true); } });
    const off = auth.onChange((u) => setUser((prev) => (prev?.id === u?.id ? prev : u)));
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let alive = true;
    setReady(false);
    db.list<Profile>("prep_profiles", { eq: { id: user.id } })
      .then((rows) => { if (alive) { setProfile(rows[0] ?? null); setError(""); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setReady(true));
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
