// Records tokens and cost for every Claude response into ops_ai_usage (for the maintainer cost board).
import { costUsd, PRICES, webSearchUsdPer1k, type Usage } from "../../../shared/pricing";
import { ctx, log } from "./context";

/** Extra listeners (the lesson quality check sums cost through this). */
export const usageListeners: ((row: { model: string; feature: string; cost_usd: number }) => void)[] = [];

export async function recordUsage(model: string, usage: Usage & { server_tool_use?: { web_search_requests?: number | null } | null } | null | undefined, feature?: string) {
  const context = ctx();
  if (!usage) return;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  const cost = costUsd(model, usage, searches, webSearchUsdPer1k(process.env));
  if (!PRICES[model]) log("warn", "usage.unknown_model_price", { model });
  const row = {
    user_id: context?.userId ?? null, request_id: context?.requestId ?? null, feature: feature ?? context?.feature ?? "other", model,
    input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0, cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    web_searches: searches, cost_usd: Number(cost.toFixed(6)),
  };
  log("info", "ai.usage", row);
  for (const listener of usageListeners) listener(row);
  try { await context?.db?.from("ops_ai_usage").insert(row); } catch { /* the log line is the fallback */ }
}
