// Talking to the AI engine. Long work (plans, lessons, grading) runs as a background job on the server:
// we queue a row, kick the function, and watch the row. Chat turns stream directly.
import { auth, DEMO, sb } from "@/services/store";
import { mockAdmin, mockChat, mockJob } from "@/services/demo";

const FN = "/.netlify/functions";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A request id per call, sent as x-request-id: the server logs it on every line, usage row and error. */
export const newRequestId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function headers(requestId: string) {
  return { "content-type": "application/json", authorization: `Bearer ${await auth.token()}`, "x-request-id": requestId };
}

/** Run a long AI job. The browser sends only ids and choices; the server builds the model input itself. */
export async function runJob<T>(kind: string, args: Record<string, unknown>, userId: string): Promise<T> {
  if (DEMO) { await sleep(900); return mockJob(kind, args, userId) as T; }
  const jobId = crypto.randomUUID(), requestId = newRequestId();
  const res = await fetch(`${FN}/ai-job-background`, { method: "POST", headers: await headers(requestId), body: JSON.stringify({ jobId, kind, args }) });
  if (!res.ok && res.status !== 202) throw new Error("שרת ה-AI לא זמין כרגע. נסו שוב בעוד רגע.");
  const started = Date.now();
  while (Date.now() - started < 9 * 60_000) {
    await sleep(2500);
    const { data } = await sb!.from("prep_jobs").select("status,result,error").eq("id", jobId).maybeSingle();
    if (data?.status === "done") return data.result as T;
    if (data?.status === "error") throw new Error(data.error || "הבקשה נכשלה. נסו שוב.");
    // No row after a while means the server refused the request before creating it.
    if (!data && Date.now() - started > 30_000) throw new Error(`הבקשה לא התקבלה בשרת. נסו שוב. (קוד: ${requestId.slice(0, 8)})`);
  }
  throw new Error("הבקשה לקחה יותר מדי זמן. נסו שוב.");
}

/** The maintainer board's API. */
export async function adminApi<T>(body?: Record<string, unknown>): Promise<T> {
  if (DEMO) return mockAdmin() as T;
  const requestId = newRequestId();
  const res = await fetch(`${FN}/admin`, body ? { method: "POST", headers: await headers(requestId), body: JSON.stringify(body) } : { headers: await headers(requestId) });
  if (!res.ok) throw new Error(res.status === 403 ? "אין לך הרשאת תחזוקה." : `טעינת לוח התחזוקה נכשלה (קוד: ${requestId.slice(0, 8)}).`);
  return res.json() as Promise<T>;
}

/** One streamed chat turn. Calls onText with the full text so far; resolves with the final text. */
export async function chat(body: Record<string, unknown>, onText: (full: string) => void): Promise<string> {
  if (DEMO) return mockChat(body, onText);
  const res = await fetch(`${FN}/chat`, {
    method: "POST",
    headers: await headers(newRequestId()),
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "אין חיבור למראיין כרגע. נסו שוב.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onText(full);
  }
  return full;
}

export interface Prior { format: string; topic_kind: string; n: number; avg_score: number }
export async function formatPriors(): Promise<Prior[]> {
  if (DEMO) return [];
  const { data } = await sb!.rpc("prep_format_priors");
  return (data ?? []) as Prior[];
}
