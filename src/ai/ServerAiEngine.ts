// The real AI engine: Netlify functions. A job is started with an id the browser generates; the server creates
// the job row, and the browser watches that row until the result is there.
import type { AuthService } from "@/data/AuthService";
import type { Database } from "@/data/Database";
import { newRequestId, supportCode, type AiEngine, type ChatRequest, type JobArgs, type JobKind, type JobResult } from "./AiEngine";

const FUNCTIONS_PATH = "/.netlify/functions";
const POLL_INTERVAL_MS = 2500;
const JOB_TIMEOUT_MS = 9 * 60_000;
/** No job row after this long means the server refused the request before creating it. */
const NOT_ACCEPTED_AFTER_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface JobRow { status: "running" | "done" | "error"; result: unknown; error: string | null }

export class ServerAiEngine implements AiEngine {
  constructor(private readonly auth: AuthService, private readonly database: Database) {}

  private async headers(requestId: string): Promise<Record<string, string>> {
    return { "content-type": "application/json", authorization: `Bearer ${await this.auth.accessToken()}`, "x-request-id": requestId };
  }

  async runJob<K extends JobKind>(kind: K, args: JobArgs<K>): Promise<JobResult<K>> {
    const jobId = crypto.randomUUID(), requestId = newRequestId();
    const response = await fetch(`${FUNCTIONS_PATH}/ai-job-background`, {
      method: "POST", headers: await this.headers(requestId), body: JSON.stringify({ jobId, kind, args }),
    });
    if (!response.ok && response.status !== 202) throw new Error("שרת ה-AI לא זמין כרגע. נסו שוב בעוד רגע.");

    const startedAt = Date.now();
    while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const [job] = await this.database.select<JobRow>("prep_jobs", { where: { id: jobId }, limit: 1 }).catch(() => []);
      if (job?.status === "done") return job.result as JobResult<K>;
      if (job?.status === "error") throw new Error(job.error || "הבקשה נכשלה. נסו שוב.");
      if (!job && Date.now() - startedAt > NOT_ACCEPTED_AFTER_MS) throw new Error(`הבקשה לא התקבלה בשרת. נסו שוב. (קוד: ${supportCode(requestId)})`);
    }
    throw new Error("הבקשה לקחה יותר מדי זמן. נסו שוב.");
  }

  async chat(request: ChatRequest, onText: (textSoFar: string) => void): Promise<string> {
    const response = await fetch(`${FUNCTIONS_PATH}/chat`, { method: "POST", headers: await this.headers(newRequestId()), body: JSON.stringify(request) });
    if (!response.ok || !response.body) {
      const failure = await response.json().catch(() => null);
      throw new Error(failure?.error || "אין חיבור למראיין כרגע. נסו שוב.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onText(text);
    }
    return text;
  }
}
