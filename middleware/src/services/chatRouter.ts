/**
 * Three-mode chat router (per project_llm_runtime.md).
 *
 * Routes an incoming user message to the right pipeline. Since
 * turn-router-extraction-appstate the mode comes from, in order: an
 * explicit UI intent hint (deterministic, free, authoritative) → the light-
 * LLM RoutePlan's `appState`×`documentSearch` derivation → the keyword
 * classifier (`classifyChatMode`) as the deterministic fallback. Modes:
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
 */

import { runHybridQuery, runStructuredQuery } from "./structuredHandler.js";
import { classifyChatMode, modeFromIntent } from "./chatClassifier.js";
import { searchGroundX } from "./groundxSearch.js";
import { runRagPipeline } from "./ragPipeline.js";
import {
  CLASSIFIER_DECIDES,
  FALLBACK_ROUTE_PLAN,
  FALLBACK_TURN_PLAN,
  planTurn,
  type RoutePlan,
  type TurnPlan,
} from "./turnRouter.js";
import {
  ChatRouteNotImplementedError,
  type ChatMode,
  type ChatRouterDeps,
  type ChatRouterRequest,
  type ChatRouterResponse,
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
 * typed response. Every mode runs the live path (RAG search + grounded
 * LLM, or the structured/hybrid handlers) — there is no mock/dev path;
 * tests inject fake clients at the dependency seam.
 */
export async function routeChat(request: ChatRouterRequest, deps: ChatRouterDeps): Promise<ChatRouterResponse> {
  // turn-router-extraction-appstate — planner-derived mode routing.
  // 1. An explicit UI intent hint is authoritative, deterministic, and free:
  //    it picks the mode WITHOUT a planner call. A hinted rag turn plans its
  //    retrieval inside the grounded seam exactly as before (still at most
  //    one planner call per turn).
  // 2. Otherwise the RoutePlan's appState×documentSearch derives the mode;
  //    the seam plan (appState stripped) threads to the rag path so the seam
  //    never plans a second time.
  // 3. The CLASSIFIER_DECIDES sentinel (planner absent/failed) routes via
  //    the deterministic keyword classifier — byte-for-byte the pre-flag
  //    behavior. The keyword heuristics never run when the planner answered.
  const hinted = modeFromIntent(request);
  let mode: ChatMode;
  let threadedPlan: TurnPlan | undefined;
  if (hinted) {
    mode = hinted;
  } else {
    const routePlan: RoutePlan = deps.planTurn
      ? await deps.planTurn(request.newUserMessage)
      : deps.lightLlmClient && deps.lightLlmModelId
        ? await planTurn(request.newUserMessage, {
            lightLlmClient: deps.lightLlmClient,
            lightLlmModelId: deps.lightLlmModelId,
          })
        : FALLBACK_ROUTE_PLAN;
    const { appState, ...seamPlan } = routePlan;
    if (appState === CLASSIFIER_DECIDES) {
      mode = classifyChatMode(request);
      threadedPlan = seamPlan;
    } else if (appState) {
      mode = routePlan.documentSearch ? "hybrid" : "structured";
      if (!deps.repository || !deps.chatSessionId) {
        // Planner-routed structured/hybrid without session deps DEGRADES to
        // rag on the deterministic seam fallback (search ON — never the
        // planner's documentSearch:false, which would ground the answer in
        // nothing). Keyword/intent-routed turns keep the throwing behavior.
        mode = "rag";
        threadedPlan = FALLBACK_TURN_PLAN;
      }
    } else {
      mode = "rag";
      threadedPlan = seamPlan;
    }
  }

  if (mode === "rag") {
    return runRagPipeline(request, deps, threadedPlan ? { turnPlan: threadedPlan } : undefined);
  }

  // Structured + hybrid: lightweight live wiring via structuredHandler.
  // The framework dispatches by sub-query kind; each sub-handler either
  // returns a real answer (for the kinds whose data readers ARE built —
  // pages_remaining, onboarding_state, current_entity) or a frank
  // "needs reader" reply (for saved_schemas / my_projects / api_keys
  // until those tables/Partner reads land). This gives us a real surface
  // in production without fabricating answers.
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
  // Hybrid (chat-architecture-hardening Task 3): the grounded seam owns the
  // ONLY search — the former router-side hybrid search is deleted (no double
  // search). The handler composes workspace state into the seam's
  // structuredContext block and applies the citation contract.
  const scope: ContentScope | null =
    deps.contentScope ??
    (deps.samplesBucketId != null
      ? { type: "bucket", bucketId: deps.samplesBucketId }
      : null);
  return runHybridQuery(request, {
    ...structuredDeps,
    // CF-05: chat-profile LLM composes the answer. Hybrid is user-facing —
    // quality matters more than cost.
    llmClient: deps.llmClient,
    llmModelId: deps.llmModelId,
    groundxClient: deps.groundxClient,
    groundxApiKey: deps.groundxApiKey,
    contentScope: scope,
    ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
    ...(deps.quoteEmbedder ? { quoteEmbedder: deps.quoteEmbedder } : {}),
    ...(deps.embedThreshold !== undefined ? { embedThreshold: deps.embedThreshold } : {}),
  });
}
