import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../../../shared/config";

const URL_ = SUPABASE_URL;

/** Server-side Supabase client with the service role key: bypasses Row Level Security, never sent to the browser. */
export function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !key) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY (set it in Netlify environment variables)");
  return createClient(URL_, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Who is calling? Checks the Supabase session token the site sends. */
export async function userFrom(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** Stops one account from running up the AI bill: a cap on AI requests per day. */
export async function underDailyLimit(db: SupabaseClient, userId: string): Promise<boolean> {
  const limit = Number(process.env.AI_DAILY_LIMIT || 60);
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("prep_jobs").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since.toISOString());
  return (count ?? 0) <= limit;
}

export const jsonLegacy = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
