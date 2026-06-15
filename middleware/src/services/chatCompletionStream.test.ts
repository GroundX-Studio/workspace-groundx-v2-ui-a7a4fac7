import { describe, expect, it, vi } from "vitest";

import { consumeChatCompletionStream } from "./chatCompletionStream.js";

/**
 * P1.0 (chat-response-streaming) — parse an OpenAI-style streamed chat
 * completion (SSE `data:` frames of `choices[].delta`) into the SAME
 * `{ rawAnswer, toolCalls, finishReason }` shape the non-streaming dispatch
 * returns, invoking `onText` per content delta and accumulating streamed
 * tool-call deltas (by index). RED until the parser lands.
 */

function sse(...frames: string[]): Response {
  // Each frame is a full `data: ...` line; SSE separates events with a blank line.
  const body = frames.map((f) => `${f}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}
const data = (obj: unknown) => `data: ${JSON.stringify(obj)}`;

describe("consumeChatCompletionStream", () => {
  it("concatenates content deltas into rawAnswer and calls onText per delta", async () => {
    const onText = vi.fn();
    const res = await consumeChatCompletionStream(
      sse(
        data({ choices: [{ delta: { role: "assistant", content: "" }, index: 0 }] }),
        data({ choices: [{ delta: { content: "The " }, index: 0 }] }),
        data({ choices: [{ delta: { content: "answer." }, index: 0 }] }),
        data({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }),
        "data: [DONE]",
      ),
      { onText },
    );
    expect(res.rawAnswer).toBe("The answer.");
    expect(res.finishReason).toBe("stop");
    expect(res.toolCalls).toEqual([]);
    expect(onText.mock.calls.map((c) => c[0])).toEqual(["The ", "answer."]);
  });

  it("accumulates streamed tool-call deltas (by index) into complete tool calls", async () => {
    const res = await consumeChatCompletionStream(
      sse(
        data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "search_documents", arguments: "" } }] } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":' } }] } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"taxes"}' } }] } }] }),
        data({ choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }] }),
        "data: [DONE]",
      ),
    );
    expect(res.finishReason).toBe("tool_calls");
    expect(res.toolCalls).toEqual([
      { id: "call_a", name: "search_documents", argumentsJson: '{"query":"taxes"}' },
    ]);
  });

  it("handles multiple concurrent tool calls by index", async () => {
    const res = await consumeChatCompletionStream(
      sse(
        data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c0", type: "function", function: { name: "open_document", arguments: "{}" } }] } }] }),
        data({ choices: [{ delta: { tool_calls: [{ index: 1, id: "c1", type: "function", function: { name: "jump_to_page", arguments: '{"page":2}' } }] } }] }),
        "data: [DONE]",
      ),
    );
    expect(res.toolCalls).toEqual([
      { id: "c0", name: "open_document", argumentsJson: "{}" },
      { id: "c1", name: "jump_to_page", argumentsJson: '{"page":2}' },
    ]);
  });

  it("parses correctly when SSE frames are split across read chunks", async () => {
    // A body whose bytes arrive in chunks that split a `data:` line mid-JSON —
    // the parser MUST buffer partial frames across reads (classic SSE bug).
    const full =
      `${data({ choices: [{ delta: { content: "split " }, index: 0 }] })}\n\n` +
      `${data({ choices: [{ delta: { content: "works" }, index: 0 }] })}\n\n` +
      `data: [DONE]\n\n`;
    const cut = Math.floor(full.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(full.slice(0, cut)));
        controller.enqueue(enc.encode(full.slice(cut)));
        controller.close();
      },
    });
    const res = await consumeChatCompletionStream(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    expect(res.rawAnswer).toBe("split works");
  });

  it("ignores SSE comment lines and blank frames", async () => {
    const res = await consumeChatCompletionStream(
      sse(
        ": keep-alive heartbeat",
        data({ choices: [{ delta: { content: "ok" }, index: 0 }] }),
        "data: [DONE]",
      ),
    );
    expect(res.rawAnswer).toBe("ok");
  });
});
