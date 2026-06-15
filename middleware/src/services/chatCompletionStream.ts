/**
 * chat-response-streaming P1.0 — parse an OpenAI-style STREAMED chat completion.
 *
 * The provider returns `text/event-stream`: a sequence of `data: <json>` SSE
 * frames where each json is a chat-completion CHUNK carrying `choices[].delta`
 * (incremental `content` and/or `tool_calls`), terminated by `data: [DONE]`.
 * This consumes that stream into the SAME `{ rawAnswer, toolCalls, finishReason }`
 * shape the non-streaming dispatch returns, so callers are protocol-agnostic, and
 * invokes `onText` per content delta so a caller (the TurnRunner) can emit live
 * `token` frames. Streamed tool-call deltas are accumulated BY INDEX (the id +
 * name arrive on the first chunk; arguments stream across chunks).
 *
 * Robust to frames split across read boundaries (a classic SSE bug) — partial
 * frames are buffered until their terminating blank line arrives.
 */
import type { RawToolCall } from "./chatRouterTypes.js";

export interface StreamCompletionCallbacks {
  /** Called once per non-empty content delta, in order. */
  onText?: (delta: string) => void;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  args: string;
}

export async function consumeChatCompletionStream(
  response: Response,
  callbacks?: StreamCompletionCallbacks,
): Promise<{ rawAnswer: string; toolCalls: RawToolCall[]; finishReason: string | null }> {
  const body = response.body;
  if (!body) return { rawAnswer: "", toolCalls: [], finishReason: null };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawAnswer = "";
  let finishReason: string | null = null;
  const toolAcc = new Map<number, ToolCallAccumulator>();

  // Returns true when `[DONE]` is seen (terminate).
  const handleFrame = (frame: string): boolean => {
    for (const line of frame.split("\n")) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("data:")) continue; // SSE comments (`:`) + other fields ignored
      const payload = trimmed.slice("data:".length).trim();
      if (payload === "") continue;
      if (payload === "[DONE]") return true;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
          finish_reason?: string | null;
        }>;
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue; // skip an unparseable frame rather than fail the whole stream
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const content = choice.delta?.content;
      if (content) {
        rawAnswer += content;
        callbacks?.onText?.(content);
      }
      for (const tc of choice.delta?.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        let acc = toolAcc.get(idx);
        if (!acc) {
          acc = { id: tc.id ?? `call_${idx}`, name: "", args: "" };
          toolAcc.set(idx, acc);
        }
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    return false;
  };

  let done = false;
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (handleFrame(frame)) {
        done = true;
        break;
      }
    }
    if (streamDone) {
      // Flush a trailing frame that arrived without its terminating blank line.
      if (!done && buffer.trim().length > 0) handleFrame(buffer);
      break;
    }
  }

  const toolCalls: RawToolCall[] = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, acc]) => ({ id: acc.id, name: acc.name, argumentsJson: acc.args || "{}" }));

  return { rawAnswer: rawAnswer.trim(), toolCalls, finishReason };
}
