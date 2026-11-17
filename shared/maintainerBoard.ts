// The maintainer board's data contract, shared by the admin function (which builds it) and the board page
// (which shows it), so the two can never drift apart.

export interface NamedAmount { name: string; value: number }

export interface DailyCost { day: string; usd: number }

export interface TemplateUsage {
  id: string; topicKey: string; format: string; levelBand: string; variant: string; uses: number; status: string;
}

export interface FailedJob { kind: string; error: string; createdAt: string; requestId: string | null }

export interface ErrorEvent { source: "web" | "server" | string; event: string; message: string; createdAt: string; requestId: string | null }

export interface PendingTopicRequest {
  id: string; request: string; title: string | null; description: string | null; kind: string | null; createdAt: string;
}

export interface MaintainerBoardStats {
  generatedAt: string;
  isDemo?: boolean;
  users: { total: number; newThisWeek: number; activeThisWeek: number; maintainers: number };
  cost: {
    today: number; last7Days: number; last30Days: number;
    byDay: DailyCost[]; byFeature: NamedAmount[]; byModel: NamedAmount[]; topUsers: NamedAmount[];
    tokens30Days: { input: number; output: number; cacheRead: number };
  };
  lessons: {
    createdThisWeek: number; servedFromCacheThisWeek: number;
    templatesReady: number; templatesStale: number; templatesGenerating: number; activeBankTests: number;
    topTemplates: TemplateUsage[];
  };
  jobs: { totalThisWeek: number; failedThisWeek: number; byKind: NamedAmount[]; recentFailures: FailedJob[] };
  errors: ErrorEvent[];
  pendingTopicRequests: PendingTopicRequest[];
  cacheRolloutPercent: number;
}

export type MaintainerAction =
  | { action: "set_rollout"; percent: number }
  | { action: "review_request"; requestId: string; decision: "approve" | "reject"; title?: string; description?: string }
  | { action: "mark_stale"; templateId: string };
