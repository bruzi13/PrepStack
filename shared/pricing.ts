// Claude API list prices in USD per million tokens (Anthropic first-party, checked 2026-11-17 against the
// claude-api reference cached 2026-10-06). Update here when prices change; the cost board reads only this file.
// Cache writes are billed at 1.25x input (5-minute cache); cache reads as listed.

export interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }

export const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

/** Web search is billed per search. Not in the reference this file was checked against: set it from the
 *  pricing page (env WEB_SEARCH_USD_PER_1K) so the board does not show a guessed number. */
export const webSearchUsdPer1k = (env: Record<string, string | undefined> = {}) => Number(env.WEB_SEARCH_USD_PER_1K ?? 0);

export interface Usage { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

/** Cost of one response. Unknown models cost 0 and are flagged by the caller, never guessed. */
export function costUsd(model: string, u: Usage, webSearches = 0, perThousandSearches = 0): number {
  const p = PRICES[model];
  const searches = (webSearches * perThousandSearches) / 1000;
  if (!p) return searches;
  const m = 1_000_000;
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output
    + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / m + searches;
}
