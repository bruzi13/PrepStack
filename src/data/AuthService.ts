// Sign-in and session handling behind one interface: Supabase Auth in production, a fake local user in demo mode.
// Methods that can fail for a reason the learner can fix return that reason as a Hebrew message (null = success).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SignedInUser { id: string; email: string; name: string }
export type AuthListener = (user: SignedInUser | null) => void;

export interface AuthService {
  currentUser(): Promise<SignedInUser | null>;
  /** Returns a function that stops listening. */
  onChange(listener: AuthListener): () => void;
  signUp(email: string, password: string, name: string): Promise<string | null>;
  signIn(email: string, password: string): Promise<string | null>;
  requestPasswordReset(email: string): Promise<string | null>;
  changePassword(password: string): Promise<string | null>;
  signOut(): Promise<void>;
  /** The bearer token the server functions check. */
  accessToken(): Promise<string>;
}

function friendlyAuthError(message: string): string {
  if (/invalid login/i.test(message)) return "אימייל או סיסמה שגויים.";
  if (/already registered/i.test(message)) return "כבר יש חשבון עם האימייל הזה. נסו להתחבר.";
  if (/at least 6/i.test(message)) return "הסיסמה צריכה להיות באורך 6 תווים לפחות.";
  if (/not confirmed/i.test(message)) return "צריך לאשר את האימייל לפני ההתחברות.";
  if (/fetch|network/i.test(message)) return "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.";
  return message;
}

type SupabaseUser = { id: string; email?: string; user_metadata?: Record<string, any> } | null | undefined;

const toSignedInUser = (user: SupabaseUser): SignedInUser | null =>
  user ? { id: user.id, email: user.email ?? "", name: user.user_metadata?.name || (user.email ?? "").split("@")[0] } : null;

export class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async currentUser(): Promise<SignedInUser | null> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return null;
    // The stored session may be stale or belong to another project: confirm it with the auth server.
    const { data: confirmed, error } = await this.client.auth.getUser();
    if (error || !confirmed.user) { await this.client.auth.signOut({ scope: "local" }); return null; }
    return toSignedInUser(confirmed.user);
  }

  onChange(listener: AuthListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(toSignedInUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string, name: string): Promise<string | null> {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return friendlyAuthError(error.message);
    return data.session ? null : "נשלח אליכם מייל אימות. אשרו אותו ואז התחברו.";
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return error ? friendlyAuthError(error.message) : null;
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings` });
    return error ? friendlyAuthError(error.message) : null;
  }

  async changePassword(password: string): Promise<string | null> {
    const { error } = await this.client.auth.updateUser({ password });
    return error ? friendlyAuthError(error.message) : null;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async accessToken(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? "";
  }
}

/** Demo mode: any email and password sign in as one local user. */
export class DemoAuthService implements AuthService {
  static readonly USER_ID = "demo-user";
  private static readonly STORAGE_KEY = "prep-demo:user";
  private listeners: AuthListener[] = [];

  async currentUser(): Promise<SignedInUser | null> {
    try { return JSON.parse(localStorage.getItem(DemoAuthService.STORAGE_KEY) ?? "null") as SignedInUser | null; } catch { return null; }
  }

  onChange(listener: AuthListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((existing) => existing !== listener); };
  }

  private notify(user: SignedInUser | null) {
    for (const listener of this.listeners) listener(user);
  }

  async signUp(email: string, _password: string, name: string): Promise<string | null> {
    const user: SignedInUser = { id: DemoAuthService.USER_ID, email, name: name || email.split("@")[0] };
    try { localStorage.setItem(DemoAuthService.STORAGE_KEY, JSON.stringify(user)); } catch { /* storage blocked */ }
    this.notify(user);
    return null;
  }

  async signIn(email: string, password: string): Promise<string | null> { return this.signUp(email, password, ""); }
  async requestPasswordReset(): Promise<string | null> { return null; }
  async changePassword(): Promise<string | null> { return null; }

  async signOut(): Promise<void> {
    localStorage.removeItem(DemoAuthService.STORAGE_KEY);
    this.notify(null);
  }

  async accessToken(): Promise<string> { return "demo"; }
}
