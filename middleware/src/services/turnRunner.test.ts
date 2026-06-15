import { describe, expect, it } from "vitest";

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
