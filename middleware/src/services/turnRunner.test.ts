import { describe, expect, it, vi } from "vitest";

import { logger } from "../lib/logger.js";
import { ChatHandlerError } from "./chatHandler.js";
import { turnStreamContext } from "./streamSink.js";
import { TurnRegistry, TurnRunner } from "./turnRunner.js";

/**
 * chat-response-streaming P1.2 — the TurnRunner drives one turn's generation
 * (decoupled from any connection), setting the ambient stream sink so deep code
 * emits live `token`/`activity` frames, and bracketing them with `meta` … `envelope`.
 * The TurnRegistry makes a re-POST with a known (session,turnKey) ATTACH to the
 * running turn (idempotent — generation runs ONCE), and keeps sessions isolated.
 * RED until the runner + registry land.
 */

// A minimal HandleChatMessageResponse-shaped result (only what the runner reads).
const reply = (answer: string) => ({
  reply: { answer, citations: [], suggestedActions: [], intents: [], toolFailures: [], toolActivity: [] },
});

describe("TurnRunner", () => {
  it("emits meta → live frames (via the ambient sink) → envelope, in order", async () => {
    const runner = new TurnRunner({
      sessionId: "s1",
      turnKey: "k1",
      streaming: true,
      // Generation reads the AMBIENT sink the runner set — proving the ALS wiring
      // that lets deep callGroundedLlm code stream without threaded params.
      generate: async () => {
        const sink = turnStreamContext.getStore();
        sink?.onActivity?.({ name: "search_documents", label: "Checked the documents" });
        sink?.onToken?.("Hello ");
        sink?.onToken?.("world.");
        return reply("Hello world.") as never;
      },
    });

    await runner.completion;
    const frames = [];
    for await (const f of runner.buffer.read(0)) frames.push(f);

    expect(frames.map((f) => f.type)).toEqual(["meta", "activity", "token", "token", "envelope"]);
    expect(frames[0].data).toMatchObject({ turnKey: "k1" });
    expect(frames.at(-1)?.data).toMatchObject({ reply: { answer: "Hello world." } });
  });

  it("buffers `thinking` frames from the ambient sink, in order with the other live frames (§6)", async () => {
    const runner = new TurnRunner({
      sessionId: "s1",
      turnKey: "k-think",
      streaming: true,
      generate: async () => {
        const sink = turnStreamContext.getStore();
        sink?.onThinking?.({ kind: "status", text: "Searching your documents" });
        sink?.onThinking?.({ kind: "status", text: "Writing a grounded answer" });
        sink?.onThinking?.({ kind: "reasoning", text: "The bill total appears on page 1." });
        sink?.onToken?.("The total is $214.07.");
        return reply("The total is $214.07.") as never;
      },
    });

    await runner.completion;
    const frames = [];
    for await (const f of runner.buffer.read(0)) frames.push(f);

    expect(frames.map((f) => f.type)).toEqual(["meta", "thinking", "thinking", "thinking", "token", "envelope"]);
    expect(frames[1].data).toEqual({ kind: "status", text: "Searching your documents" });
    expect(frames[3].data).toEqual({ kind: "reasoning", text: "The bill total appears on page 1." });
  });

  it("citation-stream-leak — redacts the trailing citations metadata block from token frames", async () => {
    const runner = new TurnRunner({
      sessionId: "s-cite",
      turnKey: "k-cite",
      streaming: true,
      // The grounded model streams prose then appends the ```json citations block
      // (fragments.ts citationsContract). The token frames must never carry it.
      generate: async () => {
        const sink = turnStreamContext.getStore();
        sink?.onToken?.("The total due is $7,613.20.[1]\n\n");
        sink?.onToken?.('```json\n{"citations":[{"documentId":"c3bfff49",');
        sink?.onToken?.('"field":"balance_payable","value":7613.2}]}\n```');
        return reply("The total due is $7,613.20.[1]") as never;
      },
    });

    await runner.completion;
    const frames = [];
    for await (const f of runner.buffer.read(0)) frames.push(f);
    const streamedTokens = frames.filter((f) => f.type === "token").map((f) => f.data.delta).join("");
    // No part of the metadata block (nor the internal documentId) crosses the wire.
    expect(streamedTokens).not.toMatch(/citations|documentId|```/);
    // The prose (with its inline marker) still streams.
    expect(streamedTokens).toContain("The total due is $7,613.20.[1]");
    // The final envelope still carries the clean answer (unaffected by redaction).
    expect(frames.at(-1)?.data).toMatchObject({ reply: { answer: "The total due is $7,613.20.[1]" } });
  });

  it("runs generation to completion even when NO connection reads the buffer (decoupled)", async () => {
    // The decoupling guarantee: a client that never attaches / disconnects does
    // NOT stop generation — it finishes and buffers the envelope (the generate
    // thunk's own persistence still runs in production), available for a late replay.
    let ran = false;
    const runner = new TurnRunner({
      sessionId: "s1",
      turnKey: "k-detached",
      generate: async () => {
        ran = true;
        return reply("done") as never;
      },
    });
    const result = await runner.completion; // never read runner.buffer
    expect(ran).toBe(true);
    expect(result?.reply.answer).toBe("done");
    expect(runner.buffer.done).toBe(true);
  });

  it("emits an error frame (not envelope) when generation throws, and still completes", async () => {
    const runner = new TurnRunner({
      sessionId: "s1",
      turnKey: "k-err",
      generate: async () => {
        throw new Error("boom");
      },
    });
    await runner.completion;
    const frames = [];
    for await (const f of runner.buffer.read(0)) frames.push(f);
    expect(frames.map((f) => f.type)).toEqual(["meta", "error"]);
    expect(runner.buffer.done).toBe(true);
  });

  it("LOGS the underlying error when an UNEXPECTED (non-ChatHandlerError) throw escapes generation", async () => {
    // Regression guard: a generic throw that escapes chatHandler's own try/catch
    // (e.g. an upstream LLM 401/timeout, or any error outside the router try) becomes
    // a bare `internal_error` SSE frame. Without logging here the server has ZERO
    // diagnostics — the exact blind spot that hid a prod chat outage. The runner is
    // the universal catch-all, so it MUST log the real error (message + stack).
    const spy = vi.spyOn(logger, "error").mockImplementation(() => logger as never);
    const boom = new Error("grounded llm call failed: 401 Unauthorized");
    const runner = new TurnRunner({
      sessionId: "s-log",
      turnKey: "k-unexpected",
      generate: async () => {
        throw boom;
      },
    });
    await runner.completion;
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom, sessionId: "s-log", turnKey: "k-unexpected" }),
      expect.stringContaining("turn generation failed"),
    );
    spy.mockRestore();
  });

  it("does NOT error-log an EXPECTED failure (ChatHandlerError is already logged upstream)", async () => {
    // ChatHandlerError carries a meaningful code and is logged where it is raised
    // (chatHandler) — error-logging it again here would be double noise. Only the
    // unexpected `internal_error` path is the runner's to surface.
    const spy = vi.spyOn(logger, "error").mockImplementation(() => logger as never);
    const runner = new TurnRunner({
      sessionId: "s-quiet",
      turnKey: "k-expected",
      generate: async () => {
        throw new ChatHandlerError("router_failed:upstream_502", 502);
      },
    });
    await runner.completion;
    expect(spy).not.toHaveBeenCalled();
    const frames = [];
    for await (const f of runner.buffer.read(0)) frames.push(f);
    // The frame still carries the ChatHandlerError's code (not `internal_error`).
    expect(frames.at(-1)?.data).toMatchObject({ code: "router_failed:upstream_502" });
    spy.mockRestore();
  });
});

describe("TurnRegistry", () => {
  it("is idempotent per (session, turnKey) — a re-POST attaches, generation runs once", async () => {
    let calls = 0;
    const registry = new TurnRegistry();
    const factory = () =>
      new TurnRunner({
        sessionId: "s1",
        turnKey: "k1",
        generate: async () => {
          calls += 1;
          return reply("once") as never;
        },
      });

    const r1 = registry.getOrCreate("s1", "k1", factory);
    const r2 = registry.getOrCreate("s1", "k1", factory); // re-POST same key
    expect(r1).toBe(r2);
    await r1.completion;
    expect(calls).toBe(1);
  });

  it("supersedes a prior IN-FLIGHT turn when a NEW turn arrives for the same session", async () => {
    const registry = new TurnRegistry();
    // A generation that runs until the ambient sink's abort signal fires.
    const pendingUntilAbort = () =>
      new Promise<never>((_resolve, reject) => {
        const sink = turnStreamContext.getStore();
        sink?.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    const r1 = registry.getOrCreate(
      "s1",
      "k1",
      () => new TurnRunner({ sessionId: "s1", turnKey: "k1", generate: pendingUntilAbort }),
    );
    // A NEW turn (different key) for the SAME session supersedes r1.
    const r2 = registry.getOrCreate(
      "s1",
      "k2",
      () => new TurnRunner({ sessionId: "s1", turnKey: "k2", generate: async () => reply("second") as never }),
    );

    await r1.completion; // resolves because r1 was aborted
    await r2.completion;
    expect(r1).not.toBe(r2);
    // r1 was aborted → its turn ends in an `error` frame, NOT an envelope (its
    // partial output is discarded, never persisted).
    const r1Frames = [];
    for await (const f of r1.buffer.read(0)) r1Frames.push(f);
    expect(r1Frames.map((f) => f.type)).toEqual(["meta", "error"]);
    expect(r2.result?.reply.answer).toBe("second");
  });

  it("a reconnect (same turnKey) does NOT supersede — it attaches", async () => {
    const registry = new TurnRegistry();
    let aborted = false;
    const r1 = registry.getOrCreate(
      "s1",
      "k1",
      () =>
        new TurnRunner({
          sessionId: "s1",
          turnKey: "k1",
          generate: async () => {
            const sink = turnStreamContext.getStore();
            sink?.abortSignal?.addEventListener("abort", () => {
              aborted = true;
            });
            return reply("only") as never;
          },
        }),
    );
    const again = registry.getOrCreate("s1", "k1", () => {
      throw new Error("factory must not run for a known key");
    });
    await r1.completion;
    expect(again).toBe(r1);
    expect(aborted).toBe(false);
  });

  it("keeps sessions isolated — same turnKey, different session → different runner", () => {
    const registry = new TurnRegistry();
    const make = (sessionId: string) =>
      new TurnRunner({ sessionId, turnKey: "shared", generate: async () => reply("x") as never });
    const a = registry.getOrCreate("sA", "shared", () => make("sA"));
    const b = registry.getOrCreate("sB", "shared", () => make("sB"));
    expect(a).not.toBe(b);
    // sA cannot look up sB's runner under the shared key.
    expect(registry.get("sA", "shared")).toBe(a);
    expect(registry.get("sB", "shared")).toBe(b);
  });
});
