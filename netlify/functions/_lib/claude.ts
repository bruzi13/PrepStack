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
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

function parseJson(text: string): Json {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error("The model did not return valid JSON");
}

/** One request that must come back as JSON matching `schema`. Streams so long outputs don't hit HTTP timeouts. */
export async function askJson(opts: { system: string; user: string; schema: Json; effort?: Effort; maxTokens?: number; model?: string; feature?: string }): Promise<Json> {
  const model = opts.model ?? MODEL;
  const run = (strict: boolean) => client().beta.messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 32000,
    // Without enforced structured output, the schema goes into the prompt instead.
    system: strict ? opts.system : `${opts.system}\n\nReply with only one JSON object that matches this JSON schema exactly (every field present). No prose, no code fences.\n${JSON.stringify(opts.schema)}`,
    messages: [{ role: "user", content: opts.user }],
    output_config: strict ? { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.schema } } : { effort: opts.effort ?? "medium" },
    ...fallbackFor(model),
  }).finalMessage();
  let msg;
  try {
    msg = await run(true);
  } catch (e) {
    // The API rejects schemas whose compiled grammar is too large; ask for the same JSON without enforcement.
    if (e instanceof Anthropic.BadRequestError && /grammar|schema/i.test(e.message)) msg = await run(false);
    else throw e;
  }
  await recordUsage(msg.model, msg.usage, opts.feature);
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
      ...fallbackFor(MODEL),
    });
    const msg = await stream.finalMessage();
    await recordUsage(msg.model, msg.usage, "research");
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
    model: CHAT_MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: "low" },
    ...fallbackFor(CHAT_MODEL),
  });
}
