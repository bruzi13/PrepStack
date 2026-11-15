// Talking to the AI engine. Long work (plans, lessons, grading) runs as a background job on the server:
// we queue a row, kick the function, and watch the row. Chat turns stream directly.
import { auth, db, DEMO, sb } from "@/services/store";
import { mockChat, mockJob } from "@/services/demo";

const FN = "/.netlify/functions";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runJob<T>(kind: string, input: Record<string, unknown>, userId: string): Promise<T> {
  if (DEMO) { await sleep(900); return mockJob(kind, input) as T; }
  const [job] = await db.insert<{ id: string }>("prep_jobs", { user_id: userId, kind, input, status: "queued" });
  const res = await fetch(`${FN}/ai-job-background`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await auth.token()}` },
    body: JSON.stringify({ jobId: job.id }),
  });
  if (!res.ok && res.status !== 202) throw new Error("שרת ה-AI לא זמין כרגע. נסו שוב בעוד רגע.");
  const started = Date.now();
  while (Date.now() - started < 8 * 60_000) {
    await sleep(2500);
    const { data } = await sb!.from("prep_jobs").select("status,result,error").eq("id", job.id).maybeSingle();
    if (data?.status === "done") return data.result as T;
    if (data?.status === "error") throw new Error(data.error || "הבקשה נכשלה. נסו שוב.");
  }
  throw new Error("הבקשה לקחה יותר מדי זמן. נסו שוב.");
}

/** One streamed chat turn. Calls onText with the full text so far; resolves with the final text. */
export async function chat(body: Record<string, unknown>, onText: (full: string) => void): Promise<string> {
  if (DEMO) return mockChat(body, onText);
  const res = await fetch(`${FN}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await auth.token()}` },
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
