// Browser half of error monitoring: uncaught errors and rejected promises are sent to the report-error
// function and appear on the maintainer board next to server errors. At most a few per page load, so a loop
// that throws cannot flood the table. Never throws itself.
import { auth, DEMO } from "@/services/store";
import { newRequestId } from "@/services/ai";

const MAX_PER_LOAD = 5;
let sent = 0;

export async function reportError(kind: "error" | "unhandledrejection" | "react", err: unknown) {
  if (sent >= MAX_PER_LOAD) return;
  sent++;
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? null));
  const body = { kind, message: e.message.slice(0, 500), stack: e.stack?.slice(0, 2000), path: location.pathname.slice(0, 200) };
  if (DEMO) { console.warn("[monitor]", body); return; }
  try {
    const token = await auth.token().catch(() => "");
    await fetch("/.netlify/functions/report-error", {
      method: "POST", keepalive: true,
      headers: { "content-type": "application/json", "x-request-id": newRequestId(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch { /* monitoring must never break the page */ }
}

export function installMonitor() {
  addEventListener("error", (ev) => { if (ev.error) reportError("error", ev.error); });
  addEventListener("unhandledrejection", (ev) => reportError("unhandledrejection", ev.reason));
}
