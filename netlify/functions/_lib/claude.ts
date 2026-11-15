import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const client = () => new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Effort = "low" | "medium" | "high";
type Json = Record<string, unknown>;

// If the main model declines a request on safety grounds, the API re-runs it on a fallback model.
const FALLBACK: { betas: Anthropic.AnthropicBeta[]; fallbacks: "default" } = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

/* ---------- tiny JSON-schema builder (structured outputs need every field required) ---------- */
export const S = {
  str: (description?: string) => ({ type: "string", ...(description ? { description } : {}) }),
  int: (description?: string) => ({ type: "integer", ...(description ? { description } : {}) }),
  bool: () => ({ type: "boolean" }),
  enm: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
  arr: (items: Json, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) }),
  obj: (properties: Record<string, Json>, description?: string) => ({
    type: "object", properties, required: Object.keys(properties), additionalProperties: false,
    ...(description ? { description } : {}),
  }),
};

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

function parseJson(text: string): Json {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error("The model did not return valid JSON");
}

/** One request that must come back as JSON matching `schema`. Streams so long outputs don't hit HTTP timeouts. */
export async function askJson(opts: { system: string; user: string; schema: Json; effort?: Effort; maxTokens?: number }): Promise<Json> {
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.schema } },
    ...FALLBACK,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("המודל סירב לבקשה הזו. נסו לנסח אחרת.");
  if (msg.stop_reason === "max_tokens") throw new Error("התשובה נקטעה כי הייתה ארוכה מדי. נסו שוב.");
  return parseJson(textOf(msg.content as Array<{ type: string; text?: string }>));
}

/** Research a question on the live web. Returns the model's notes and the pages it actually read. */
export async function research(system: string, question: string): Promise<{ notes: string; sources: { title: string; url: string }[] }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
  const sources = new Map<string, string>();
  let notes = "";
  for (let i = 0; i < 5; i++) {
    const stream = client().beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      output_config: { effort: "medium" },
      ...FALLBACK,
    });
    const msg = await stream.finalMessage();
    for (const block of msg.content) {
      if (block.type === "text") notes += block.text;
      // A successful search result is a list; an error is a single object.
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    // The server paused a long search turn: send it back as-is and it resumes.
    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return { notes, sources: [...sources].slice(0, 12).map(([url, title]) => ({ url, title })) };
}

/** Streaming chat turn (interviewer, tutor, AI pair). Yields text as it is written. */
export function chatStream(system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  return client().beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: "low" },
    ...FALLBACK,
  });
}
