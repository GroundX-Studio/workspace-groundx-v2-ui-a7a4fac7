/**
 * analyze-and-chat-ux §6.4/§6.4b — the OpenAI **Responses API** dispatch path
 * (`POST /v1/responses` with `reasoning: { summary: "auto" }`), behind the
 * same `LlmClient` seam as the /chat/completions dispatch.
 *
 * WHY: the Responses API is the only OpenAI surface that exposes the model's
 * reasoning SUMMARY (never raw chain-of-thought) — the thinking stream's
 * source 2 (`{kind:"reasoning"}` events). The mapping layers here translate
 * the grounded pipeline's chat.completions-shaped convo/tools into Responses
 * shapes and consume the Responses stream back into the SAME
 * `{ rawAnswer, toolCalls, finishReason }` contract, so `callGroundedLlm`'s
 * tool loop + citation parsing are protocol-agnostic.
 *
 * GATING: `callGroundedLlm` takes this branch only when
 * `LLM_REASONING_API=responses` — default OFF, so the shipped
 * /chat/completions path is byte-identical until the flag is set. Flip it per
 * environment (values.yaml-configurable) only after live-verifying tool-calls
 * + citations on the Responses path (the plan's flagged risk).
 *
 * §6.4b: `anthropicEventToThinking` is the Anthropic branch of the same
 * adapter shape (summarized `thinking_delta` → reasoning event). A provider/
 * model with no reasoning surface simply produces zero reasoning events — the
 * thinking stream stays valid on `status` narration alone.
 */
import type { ThinkingEvent } from "@groundx/shared";

import type { RawToolCall } from "./chatRouterTypes.js";

// ── Request-side mapping ─────────────────────────────────────────────────────

/** The chat.completions message shape the grounded pipeline threads. */
export interface CompletionsMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** Nested chat.completions function tool (what the catalog builds today). */
export interface CompletionsFunctionTool {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
}

type ResponsesInputItem =
  | { role: "user" | "assistant" | "system"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

/**
 * Map the pipeline's convo to Responses `input` items. The FIRST system
 * message becomes top-level `instructions`; an assistant message with tool
 * calls contributes its prose (when non-null) plus one `function_call` item
 * per call; a tool result becomes `function_call_output` keyed by the same
 * call_id.
 */
export function convoToResponsesInput(convo: CompletionsMessage[]): {
  instructions: string | null;
  input: ResponsesInputItem[];
} {
  let instructions: string | null = null;
  const input: ResponsesInputItem[] = [];
  for (const msg of convo) {
    if (msg.role === "system" && instructions === null) {
      instructions = msg.content ?? "";
      continue;
    }
    if (msg.role === "tool") {
      input.push({ type: "function_call_output", call_id: msg.tool_call_id ?? "", output: msg.content ?? "" });
      continue;
    }
    if (msg.role === "assistant" && msg.tool_calls?.length) {
      if (msg.content) input.push({ role: "assistant", content: msg.content });
      for (const tc of msg.tool_calls) {
        input.push({ type: "function_call", call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments });
      }
      continue;
    }
    input.push({ role: msg.role as "user" | "assistant" | "system", content: msg.content ?? "" });
  }
  return { instructions, input };
}

/** Flatten nested chat.completions function tools to Responses tools. */
export function toResponsesTools(
  tools: CompletionsFunctionTool[],
): Array<{ type: "function"; name: string; description?: string; parameters?: unknown }> {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.function.name,
    ...(t.function.description !== undefined ? { description: t.function.description } : {}),
    ...(t.function.parameters !== undefined ? { parameters: t.function.parameters } : {}),
  }));
}

/** Build the `/v1/responses` request body from the pipeline's shapes. */
export function buildResponsesRequestBody(opts: {
  modelId: string;
  convo: CompletionsMessage[];
  tools?: CompletionsFunctionTool[];
  stream?: boolean;
  maxOutputTokens?: number;
}): Record<string, unknown> {
  const { instructions, input } = convoToResponsesInput(opts.convo);
  const body: Record<string, unknown> = {
    model: opts.modelId,
    ...(instructions !== null ? { instructions } : {}),
    input,
    // Source 2: the model's reasoning SUMMARY (never raw CoT). Providers/
    // models without one simply emit no summary events.
    reasoning: { summary: "auto" },
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = toResponsesTools(opts.tools);
    body.tool_choice = "auto";
  }
  if (opts.stream) body.stream = true;
  if (opts.maxOutputTokens !== undefined) body.max_output_tokens = opts.maxOutputTokens;
  return body;
}

// ── Response-side mapping ────────────────────────────────────────────────────

export interface ResponsesStreamCallbacks {
  /** Per output-text delta, in order (→ `token` frames upstream). */
  onText?: (delta: string) => void;
  /** Once per COMPLETED reasoning-summary part (not per delta — parts render
   *  as readable thinking lines, deltas would spam). */
  onReasoning?: (text: string) => void;
}

interface ResponsesOutcome {
  rawAnswer: string;
  toolCalls: RawToolCall[];
  finishReason: string | null;
}

/**
 * Reasoning summaries arrive markdown-flavored (`**Header**` + paragraph
 * breaks). The thinking stream renders plain caption lines, so strip the
 * emphasis/heading markers and collapse the whitespace — the words are the
 * content, the styling is the stream's.
 */
function cleanSummaryText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s*\n+\s*/g, " · ")
    .trim();
}

function finishFromStatus(status?: string, incompleteReason?: string): string {
  if (status === "incomplete" && incompleteReason === "max_output_tokens") return "length";
  return "stop";
}

/**
 * Consume a streamed `/v1/responses` SSE body into the pipeline's
 * protocol-agnostic outcome shape. Robust to frames split across read
 * boundaries (same buffering discipline as `consumeChatCompletionStream`).
 */
export async function consumeResponsesStream(
  response: Response,
  callbacks: ResponsesStreamCallbacks,
): Promise<ResponsesOutcome> {
  const body = response.body;
  if (!body) return { rawAnswer: "", toolCalls: [], finishReason: null };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawAnswer = "";
  let finishReason: string | null = null;
  const toolCalls: RawToolCall[] = [];

  const handleFrame = (frame: string): void => {
    for (const line of frame.split("\n")) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (payload === "" || payload === "[DONE]") continue;
      let event: {
        type?: string;
        delta?: string;
        text?: string;
        item?: { type?: string; call_id?: string; name?: string; arguments?: string };
        response?: { status?: string; incomplete_details?: { reason?: string } };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue; // skip an unparseable frame rather than fail the stream
      }
      switch (event.type) {
        case "response.output_text.delta":
          if (event.delta) {
            rawAnswer += event.delta;
            callbacks.onText?.(event.delta);
          }
          break;
        case "response.reasoning_summary_text.done":
          if (event.text) callbacks.onReasoning?.(cleanSummaryText(event.text));
          break;
        case "response.output_item.done":
          if (event.item?.type === "function_call" && event.item.name) {
            toolCalls.push({
              id: event.item.call_id ?? `call_${toolCalls.length}`,
              name: event.item.name,
              argumentsJson: event.item.arguments ?? "{}",
            });
          }
          break;
        case "response.completed":
        case "response.incomplete":
          finishReason = finishFromStatus(
            event.response?.status,
            event.response?.incomplete_details?.reason,
          );
          break;
        default:
          break; // deltas of reasoning parts, annotations, pings — not lines
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleFrame(frame);
    }
    if (done) break;
  }
  if (buffer.trim()) handleFrame(buffer);

  return { rawAnswer, toolCalls, finishReason };
}

/**
 * Parse a NON-streaming `/v1/responses` JSON payload into the same outcome
 * shape (the graceful fallback when the provider ignored `stream: true`).
 */
export function parseResponsesPayload(
  payload: {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      summary?: Array<{ type?: string; text?: string }>;
      call_id?: string;
      name?: string;
      arguments?: string;
    }>;
  },
  onReasoning?: (text: string) => void,
): ResponsesOutcome {
  let rawAnswer = "";
  const toolCalls: RawToolCall[] = [];
  for (const item of payload.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) rawAnswer += part.text;
      }
    } else if (item.type === "function_call" && item.name) {
      toolCalls.push({
        id: item.call_id ?? `call_${toolCalls.length}`,
        name: item.name,
        argumentsJson: item.arguments ?? "{}",
      });
    } else if (item.type === "reasoning") {
      for (const part of item.summary ?? []) {
        if (part.text) onReasoning?.(cleanSummaryText(part.text));
      }
    }
  }
  return {
    rawAnswer: rawAnswer.trim(),
    toolCalls,
    finishReason: finishFromStatus(payload.status, payload.incomplete_details?.reason),
  };
}

// ── §6.4b — the Anthropic branch of the same adapter shape ──────────────────

/**
 * Map one Anthropic Messages-API stream event to a thinking event, or null.
 * Anthropic's `thinking: {type:"adaptive"}` + summarized display streams
 * `content_block_delta` events whose delta is `thinking_delta` — the model's
 * SUMMARIZED reasoning (the raw chain of thought is never returned on 4.6+
 * models). Everything else (text deltas, pings, block boundaries) is not a
 * thinking line → null. A non-reasoning provider/model therefore yields zero
 * reasoning events and the stream stays valid (§6.4b degrade).
 */
export function anthropicEventToThinking(event: {
  type?: string;
  delta?: { type?: string; thinking?: string; text?: string };
}): ThinkingEvent | null {
  if (event.type !== "content_block_delta") return null;
  if (event.delta?.type !== "thinking_delta") return null;
  const text = event.delta.thinking ?? "";
  if (!text.trim()) return null;
  return { kind: "reasoning", text };
}
