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

const truncate = (value: unknown, maxLength: number) => (typeof value === "string" ? value.slice(0, maxLength) : undefined);

/** Record an unexpected server error. Never throws: monitoring must not take the request down with it. */
export async function report(err: unknown, event: string, detail: Record<string, unknown> = {}, db?: SupabaseClient) {
  const context = ctx();
  const error = err instanceof Error ? err : new Error(String(err));
  log("error", event, { message: error.message, ...detail });
  const client = db ?? context?.db;
  if (!client) return;
  try {
    await client.from("ops_events").insert({
      level: "error", source: "server", event, message: truncate(error.message, 500),
      detail: { ...detail, stack: truncate(error.stack, 2000), fn: context?.fn }, user_id: context?.userId ?? null, request_id: context?.requestId ?? null,
    });
  } catch { /* the log line above is the fallback */ }
}

/** What the learner sees when something unexpected failed: no internals, the request id for support. */
export const publicMessage = (err: unknown) =>
  err instanceof UserError ? err.message : `משהו השתבש אצלנו. נסו שוב. (קוד: ${ctx()?.requestId?.slice(0, 8) ?? "?"})`;
