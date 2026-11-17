import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "../_core/usage";

// Lessons, plans, grading and research: a strong model. Live chat (interviewer, tutor, AI pair): a fast, cheap one.
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
export const CHAT_MODEL = process.env.CLAUDE_CHAT_MODEL || "claude-haiku-5-5";
export const client = () => new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Effort = "low" | "medium" | "high";
type Json = Record<string, unknown>;

// If the main model declines a request on safety grounds, the API re-runs it on a fallback model.
// Haiku has no server-side fallback, so it is only requested for the other models.
const fallbackFor = (model: string): { betas?: Anthropic.AnthropicBeta[]; fallbacks?: "default" } =>
  model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

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
  return content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
}

function parseJson(text: string): Json {
  try { return JSON.parse(text); } catch { /* fall through */ }
  // Tolerate prose around the object: take the outermost braces.
  const firstBrace = text.indexOf("{"), lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  throw new Error("The model did not return valid JSON");
}

/** One request that must come back as JSON matching `schema`. Streams so long outputs don't hit HTTP timeouts. */
export async function askJson(opts: { system: string; user: string; schema: Json; effort?: Effort; maxTokens?: number; model?: string; feature?: string }): Promise<Json> {
  const model = opts.model ?? MODEL;
  const request = (enforceSchema: boolean) => client().beta.messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 32000,
    // Without enforced structured output, the schema goes into the prompt instead.
    system: enforceSchema ? opts.system : `${opts.system}\n\nReply with only one JSON object that matches this JSON schema exactly (every field present). No prose, no code fences.\n${JSON.stringify(opts.schema)}`,
    messages: [{ role: "user", content: opts.user }],
    output_config: enforceSchema ? { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.schema } } : { effort: opts.effort ?? "medium" },
    ...fallbackFor(model),
  }).finalMessage();
  let message;
  try {
    message = await request(true);
  } catch (failure) {
    // The API rejects schemas whose compiled grammar is too large; ask for the same JSON without enforcement.
    if (failure instanceof Anthropic.BadRequestError && /grammar|schema/i.test(failure.message)) message = await request(false);
    else throw failure;
  }
  await recordUsage(message.model, message.usage, opts.feature);
  if (message.stop_reason === "refusal") throw new Error("המודל סירב לבקשה הזו. נסו לנסח אחרת.");
  if (message.stop_reason === "max_tokens") throw new Error("התשובה נקטעה כי הייתה ארוכה מדי. נסו שוב.");
  return parseJson(textOf(message.content as Array<{ type: string; text?: string }>));
}

/** Research a question on the live web. Returns the model's notes and the pages it actually read. */
export async function research(system: string, question: string): Promise<{ notes: string; sources: { title: string; url: string }[] }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
  const sources = new Map<string, string>();
  let notes = "";
  const MAX_CONTINUATIONS = 5;
  for (let turn = 0; turn < MAX_CONTINUATIONS; turn++) {
    const stream = client().beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      output_config: { effort: "medium" },
      ...fallbackFor(MODEL),
    });
    const message = await stream.finalMessage();
    await recordUsage(message.model, message.usage, "research");
    for (const block of message.content) {
      if (block.type === "text") notes += block.text;
      // A successful search result is a list; an error is a single object.
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const result of block.content) if (result.type === "web_search_result") sources.set(result.url, result.title);
      }
    }
    if (message.stop_reason !== "pause_turn") break;
    // The server paused a long search turn: send it back as-is and it resumes.
    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return { notes, sources: [...sources].slice(0, 12).map(([url, title]) => ({ url, title })) };
}

/** Streaming chat turn (interviewer, tutor, AI pair). Yields text as it is written. */
export function chatStream(system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  return client().beta.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: "low" },
    ...fallbackFor(CHAT_MODEL),
  });
}
