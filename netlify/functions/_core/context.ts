// Request context and structured logs. Every function call gets a request id (from the browser's
// x-request-id header, or a new one), and every log line, usage row, job and error carries it, so one
// learner's problem can be followed from the browser through the function into the Claude call.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Ctx { requestId: string; fn: string; userId?: string; db?: SupabaseClient; feature?: string }
const store = new AsyncLocalStorage<Ctx>();

export const ctx = (): Ctx | undefined => store.getStore();

/** Run `work` with a request context. The id comes from the browser when it sent a sane one. */
export function withRequest<T>(req: Request | null, fn: string, work: (c: Ctx) => Promise<T>): Promise<T> {
  const given = req?.headers.get("x-request-id") ?? "";
  const requestId = /^[A-Za-z0-9-]{8,64}$/.test(given) ? given : randomUUID();
  const c: Ctx = { requestId, fn };
  return store.run(c, () => work(c));
}

/** Tag work with the feature that is spending tokens (lesson_body, grade, chat...). */
export function asFeature<T>(feature: string, work: () => Promise<T>): Promise<T> {
  const parent = store.getStore();
  return parent ? store.run({ ...parent, feature }, work) : work();
}

type Level = "debug" | "info" | "warn" | "error";
/** One JSON line per event: Netlify's log viewer and any log drain can filter on the fields. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (process.env.VITEST && level !== "error") return; // keep test output readable
  const c = store.getStore();
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, fn: c?.fn, requestId: c?.requestId, userId: c?.userId, ...fields });
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.log(line);
}
