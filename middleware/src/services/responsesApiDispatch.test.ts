import { describe, expect, it, vi } from "vitest";

import {
  anthropicEventToThinking,
  buildResponsesRequestBody,
  consumeResponsesStream,
  convoToResponsesInput,
  parseResponsesPayload,
  toResponsesTools,
} from "./responsesApiDispatch.js";

/**
 * analyze-and-chat-ux §6.4/§6.4b — the OpenAI Responses API dispatch path
 * (`/v1/responses`, `reasoning:{summary:"auto"}`) behind the LlmClient seam,
 * mapping reasoning-summary parts → `{kind:"reasoning"}` thinking events.
 * Env-gated (`LLM_REASONING_API=responses`), default OFF: the shipped
 * /chat/completions dispatch is byte-identical until the flag is set.
 * The Anthropic mapper shares the adapter shape (§6.4b); a non-reasoning
 * provider yields zero reasoning events and the stream stays valid.
 */

function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `data: ${f}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("convoToResponsesInput — chat.completions convo → Responses input items", () => {
  it("system → instructions; user/assistant prose → role items", () => {
    const { instructions, input } = convoToResponsesInput([
      { role: "system", content: "You are grounded." },
      { role: "user", content: "What is the total?" },
    ]);
    expect(instructions).toBe("You are grounded.");
    expect(input).toEqual([{ role: "user", content: "What is the total?" }]);
  });

  it("threads a tool round: assistant tool_calls → function_call items; tool results → function_call_output", () => {
    const { input } = convoToResponsesInput([
      { role: "system", content: "sys" },
      { role: "user", content: "q" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "search_documents", arguments: '{"q":"total"}' } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "snippet text" },
    ]);
    expect(input).toEqual([
      { role: "user", content: "q" },
      { type: "function_call", call_id: "call_1", name: "search_documents", arguments: '{"q":"total"}' },
      { type: "function_call_output", call_id: "call_1", output: "snippet text" },
    ]);
  });

  it("keeps assistant prose alongside its tool calls (prose item precedes the calls)", () => {
    const { input } = convoToResponsesInput([
      {
        role: "assistant",
        content: "Let me check.",
        tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }],
      },
    ]);
    expect(input[0]).toEqual({ role: "assistant", content: "Let me check." });
    expect(input[1]).toMatchObject({ type: "function_call", call_id: "c1" });
  });
});

describe("toResponsesTools — nested function tools → flat Responses tools", () => {
  it("flattens {type:function, function:{...}} to {type:function, name, ...}", () => {
    expect(
      toResponsesTools([
        {
          type: "function",
          function: { name: "show_extraction", description: "d", parameters: { type: "object" } },
        },
      ]),
    ).toEqual([{ type: "function", name: "show_extraction", description: "d", parameters: { type: "object" } }]);
  });
});

describe("buildResponsesRequestBody", () => {
  it("carries model, instructions, input, flattened tools, and reasoning summary", () => {
    const body = buildResponsesRequestBody({
      modelId: "gpt-5.5",
      convo: [
        { role: "system", content: "sys" },
        { role: "user", content: "q" },
      ],
      tools: [{ type: "function", function: { name: "t", description: "", parameters: {} } }],
      stream: true,
    });
    expect(body).toMatchObject({
      model: "gpt-5.5",
      instructions: "sys",
      input: [{ role: "user", content: "q" }],
      tools: [{ type: "function", name: "t" }],
      tool_choice: "auto",
      reasoning: { summary: "auto" },
      stream: true,
    });
  });

  it("omits tools/tool_choice when none are advertised (answer-forcing round)", () => {
    const body = buildResponsesRequestBody({ modelId: "m", convo: [{ role: "user", content: "q" }] });
    expect("tools" in body).toBe(false);
    expect("tool_choice" in body).toBe(false);
  });
});

describe("consumeResponsesStream — SSE → {rawAnswer, toolCalls, finishReason} + events", () => {
  it("accumulates output_text deltas (onText), emits one reasoning event per completed summary part, and collects function calls", async () => {
    const onText = vi.fn();
    const onReasoning = vi.fn();
    const res = sseResponse([
      JSON.stringify({ type: "response.reasoning_summary_text.delta", delta: "Scanning the bill" }),
      JSON.stringify({
        type: "response.reasoning_summary_text.done",
        text: "**Scanning the bill**\n\nLooking for the largest charge.",
      }),
      JSON.stringify({ type: "response.output_text.delta", delta: "The largest " }),
      JSON.stringify({ type: "response.output_text.delta", delta: "charge is $2,560.32." }),
      JSON.stringify({
        type: "response.output_item.done",
        item: { type: "function_call", call_id: "call_9", name: "show_extraction", arguments: '{"scope":{}}' },
      }),
      JSON.stringify({ type: "response.completed", response: { status: "completed" } }),
    ]);
    const out = await consumeResponsesStream(res, { onText, onReasoning });
    expect(out.rawAnswer).toBe("The largest charge is $2,560.32.");
    expect(onText).toHaveBeenCalledTimes(2);
    // one event per COMPLETED part (deltas are not spammed as lines)
    expect(onReasoning).toHaveBeenCalledTimes(1);
    // markdown emphasis stripped + paragraphs collapsed → a clean caption line
    expect(onReasoning).toHaveBeenCalledWith("Scanning the bill · Looking for the largest charge.");
    expect(out.toolCalls).toEqual([{ id: "call_9", name: "show_extraction", argumentsJson: '{"scope":{}}' }]);
    expect(out.finishReason).toBe("stop");
  });

  it("maps max_output_tokens incompleteness to finishReason 'length'", async () => {
    const res = sseResponse([
      JSON.stringify({ type: "response.output_text.delta", delta: "partial" }),
      JSON.stringify({
        type: "response.incomplete",
        response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
      }),
    ]);
    const out = await consumeResponsesStream(res, {});
    expect(out.finishReason).toBe("length");
  });

  it("a stream with NO reasoning events is still valid (graceful degrade §6.4b)", async () => {
    const onReasoning = vi.fn();
    const res = sseResponse([
      JSON.stringify({ type: "response.output_text.delta", delta: "Hi." }),
      JSON.stringify({ type: "response.completed", response: { status: "completed" } }),
    ]);
    const out = await consumeResponsesStream(res, { onReasoning });
    expect(out.rawAnswer).toBe("Hi.");
    expect(onReasoning).not.toHaveBeenCalled();
  });
});

describe("parseResponsesPayload — non-streaming JSON shape", () => {
  it("walks output[]: message text, function calls, reasoning summaries", () => {
    const onReasoning = vi.fn();
    const out = parseResponsesPayload(
      {
        status: "completed",
        output: [
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "Reading the charge table." }],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "The total is $214.07." }],
          },
          { type: "function_call", call_id: "c2", name: "show_extraction", arguments: "{}" },
        ],
      },
      onReasoning,
    );
    expect(out.rawAnswer).toBe("The total is $214.07.");
    expect(out.toolCalls).toEqual([{ id: "c2", name: "show_extraction", argumentsJson: "{}" }]);
    expect(out.finishReason).toBe("stop");
    expect(onReasoning).toHaveBeenCalledWith("Reading the charge table.");
  });
});

describe("anthropicEventToThinking — the Anthropic branch shares the adapter shape (§6.4b)", () => {
  it("maps a summarized thinking_delta to a reasoning event", () => {
    expect(
      anthropicEventToThinking({
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "The bill lists 8 meters." },
      }),
    ).toEqual({ kind: "reasoning", text: "The bill lists 8 meters." });
  });

  it("returns null for non-thinking events (text deltas, pings) — zero reasoning events, stream stays valid", () => {
    expect(
      anthropicEventToThinking({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }),
    ).toBeNull();
    expect(anthropicEventToThinking({ type: "ping" })).toBeNull();
  });
});

// §6.4 gate check — callGroundedLlm THROUGH the Responses path: the citations
// fence and tool calls must survive (the plan's flagged migration risk),
// reasoning events must reach the ambient sink, and the flag OFF must leave
// the /chat/completions path untouched.
describe("callGroundedLlm — env-gated Responses path integration (§6.4)", () => {
  it("routes to /responses when LLM_REASONING_API=responses: citations fence + tool calls + reasoning flow", async () => {
    vi.stubEnv("LLM_REASONING_API", "responses");
    try {
      const { callGroundedLlm } = await import("./ragPipeline.js");
      const { turnStreamContext } = await import("./streamSink.js");
      const answer = [
        "The total is $214.07.",
        "",
        "```json",
        '{"citations":[{"documentId":"d1","page":1,"quote":"total is $214.07"}]}',
        "```",
      ].join("\n");
      const forward = vi.fn(async (path: string) => {
        expect(path).toBe("/responses");
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              { type: "reasoning", summary: [{ type: "summary_text", text: "Locating the total." }] },
              { type: "message", content: [{ type: "output_text", text: answer }] },
              { type: "function_call", call_id: "c1", name: "show_extraction", arguments: "{}" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      });
      const events: Array<{ kind: string; text: string }> = [];
      const result = await turnStreamContext.run(
        { onThinking: (ev) => events.push(ev) },
        () =>
          callGroundedLlm(
            "What is the total?",
            [{ documentId: "d1", text: "the bill total is $214.07" }],
            { forward },
            "test-model",
          ),
      );
      // citations fence intact in the raw answer (parseGroundedAnswer's input)
      expect(result.answer).toContain('"citations"');
      expect(result.answer).toContain("The total is $214.07.");
      // tool calls routed
      expect(result.toolCalls).toEqual([{ id: "c1", name: "show_extraction", argumentsJson: "{}" }]);
      // reasoning summary → thinking event
      expect(events).toContainEqual({ kind: "reasoning", text: "Locating the total." });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("flag OFF (default): dispatches to /chat/completions exactly as shipped", async () => {
    vi.stubEnv("LLM_REASONING_API", "");
    try {
      const { callGroundedLlm } = await import("./ragPipeline.js");
      const forward = vi.fn(async (path: string) => {
        expect(path).toBe("/chat/completions");
        return new Response(JSON.stringify({ choices: [{ message: { content: "Hi." } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      const result = await callGroundedLlm("hello", [], { forward }, "test-model");
      expect(result.answer).toBe("Hi.");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
