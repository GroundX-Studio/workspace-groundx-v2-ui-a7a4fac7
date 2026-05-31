/**
 * Three-mode chat router (per project_llm_runtime.md).
 *
 * Routes an incoming user message to the right pipeline based on a
 * DETERMINISTIC classifier — not an LLM call. The classification reads
 * the bundled 3-axis context (current entity, conversation tail,
 * recent viewer events) and picks one of:
 *
 *   - "rag"        — user asks about doc content. GroundX search →
 *                    grounded prompt → LLM.
 *   - "structured" — user asks about app state ("saved schemas?",
 *                    "pages remaining?"). Query MySQL / Partner
 *                    directly; LLM only for formatting.
 *   - "hybrid"     — "Explain this sample" / "what can I do?" —
 *                    combines metadata + grounded snippets.
 *
 * §1 of 2026-05-31-core-data-followups split the original 1600-line
 * implementation into cohesive modules. This file is now a thin
 * composition layer: it owns `routeChat` (the entry point that picks a
 * mode + dispatches) and re-exports the public surface from the
 * sub-modules so existing `from "./chatRouter.js"` imports resolve to
 * the SAME bindings — no behavior change, one source of truth.
 *
 *   - chatRouterTypes.ts — wire types, shared constants, envelope schema, error.
 *   - chatClassifier.ts  — the deterministic mode classifier.
 *   - groundxSearch.ts   — `searchGroundX` + filter composition.
 *   - ragPipeline.ts     — grounded search → prompt → LLM → citations.
 *   - chatMocks.ts        — MOCK_MODE canned responses + fixtures.
 */

import { runHybridQuery, runStructuredQuery } from "./structuredHandler.js";
import { classifyChatMode } from "./chatClassifier.js";
import { searchGroundX } from "./groundxSearch.js";
import { runRagPipeline } from "./ragPipeline.js";
import { mockResponseFor } from "./chatMocks.js";
import {
  ChatRouteNotImplementedError,
  type ChatRouterDeps,
  type ChatRouterRequest,
  type ChatRouterResponse,
  type GroundXSearchResult,
} from "./chatRouterTypes.js";

import type { ContentScope } from "@groundx/shared";

// ────────────────────────────────────────────────────────────────────
// Public surface re-exports. Keeps `from "./chatRouter.js"` resolving to
// the SAME bindings the sub-modules export (identity preserved — no fork).
// ────────────────────────────────────────────────────────────────────

export { proposalEnvelopeV1Schema, ChatRouteNotImplementedError } from "./chatRouterTypes.js";
export {
  MAX_SNIPPET_BLOCK_CHARS,
  GROUNDED_REFUSAL_PHRASE,
  SUGGESTED_INTENT_THRESHOLD,
} from "./chatRouterTypes.js";
export type {
  Citation,
  ChatMode,
  ChatRouterRequest,
  SuggestedAction,
  ProposalEnvelopeProvenance,
  ProposedSchemaField,
  ChatRouterDebug,
  DispatchedIntent,
  ToolFailure,
  ChatRouterResponse,
  ChatRouterDeps,
  SuggestedIntent,
  StructuredCitation,
  ParsedRagAnswer,
  RawToolCall,
} from "./chatRouterTypes.js";

export { classifyChatMode } from "./chatClassifier.js";
export { searchGroundX, type SearchGroundXOptions } from "./groundxSearch.js";
export { parseGroundedAnswer, buildSnippetBlock } from "./ragPipeline.js";

/**
 * Route a request through the appropriate mode and produce the
 * typed response. In MOCK_MODE every mode returns a canned envelope
 * so the chat surface can boot in dev without GroundX / LLM
 * credentials.
 */
export async function routeChat(request: ChatRouterRequest, deps: ChatRouterDeps): Promise<ChatRouterResponse> {
  const mode = classifyChatMode(request);

  if (deps.mockMode) {
    return mockResponseFor(mode, request);
  }

  if (mode === "rag") {
    return runRagPipeline(request, deps);
  }

  // Structured + hybrid: lightweight live wiring via structuredHandler.
  // The framework dispatches by sub-query kind; each sub-handler either
  // returns a real answer (for the kinds whose data readers ARE built —
  // pages_remaining, onboarding_state, current_entity) or a frank
  // "needs reader" reply (for saved_schemas / my_projects / api_keys
  // until those tables/Partner reads land). MOCK_MODE bypasses the
  // whole path; this gives us a real surface in production without
  // fabricating answers.
  if (!deps.repository || !deps.chatSessionId) {
    throw new ChatRouteNotImplementedError(mode);
  }
  const structuredDeps = {
    repository: deps.repository,
    chatSessionId: deps.chatSessionId,
    groundxUsername: deps.groundxUsername ?? null,
    byoPagesLimit: deps.byoPagesLimit ?? 100,
    partnerClient: deps.partnerClient,
  };
  if (mode === "structured") {
    return runStructuredQuery(request, structuredDeps);
  }
  // Hybrid: layer structured context onto a thin RAG search. If the
  // RAG side isn't configured, hybrid still produces a useful response
  // (just without grounded snippets).
  let snippets: GroundXSearchResult[] = [];
  if (deps.groundxClient && deps.groundxApiKey) {
    const scope: ContentScope | null =
      deps.contentScope ??
      (deps.samplesBucketId != null
        ? { type: "bucket", bucketId: deps.samplesBucketId }
        : null);
    try {
      snippets = await searchGroundX(
        request.newUserMessage,
        scope,
        deps.groundxClient,
        deps.groundxApiKey,
        { rbacFilter: deps.rbacFilter },
      );
    } catch (err) {
      // Hybrid is best-effort on the RAG side — log + continue with
      // empty snippets rather than 502 the whole request.
      // eslint-disable-next-line no-console
      console.warn("hybrid mode: RAG search failed, proceeding without snippets", err);
    }
  }
  return runHybridQuery(request, {
    ...structuredDeps,
    ragSnippets: snippets,
    // CF-05: chat-profile LLM composes the tour-style answer. Hybrid
    // is user-facing — quality matters more than cost.
    llmClient: deps.llmClient,
    llmModelId: deps.llmModelId,
  });
}
