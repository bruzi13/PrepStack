// Browser half of error monitoring: uncaught errors and rejected promises go to the report-error function and
// appear on the maintainer board next to server errors. At most a few per page load, so a loop that throws
// cannot flood the table. Never throws itself.
import { newRequestId } from "@/ai/AiEngine";
import type { AuthService } from "@/data/AuthService";

export type ErrorSource = "error" | "unhandledrejection" | "react";

export interface ErrorReporter {
  report(source: ErrorSource, error: unknown): Promise<void>;
  /** Listen for uncaught errors on the window. */
  install(): void;
}

abstract class BaseErrorReporter implements ErrorReporter {
  static readonly MAX_REPORTS_PER_PAGE_LOAD = 5;
  private sentCount = 0;

  protected abstract send(body: Record<string, unknown>): Promise<void>;

  async report(source: ErrorSource, error: unknown): Promise<void> {
    if (this.sentCount >= BaseErrorReporter.MAX_REPORTS_PER_PAGE_LOAD) return;
    this.sentCount++;
    const normalized = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error ?? null));
    try {
      await this.send({ kind: source, message: normalized.message.slice(0, 500), stack: normalized.stack?.slice(0, 2000), path: location.pathname.slice(0, 200) });
    } catch { /* monitoring must never break the page */ }
  }

  install(): void {
    addEventListener("error", (event) => { if (event.error) void this.report("error", event.error); });
    addEventListener("unhandledrejection", (event) => void this.report("unhandledrejection", event.reason));
  }
}

export class ServerErrorReporter extends BaseErrorReporter {
  constructor(private readonly auth: AuthService) { super(); }

  protected async send(body: Record<string, unknown>): Promise<void> {
    const token = await this.auth.accessToken().catch(() => "");
    await fetch("/.netlify/functions/report-error", {
      method: "POST", keepalive: true, body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-request-id": newRequestId(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  }
}

/** Demo mode has no server: errors go to the console. */
export class ConsoleErrorReporter extends BaseErrorReporter {
  protected async send(body: Record<string, unknown>): Promise<void> {
    console.warn("[monitor]", body);
  }
}
