// The maintainer board's server API, and a demo stand-in with clearly sample numbers.
import type { MaintainerAction, MaintainerBoardStats } from "@shared/maintainerBoard";
import { newRequestId, supportCode } from "@/ai/AiEngine";
import type { AuthService } from "./AuthService";

export interface MaintainerBoardApi {
  loadStats(): Promise<MaintainerBoardStats>;
  perform(action: MaintainerAction): Promise<void>;
}

export class ServerMaintainerBoardApi implements MaintainerBoardApi {
  private static readonly ENDPOINT = "/.netlify/functions/admin";

  constructor(private readonly auth: AuthService) {}

  private async request(init: RequestInit = {}): Promise<Response> {
    const requestId = newRequestId();
    const response = await fetch(ServerMaintainerBoardApi.ENDPOINT, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${await this.auth.accessToken()}`, "x-request-id": requestId },
    });
    if (!response.ok) {
      throw new Error(response.status === 403 ? "אין לך הרשאת תחזוקה." : `טעינת לוח התחזוקה נכשלה (קוד: ${supportCode(requestId)}).`);
    }
    return response;
  }

  async loadStats(): Promise<MaintainerBoardStats> {
    return (await this.request()).json() as Promise<MaintainerBoardStats>;
  }

  async perform(action: MaintainerAction): Promise<void> {
    await this.request({ method: "POST", body: JSON.stringify(action) });
  }
}

export class DemoMaintainerBoardApi implements MaintainerBoardApi {
  async perform(): Promise<void> { /* demo mode: nothing to change */ }

  async loadStats(): Promise<MaintainerBoardStats> {
    const now = new Date();
    const byDay = Array.from({ length: 30 }, (_, index) => ({
      day: new Date(now.getTime() - (29 - index) * 86_400_000).toISOString().slice(0, 10),
      usd: +(0.4 + ((index * 37) % 11) / 10 + (index > 22 ? 0.8 : 0)).toFixed(2),
    }));
    const last30Days = byDay.reduce((sum, day) => sum + day.usd, 0);
    const share = (name: string, fraction: number) => ({ name, value: last30Days * fraction });
    return {
      generatedAt: now.toISOString(), isDemo: true,
      users: { total: 128, newThisWeek: 14, activeThisWeek: 37, maintainers: 1 },
      cost: {
        today: byDay[29].usd, last7Days: byDay.slice(-7).reduce((sum, day) => sum + day.usd, 0), last30Days, byDay,
        byFeature: [share("lesson_body", 0.38), share("lesson_test", 0.2), share("grade", 0.17), share("chat_interview", 0.14), share("plan", 0.08), share("personal_note", 0.03)],
        byModel: [share("claude-sonnet-5-5", 0.86), share("claude-haiku-5-5", 0.14)],
        topUsers: [{ name: "נועה", value: 3.1 }, { name: "דניאל", value: 2.4 }, { name: "מאיה", value: 1.9 }],
        tokens30Days: { input: 18_400_000, output: 3_900_000, cacheRead: 6_200_000 },
      },
      lessons: {
        createdThisWeek: 212, servedFromCacheThisWeek: 23, templatesReady: 41, templatesStale: 2, templatesGenerating: 1, activeBankTests: 171,
        topTemplates: [{ id: "00000000-0000-4000-8000-000000000001", topicKey: "caching-ו-cdn", format: "worked_examples", levelBand: "mid", variant: "full", uses: 19, status: "ready" }],
      },
      jobs: {
        totalThisWeek: 498, failedThisWeek: 6,
        byKind: [{ name: "lesson", value: 212 }, { name: "complete", value: 188 }, { name: "debrief", value: 41 }],
        recentFailures: [{ kind: "lesson", error: "משהו השתבש אצלנו. נסו שוב.", createdAt: now.toISOString(), requestId: "demo-1234" }],
      },
      errors: [{ source: "web", event: "web.error", message: "TypeError: Cannot read properties of undefined (reading 'map')", createdAt: now.toISOString(), requestId: "demo-5678" }],
      pendingTopicRequests: [{
        id: "00000000-0000-4000-8000-000000000002", request: "אני רוצה ללמוד OpenTelemetry לעומק", title: "OpenTelemetry: traces, metrics ו-logs",
        description: "לדעת להוסיף tracing לשירות ולקרוא אותו", kind: "practical", createdAt: now.toISOString(),
      }],
      cacheRolloutPercent: 10,
    };
  }
}
