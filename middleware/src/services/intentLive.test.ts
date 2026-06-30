import { beforeAll, describe, expect, it } from "vitest";

import { intentCatalog } from "@groundx/shared/intent-catalog";

import { loadEnv } from "../config/env.js";
import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { ChatSessionRecord, GroundXClient, LlmClient } from "../types.js";

import { handleChatMessage } from "./chatHandler.js";
import { FetchGroundXClient } from "./groundxClient.js";
import { FetchLlmClient } from "./llmClient.js";
import { getServerTool } from "./toolCatalog.js";

/**
 * On-demand live-LLM intent suite (audit-chat-intent-coverage, T5).
 *
 * Sends each LLM-emittable intent's catalog `prompt` to a REAL model and
 * asserts the reply emits that intent's kind. NEVER runs in the default gate:
 * gated on `INTENT_LIVE`.
 *   • unset            → the whole live suite is skipped (no real call).
 *   • INTENT_LIVE=1|all → every emittable kind.
 *   • INTENT_LIVE=<kind>→ just that one intent (on-demand single).
 *
 * The model is nondeterministic, so each case asserts the emitted intent KIND
 * (not answer text) with a bounded retry. The `live-coverage guard` below runs
 * in the DEFAULT suite (pure data check, no LLM) so prompt coverage can't drift.
 */

const emittable = intentCatalog.filter(
  (e): e is typeof e & { llm: { toolName: string; prompt?: string; liveSingleTurn?: false; liveNote?: string } } =>
    e.llm !== false,
);

// ── live-coverage guard (DEFAULT suite — no LLM) ─────────────────────
describe("live-coverage guard", () => {
  it("every LLM-emittable catalog entry has a non-empty live prompt", () => {
    const missing = emittable.filter((e) => !e.llm.prompt || e.llm.prompt.trim().length === 0).map((e) => e.kind);
    expect(missing).toEqual([]);
  });

  it("the emittable set equals the set of tools with an intentBuilder", () => {
    // Every emittable entry maps to a real intent-bearing tool, and no
    // non-emittable kind sneaks a tool in. (Cross-checks the catalog vs the
    // server tool registry — the LLM/non-LLM boundary.)
    const notReal = emittable.map((e) => e.llm.toolName).filter((name) => !getServerTool(name));
    expect(notReal).toEqual([]);
  });

  it("every NOT-single-turn entry documents WHY (no silent skip)", () => {
    const undocumented = emittable
      .filter((e) => e.llm.liveSingleTurn === false && !e.llm.liveNote?.trim())
      .map((e) => e.kind);
    expect(undocumented).toEqual([]);
  });
});

// ── on-demand live suite (gated) ─────────────────────────────────────
const LIVE = process.env.INTENT_LIVE?.trim();
const liveAll = LIVE === "1" || LIVE === "all";
const selected = emittable.filter((e) => liveAll || e.kind === LIVE);
// Skip cleanly (don't fail) when opted-in but credentials are absent.
const hasLiveCreds = Boolean(process.env.LLM_API_KEY && process.env.GROUNDX_PARTNER_API_KEY);
const runLive = Boolean(LIVE) && selected.length > 0 && hasLiveCreds;

function makeSession(): ChatSessionRecord {
  const now = new Date();
  return {
    id: "chat-1",
    onboardingSessionId: "onb-1",
    ownerUserId: null,
    ownerAnonId: "anon-1",
    title: "Onboarding",
    isOnboarding: true,
    activeEntityKey: null,
    currentIntent: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

(runLive ? describe : describe.skip)("on-demand live-LLM intent suite", () => {
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;
  let groundxApiKey: string | null;
  let samplesBucketId: number | null;
  let llmModelId: string;

  beforeAll(() => {
    const env = loadEnv();
    llmClient = new FetchLlmClient(env);
    groundxClient = new FetchGroundXClient(env);
    groundxApiKey = env.GROUNDX_PARTNER_API_KEY ?? null;
    samplesBucketId = env.GROUNDX_SAMPLES_BUCKET_ID ?? null;
    llmModelId = env.LLM_MODEL_ID ?? "unknown";
  });

  for (const entry of selected) {
    const tool = getServerTool(entry.llm.toolName);

    // Intents that need prior conversational context (a pending proposal, a
    // prior answer to pin) can't be elicited in a single fresh-session turn —
    // skip them VISIBLY with the reason. They stay covered by the FE replay +
    // middleware corpus.
    if (entry.llm.liveSingleTurn === false) {
      it.skip(`${entry.kind} — live-skipped: ${entry.llm.liveNote}`, () => {});
      continue;
    }

    it(`${entry.kind} — real model emits the intent`, async () => {
      let emitted = false;
      // Bounded retry — the model is nondeterministic.
      for (let attempt = 0; attempt < 3 && !emitted; attempt += 1) {
        const repo = new MemoryAppRepository();
        await repo.upsertChatSession(makeSession());
        const { reply } = await handleChatMessage(
          { chatSessionId: "chat-1", newUserMessage: entry.llm.prompt! },
          { repository: repo, llmClient, groundxClient, groundxApiKey, samplesBucketId, llmModelId },
        );
        if (tool?.category === "read") {
          emitted = reply.intents.some((i) => (i.intent as { kind?: string }).kind === entry.kind);
        } else {
          emitted = reply.suggestedActions.some(
            (a) => a.key === `tool:${entry.llm.toolName}` && (a.detail?.intent as { kind?: string } | undefined)?.kind === entry.kind,
          );
        }
      }
      expect(emitted, `real model did not emit ${entry.kind} for prompt: "${entry.llm.prompt}"`).toBe(true);
    }, 60_000);
  }
});
