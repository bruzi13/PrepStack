// Data access. Real mode talks to Supabase (same project as Amirnet, tables prefixed prep_).
// Demo mode (npm run demo) keeps everything in this browser so the site can be tried without a backend.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@shared/config";

export const DEMO = import.meta.env.VITE_DEMO === "1";
export const sb: SupabaseClient | null = DEMO ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "prepstack-auth" },
});

export interface User { id: string; email: string; name: string }
type Query = { eq?: Record<string, unknown>; order?: string; asc?: boolean; limit?: number };
type Row = Record<string, any>;

/* ---------------- demo storage ---------------- */
const lsGet = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const demoRows = (t: string) => lsGet<Row[]>(`prep-demo:${t}`, []);
const uuid = () => crypto.randomUUID();
let demoListeners: ((u: User | null) => void)[] = [];

/* ---------------- auth ---------------- */
const toUser = (u: { id: string; email?: string; user_metadata?: Row } | null | undefined): User | null =>
  u ? { id: u.id, email: u.email ?? "", name: u.user_metadata?.name || (u.email ?? "").split("@")[0] } : null;

export const auth = {
  async current(): Promise<User | null> {
    if (DEMO) return lsGet<User | null>("prep-demo:user", null);
    const { data } = await sb!.auth.getSession();
    return toUser(data.session?.user);
  },
  onChange(cb: (u: User | null) => void): () => void {
    if (DEMO) { demoListeners.push(cb); return () => { demoListeners = demoListeners.filter((x) => x !== cb); }; }
    const { data } = sb!.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)));
    return () => data.subscription.unsubscribe();
  },
  async signUp(email: string, password: string, name: string): Promise<string | null> {
    if (DEMO) return this.signIn(email, password, name);
    const { data, error } = await sb!.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return heb(error.message);
    return data.session ? null : "נשלח אליכם מייל אימות. אשרו אותו ואז התחברו.";
  },
  async signIn(email: string, password: string, name = ""): Promise<string | null> {
    if (DEMO) {
      const u = { id: "demo-user", email, name: name || email.split("@")[0] };
      lsSet("prep-demo:user", u); demoListeners.forEach((l) => l(u)); return null;
    }
    const { error } = await sb!.auth.signInWithPassword({ email, password });
    return error ? heb(error.message) : null;
  },
  async reset(email: string): Promise<string | null> {
    if (DEMO) return null;
    const { error } = await sb!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings` });
    return error ? heb(error.message) : null;
  },
  async setPassword(password: string): Promise<string | null> {
    if (DEMO) return null;
    const { error } = await sb!.auth.updateUser({ password });
    return error ? heb(error.message) : null;
  },
  async signOut() {
    if (DEMO) { localStorage.removeItem("prep-demo:user"); demoListeners.forEach((l) => l(null)); return; }
    await sb!.auth.signOut();
  },
  async token(): Promise<string> {
    if (DEMO) return "demo";
    const { data } = await sb!.auth.getSession();
    return data.session?.access_token ?? "";
  },
};

function heb(msg: string): string {
  if (/invalid login/i.test(msg)) return "אימייל או סיסמה שגויים.";
  if (/already registered/i.test(msg)) return "כבר יש חשבון עם האימייל הזה. נסו להתחבר.";
  if (/at least 6/i.test(msg)) return "הסיסמה צריכה להיות באורך 6 תווים לפחות.";
  if (/not confirmed/i.test(msg)) return "צריך לאשר את האימייל לפני ההתחברות.";
  if (/fetch|network/i.test(msg)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  return msg;
}

/* ---------------- tables ---------------- */
export const db = {
  async list<T = Row>(table: string, q: Query = {}): Promise<T[]> {
    if (DEMO) {
      let rows = demoRows(table).filter((r) => Object.entries(q.eq ?? {}).every(([k, v]) => r[k] === v));
      if (q.order) rows = rows.sort((a, b) => (a[q.order!] > b[q.order!] ? 1 : a[q.order!] < b[q.order!] ? -1 : 0) * (q.asc === false ? -1 : 1));
      return (q.limit ? rows.slice(0, q.limit) : rows) as T[];
    }
    let s = sb!.from(table).select("*");
    for (const [k, v] of Object.entries(q.eq ?? {})) s = s.eq(k, v as never);
    if (q.order) s = s.order(q.order, { ascending: q.asc !== false });
    if (q.limit) s = s.limit(q.limit);
    const { data, error } = await s;
    if (error) throw new Error(dbErr(error.message));
    return (data ?? []) as T[];
  },
  async insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    if (DEMO) {
      const now = new Date().toISOString();
      const full = list.map((r) => ({ id: uuid(), created_at: now, ...r }));
      lsSet(`prep-demo:${table}`, [...demoRows(table), ...full]);
      return full as T[];
    }
    const { data, error } = await sb!.from(table).insert(list).select();
    if (error) throw new Error(dbErr(error.message));
    return (data ?? []) as T[];
  },
  async upsert<T = Row>(table: string, row: Row): Promise<T> {
    if (DEMO) {
      const rows = demoRows(table); const i = rows.findIndex((r) => r.id === row.id);
      const full = { created_at: new Date().toISOString(), ...(i >= 0 ? rows[i] : {}), ...row };
      if (i >= 0) rows[i] = full; else rows.push(full);
      lsSet(`prep-demo:${table}`, rows); return full as T;
    }
    const { data, error } = await sb!.from(table).upsert(row).select().single();
    if (error) throw new Error(dbErr(error.message));
    return data as T;
  },
  async update(table: string, id: string, patch: Row): Promise<void> {
    if (DEMO) { lsSet(`prep-demo:${table}`, demoRows(table).map((r) => (r.id === id ? { ...r, ...patch } : r))); return; }
    const { error } = await sb!.from(table).update(patch).eq("id", id);
    if (error) throw new Error(dbErr(error.message));
  },
  async remove(table: string, eq: Record<string, unknown>): Promise<void> {
    if (DEMO) { lsSet(`prep-demo:${table}`, demoRows(table).filter((r) => !Object.entries(eq).every(([k, v]) => r[k] === v))); return; }
    let s = sb!.from(table).delete();
    for (const [k, v] of Object.entries(eq)) s = s.eq(k, v as never);
    const { error } = await s;
    if (error) throw new Error(dbErr(error.message));
  },
};

function dbErr(msg: string): string {
  if (/does not exist|schema cache/i.test(msg)) return "טבלאות האתר עדיין לא הוקמו בדאטהבייס (צריך להריץ את supabase/schema.sql).";
  if (/fetch|network/i.test(msg)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  return msg;
}
