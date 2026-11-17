// Errors that are safe to show learners, and the server half of error monitoring: unexpected failures are
// logged as JSON and stored in ops_events, where the maintainer board shows them.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ctx, log } from "./context";

/** An expected failure with a message written for the learner (Hebrew) and an HTTP status. */
export class UserError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export const json = (body: unknown, status = 200, requestId?: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(requestId ? { "x-request-id": requestId } : {}) } });

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

/** Record an unexpected server error. Never throws: monitoring must not take the request down with it. */
export async function report(err: unknown, event: string, detail: Record<string, unknown> = {}, db?: SupabaseClient) {
  const c = ctx();
  const e = err instanceof Error ? err : new Error(String(err));
  log("error", event, { message: e.message, ...detail });
  const client = db ?? c?.db;
  if (!client) return;
  try {
    await client.from("ops_events").insert({
      level: "error", source: "server", event, message: clip(e.message, 500),
      detail: { ...detail, stack: clip(e.stack, 2000), fn: c?.fn }, user_id: c?.userId ?? null, request_id: c?.requestId ?? null,
    });
  } catch { /* the log line above is the fallback */ }
}

/** What the learner sees when something unexpected failed: no internals, the request id for support. */
export const publicMessage = (err: unknown) =>
  err instanceof UserError ? err.message : `משהו השתבש אצלנו. נסו שוב. (קוד: ${ctx()?.requestId?.slice(0, 8) ?? "?"})`;
