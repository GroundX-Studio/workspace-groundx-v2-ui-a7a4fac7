import { describe, expect, it } from "vitest";

import {
  bundleChatContext,
  planCompression,
  shouldCompress,
  type BundleChatContextInput,
  type BundleConversationInput,
} from "./contextBundler.js";

function baseInput(overrides: Partial<BundleChatContextInput> = {}): BundleChatContextInput {
  return {
    conversation: {
      latestSummary: null,
      liveTail: [],
      ...overrides.conversation,
    },
    currentEntity: {
      entityKey: null,
      lastFrame: null,
      completedFrames: [],
      extractedValues: null,
      ...overrides.currentEntity,
    },
    recentViewerEvents: overrides.recentViewerEvents ?? [],
    newUserMessage: overrides.newUserMessage ?? "",
  };
}

describe("bundleChatContext", () => {
  it("produces an empty-ish bundle for a fresh session with no tail / no entity / no events", () => {
    const bundle = bundleChatContext(baseInput());
    expect(bundle.estimatedTokens).toBe(0);
    expect(bundle.conversation.liveTail).toHaveLength(0);
    expect(bundle.viewerTrail).toHaveLength(0);
  });

  it("estimates tokens across all three axes + the new user message", () => {
    const bundle = bundleChatContext(
      baseInput({
        conversation: {
          latestSummary: { id: "s1", content: "Summary content ~16 chars", tokensIn: 0, tokensOut: 0 },
          liveTail: [
            { id: "m1", role: "user", content: "twelve chars" },
            { id: "m2", role: "assistant", content: "another twelve" },
          ],
        },
        currentEntity: {
          entityKey: "sample:utility",
          lastFrame: "f2",
          completedFrames: ["f1", "f2"],
          extractedValues: { amount: 123 },
        },
        recentViewerEvents: [
          { action: "opened", entityKey: "sample:utility", source: "user", timestamp: 1 },
          { action: "frame-advanced", entityKey: "sample:utility", source: "user", timestamp: 2 },
        ],
        newUserMessage: "what is the total amount due?",
      }),
    );
    // Each axis contributed something; assert the bundle reflects all of them.
    expect(bundle.conversation.latestSummary?.id).toBe("s1");
    expect(bundle.conversation.liveTail).toHaveLength(2);
    expect(bundle.currentEntity.entityKey).toBe("sample:utility");
    expect(bundle.viewerTrail).toHaveLength(2);
    expect(bundle.newUserMessage).toBe("what is the total amount due?");
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("shouldCompress", () => {
  it("is false when far below the context window", () => {
    expect(shouldCompress(1000, 100_000)).toBe(false);
  });

  it("is true at the 70% threshold", () => {
    expect(shouldCompress(70_000, 100_000)).toBe(true);
  });

  it("is false when contextWindowTokens is zero or negative (no window known)", () => {
    expect(shouldCompress(50_000, 0)).toBe(false);
    expect(shouldCompress(50_000, -1)).toBe(false);
  });
});

describe("planCompression", () => {
  const tail: BundleConversationInput["liveTail"] = [
    { id: "m1", role: "user", content: "a".repeat(400) }, // ~100 tokens
    { id: "m2", role: "assistant", content: "b".repeat(400) }, // ~100 tokens
    { id: "m3", role: "user", content: "c".repeat(400) }, // ~100 tokens
    { id: "m4", role: "assistant", content: "d".repeat(400) }, // ~100 tokens
  ];

  it("returns null when there's nothing meaningful to compress (single message)", () => {
    expect(planCompression([tail[0]], null, 1000)).toBeNull();
  });

  it("collects oldest messages until the target token count is reached", () => {
    const plan = planCompression(tail, null, 250);
    expect(plan).not.toBeNull();
    // First 3 messages contribute ~300 tokens (>250); the plan covers m1-m3
    // and leaves m4 in the live tail.
    expect(plan!.messageIds).toEqual(["m1", "m2", "m3"]);
    expect(plan!.fromMessageId).toBe("m1");
    expect(plan!.toMessageId).toBe("m3");
    expect(plan!.absorbedSummaryIds).toEqual([]);
  });

  it("never empties the live tail — at least one message stays as the LLM's prompt anchor", () => {
    const plan = planCompression(tail, null, 100_000);
    expect(plan).not.toBeNull();
    // Even with a massive target, the plan stops short of the last message.
    expect(plan!.messageIds).not.toContain("m4");
  });

  it("records absorbedSummaryIds when there's already a latest summary", () => {
    const plan = planCompression(tail, "summary-prev", 250);
    expect(plan?.absorbedSummaryIds).toEqual(["summary-prev"]);
  });
});
