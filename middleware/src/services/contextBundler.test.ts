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
      activeSummaries: [],
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
    expect(bundle.conversation.activeSummaries).toHaveLength(0);
    expect(bundle.viewerTrail).toHaveLength(0);
  });

  it("estimates tokens across all three axes + the new user message", () => {
    const bundle = bundleChatContext(
      baseInput({
        conversation: {
          activeSummaries: [
            { id: "s1", content: "Summary content ~16 chars", tokensIn: 0, tokensOut: 0 },
          ],
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
    expect(bundle.conversation.activeSummaries[0].id).toBe("s1");
    expect(bundle.conversation.liveTail).toHaveLength(2);
    expect(bundle.currentEntity.entityKey).toBe("sample:utility");
    expect(bundle.viewerTrail).toHaveLength(2);
    expect(bundle.newUserMessage).toBe("what is the total amount due?");
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
  });

  it("counts EVERY active summary against the token budget (multi-summary case)", () => {
    const singleBundle = bundleChatContext(
      baseInput({
        conversation: {
          activeSummaries: [{ id: "s1", content: "x".repeat(400), tokensIn: 0, tokensOut: 0 }],
          liveTail: [],
        },
      }),
    );
    const multiBundle = bundleChatContext(
      baseInput({
        conversation: {
          activeSummaries: [
            { id: "s1", content: "x".repeat(400), tokensIn: 0, tokensOut: 0 },
            { id: "s2", content: "y".repeat(400), tokensIn: 0, tokensOut: 0 },
            { id: "s3", content: "z".repeat(400), tokensIn: 0, tokensOut: 0 },
          ],
          liveTail: [],
        },
      }),
    );
    // 3 summaries should weigh ~3x as much as 1 — proves the bundler
    // accounts for ALL active summaries, not just the latest.
    expect(multiBundle.estimatedTokens).toBeGreaterThanOrEqual(singleBundle.estimatedTokens * 2.5);
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

describe("planCompression (level-1 leaf)", () => {
  const tail: BundleConversationInput["liveTail"] = [
    { id: "m1", role: "user", content: "a".repeat(400) }, // ~100 tokens
    { id: "m2", role: "assistant", content: "b".repeat(400) },
    { id: "m3", role: "user", content: "c".repeat(400) },
    { id: "m4", role: "assistant", content: "d".repeat(400) },
  ];

  it("returns null when there's nothing meaningful to compress (single message)", () => {
    expect(planCompression([tail[0]], 1000)).toBeNull();
  });

  it("collects oldest messages until the target token count is reached", () => {
    const plan = planCompression(tail, 250);
    expect(plan).not.toBeNull();
    expect(plan!.messageIds).toEqual(["m1", "m2", "m3"]);
    expect(plan!.fromMessageId).toBe("m1");
    expect(plan!.toMessageId).toBe("m3");
  });

  it("never empties the live tail — at least one message stays as the LLM's prompt anchor", () => {
    const plan = planCompression(tail, 100_000);
    expect(plan).not.toBeNull();
    expect(plan!.messageIds).not.toContain("m4");
  });

  it("ALWAYS leaves absorbedSummaryIds empty — leaf plans never absorb prior summaries", () => {
    const plan = planCompression(tail, 250);
    expect(plan!.absorbedSummaryIds).toEqual([]);
  });
});
