/**
 * Chat router — ONE grounded tool-loop (chat-unified-tool-loop).
 *
 * Every incoming user message runs the same path: the grounded loop in
 * `runRagPipeline` (GroundX search → grounded prompt → LLM with the server-tool
 * catalog → citations). There is no pre-flight mode classifier and no light-LLM
 * planner picking a handler. Capability is carried by TOOLS inside the loop —
 * navigation intents, `get_account_info` (app-state facts), and
 * `lookup_groundx_knowledge` (product knowledge) — so behavior is never gated by
 * a guessed "mode". The former `structured` / `hybrid` modes are folded into
 * this single loop; `reply.mode` still reports "rag" and the wire schema keeps
 * the `ChatMode` value for one release.
 *
 * §1 of 2026-05-31-core-data-followups split the original 1600-line
 * implementation into cohesive modules. This file is now a thin composition
 * layer: it owns `routeChat` (the single entry point) and re-exports the public
 * surface from the sub-modules so existing `from "./chatRouter.js"` imports
 * resolve to the SAME bindings — one source of truth.
 *
 *   - chatRouterTypes.ts — wire types, shared constants, envelope schema, error.
 *   - groundxSearch.ts   — `searchGroundX` + filter composition.
 *   - ragPipeline.ts     — grounded search → prompt → LLM (tool-loop) → citations.
 */

// chat-unified-tool-loop — the body needs only the grounded loop entry
// (`runRagPipeline`) and the wire types. The mode classifier, the light-LLM
// planner (`planTurn`/RoutePlan/TurnPlan), and the structured/hybrid handlers
// are no longer part of the routing decision. The public surface below still
// re-exports the classifier + search helpers straight from their sub-modules
// (self-contained `export … from` statements — no local import needed) so
// existing `from "./chatRouter.js"` importers keep resolving to the SAME bindings.
import { runRagPipeline } from "./ragPipeline.js";
import {
  type ChatRouterDeps,
  type ChatRouterRequest,
  type ChatRouterResponse,
} from "./chatRouterTypes.js";

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

export { searchGroundX, type SearchGroundXOptions } from "./groundxSearch.js";
export { parseGroundedAnswer, buildSnippetBlock } from "./ragPipeline.js";

/**
 * Route a request through the appropriate mode and produce the
 * typed response. Every mode runs the live path (RAG search + grounded
 * LLM, or the structured/hybrid handlers) — there is no mock/dev path;
 * tests inject fake clients at the dependency seam.
 */
export async function routeChat(request: ChatRouterRequest, deps: ChatRouterDeps): Promise<ChatRouterResponse> {
  // chat-unified-tool-loop — ONE grounded tool-loop is the only answer path.
  // No pre-flight mode classifier and no planner: the loop carries the full
  // tool catalog (navigation + the account/product reader tools), the
  // workspace-state context (injected in `runRagPipeline`), and a default
  // up-front document search. So navigation works on EVERY turn regardless of
  // phrasing; account facts answer via `get_account_info`; GroundX-product
  // questions via `lookup_groundx_knowledge` — capability is never gated by a
  // guessed mode. The fixed turn plan is the planner's replacement (D4):
  // document search ON, product knowledge OFF (it's a tool now), extraction
  // context ON. `reply.mode` reports "rag" (the single path); the wire schema
  // keeps the value for one release. Explicit UI intent hints no longer pick a
  // handler — the one loop serves them all.
  return runRagPipeline(request, deps, {
    turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: true },
  });
}
