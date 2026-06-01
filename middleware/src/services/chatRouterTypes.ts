/**
 * Wire types + shared constants for the three-mode chat router.
 *
 * Extracted from `chatRouter.ts` (§1 of 2026-05-31-core-data-followups —
 * behavior-preserving split of a 1600-line file). This module owns the
 * router's request/response contracts, the dev-only debug payload shape, the
 * LLM proposal envelope schema, the not-implemented error, and the handful of
 * tuning constants shared between the search and RAG-pipeline modules.
 *
 * `chatRouter.ts` re-exports everything here so existing
 * `from "./chatRouter.js"` imports resolve to the SAME bindings.
 */

import { z } from "zod";

import type { AppRepository, GroundXClient, GroundXPartnerClient, LlmClient } from "../types.js";

import type { NormalizedBbox, WordMap } from "./citationGeometry.js";
// Canonical Citation now lives in the shared wire contract (`@groundx/shared`,
// schema-as-source-of-truth). Import for local use + re-export so existing
// middleware imports (`Citation` from "./chatRouter.js") keep resolving. The
// shared shape is identical: documentId, page, snippet?, bbox? (NormalizedBbox),
// tier? (CitationTier), confidence?, answerSpan?.
import {
  ApiError,
  type ChatMode as SharedChatMode,
  type ChatReply as SharedChatReply,
  type ChatReplyDebug as SharedChatReplyDebug,
  type ChatScopeHint,
  type Citation,
  type ContentScope,
  type DispatchedIntent as SharedDispatchedIntent,
  type ProposalEnvelopeProvenance,
  type ProposedSchemaField,
  type SuggestedAction,
  type ToolFailure as SharedToolFailure,
  type WidgetRole,
} from "@groundx/shared";

export type { Citation };
// 2026-05-31-core-data-followups §4 #13 — the middleware `SuggestedAction` was a
// byte-identical fork of the shared chip shape; re-export the ONE shared type so
// the wire twin cannot drift. Local importers (`chatRouter`, `ragPipeline`) keep
// the `SuggestedAction` name unchanged.
export type { SuggestedAction };

/**
 * `proposal-envelope-provenance`: Zod schema for the LLM's
 * `proposedSchemaField` envelope. The frontend renders a `proposal_v1
 * · envelope verified` label that's only valid when the server-side
 * parser successfully accepted the structured output via this schema.
 *
 * `version` is optional with a v1 default for backwards-compat with
 * pre-envelope fixtures; an explicit non-v1 version is REJECTED so a
 * future v2 envelope can't accidentally be processed by a v1 parser.
 */
export const proposalEnvelopeV1Schema = z
  .object({
    version: z.literal("v1").optional(),
    categoryId: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["STRING", "NUMBER", "DATE", "BOOLEAN"]),
    description: z.string().min(1),
  })
  .strict();

// 2026-05-31-chat-wire-types-shared — the chat mode + reply envelope wire
// shapes are single-sourced on `@groundx/shared`; re-export so local importers
// (`chatRouter`, `ragPipeline`, `chatHandler`) keep their names unchanged. The
// `Eq<Local, Shared>` guards live in `chatRouter.split.test.ts`.
export type ChatMode = SharedChatMode;

export interface ChatRouterRequest {
  newUserMessage: string;
  currentEntityKey: string | null;
  /**
   * Compact representation of the conversation tail. The actual
   * messages + summary read paths differ for anon vs signed-in users
   * (see project_chat_session_model.md), but the router only needs
   * the surface count + a tail snippet for classification.
   */
  conversationTail: { messageCount: number; lastTurnContent: string | null };
  recentViewerEvents: { action: string; entityKey: string | null }[];
  /**
   * Optional friendly hint about what the user is currently looking
   * at. Threaded from the frontend (it has the scenario manifest +
   * filename in hand) so the grounded LLM prompt can name the doc
   * even when GroundX search returns zero snippets. Without this,
   * the model only sees "no snippets" and can't suggest alternative
   * questions tied to the active doc.
   */
  scopeHint?: ChatScopeHint;
  /**
   * RT-04 — the persisted canvas-orchestrator intent for THIS chat
   * session (from `chat_sessions.current_intent_json`). Updated via
   * PATCH /api/chat-sessions/:id whenever the user navigates the
   * canvas. Routing classifiers can read this to short-circuit
   * intent inference; LLM prompt assembly can include it as part
   * of the active-entity context.
   *
   * Independent of `intent` above: `intent` is the per-turn hint
   * the UI passes on send (e.g. "the user clicked an extract
   * field"); `currentIntent` is the persisted "what view is
   * currently mounted" state.
   */
  currentIntent?: Record<string, unknown> | null;
  /**
   * Optional intent hint from the canvas orchestrator (e.g.
   * extract.field-hovered, smart.report). Lets the router skip
   * classification when the UI has already signalled the mode.
   */
  intent?: string | null;
  /**
   * widget-llm-integration Phase 5 — the active ViewerStep kind the
   * user is currently on (mirrors `ViewerStep["kind"]` from the app
   * side). When present, the tool catalog sent to the LLM is filtered
   * to tools whose `availableSteps` include this kind. When omitted,
   * the full catalog is sent.
   */
  activeStepKind?: string | null;
  /**
   * 2026-05-31-tool-system-completion — the caller's AUTHORIZATION role,
   * derived SERVER-side in `chatHandler.ts` from the chat session
   * (`session.ownerUserId` present → "member", else "anonymous"). NEVER taken
   * from the client. The tool catalog sent to the LLM is role-filtered:
   * `toolsForStep(activeStepKind, callerRole)` exposes a tool IFF its
   * `availableIn` admits this role (absent/empty → all roles). When omitted
   * (legacy callers / non-RAG paths), the role filter is a no-op and the full
   * per-step catalog is sent — but the production path (chatHandler) always
   * supplies it.
   */
  callerRole?: WidgetRole;
}

// 2026-05-31-core-data-followups §4 #18 — the proposal-envelope wire shapes
// (`ProposedSchemaField` + `ProposalEnvelopeProvenance`) were declared on BOTH
// sides of the wire and had silently DRIFTED on `provenance`'s optionality
// (this side required it; the app side made it optional). They are now
// single-sourced on `@groundx/shared`; re-export so local importers
// (`chatRouter`, `ragPipeline`) keep their names. The middleware always WRITES
// a present provenance, so the unified-optional shape is runtime-identical here.
export type { ProposalEnvelopeProvenance, ProposedSchemaField };

// 2026-05-31-chat-wire-types-shared — the dev-only debug payload, the
// per-tool-call `DispatchedIntent` / `ToolFailure`, and the chat response body
// (`ChatRouterResponse`) were byte-twins of the app `ChatReplyDebug` /
// `ChatDispatchedIntent` / `ChatToolFailure` / `ChatReply`. They now re-export
// the ONE `@groundx/shared` source under the `Eq<>` guards in
// `chatRouter.split.test.ts`; the local names are kept as aliases so every
// `from "./chatRouter.js"` importer (chatHandler, ragPipeline) is unchanged.
// `ChatRouterDebug.scope` is now the shared `ContentScope` (LOW debug-scope
// literal twin closed).
export type ChatRouterDebug = SharedChatReplyDebug;
export type DispatchedIntent = SharedDispatchedIntent;
export type ToolFailure = SharedToolFailure;
export type ChatRouterResponse = SharedChatReply;

export interface ChatRouterDeps {
  llmClient: LlmClient;
  /**
   * GroundX client for document search (RAG path). Optional because
   * non-RAG paths don't need it; MOCK_MODE skips entirely.
   */
  groundxClient?: GroundXClient;
  /**
   * GroundX API key the live RAG search should authenticate with.
   * Sourced from session.groundxApiKey (customer key after sign-up)
   * OR env.GROUNDX_PARTNER_API_KEY (samples bucket access for
   * anonymous visitors) by the caller. Required when not in mockMode.
   */
  groundxApiKey?: string;
  /**
   * Bucket id to search against — typically the customer's primary
   * bucket, OR the samples bucket id for anonymous onboarding flows.
   * Legacy single-bucket-only path; new code should pass `contentScope`.
   */
  samplesBucketId?: number | null;
  /**
   * Explicit content scope. Wins over `samplesBucketId` when supplied.
   * The chatHandler derives this from the active entity / current
   * intent / project membership; the chatRouter doesn't recompute it.
   */
  contentScope?: ContentScope | null;
  /** Provider model id for the LLM call, e.g. "gpt-4o" or "claude-3-haiku". */
  llmModelId?: string;
  mockMode: boolean;
  /**
   * Repository for structured/hybrid mode handlers (which read
   * chat session + entity rows). Required for those modes outside
   * MOCK_MODE; RAG-only deployments can omit.
   */
  repository?: AppRepository;
  /** chatSessionId — needed by structured/hybrid mode for context reads. */
  chatSessionId?: string;
  /** Signed-in user, if any. Passed to per-subkind structured readers. */
  groundxUsername?: string | null;
  /** BYO free-tier page budget for the "pages_remaining" structured answer. */
  byoPagesLimit?: number;
  /**
   * CF-04: Partner API client. Required for the structured my_projects
   * + api_keys sub-handlers; optional for everything else (RAG path,
   * MOCK_MODE, structured queries that read app DB only).
   */
  partnerClient?: GroundXPartnerClient;
  /**
   * CF-03: server-derived RBAC / tenant / region / etc. filter. Layered
   * onto the scope filter via `$and` inside `searchGroundX`. The BFF
   * derives it from the session (NEVER from client input); when no
   * RBAC system is configured, callers leave this undefined and the
   * scope filter dispatches unchanged.
   */
  rbacFilter?: Record<string, unknown>;
  /**
   * WF-05b word-level geometry seam. Fetches a document's `-118-map.json`
   * word-map (cached per doc, best-effort `null`). Defaults to the live
   * `fetchDocumentWordMap`; tests inject a fixture. Used ONLY for citations
   * whose verbatim quote already verified, to upgrade them to the `exact`
   * tier with a tight word-level bbox.
   */
  wordMapFetch?: (
    client: GroundXClient,
    apiKey: string,
    documentId: string,
  ) => Promise<WordMap | null>;
}

/**
 * Thrown when routeChat classifies a request into a mode that isn't
 * wired live yet (structured / hybrid). The chatHandler maps this to
 * HTTP 501 so the client can distinguish "we don't support this yet"
 * from "the upstream broke" (502) or "you don't have access" (401).
 *
 * Replaces the previous silent fallback to mock responses in non-MOCK
 * mode — that path returned plausible-looking but fake data in
 * production, which is worse than failing fast.
 */
export class ChatRouteNotImplementedError extends ApiError {
  readonly mode: ChatMode;
  constructor(mode: ChatMode) {
    super(`chat mode '${mode}' is not wired for live use yet`, 501);
    this.name = "ChatRouteNotImplementedError";
    this.mode = mode;
  }
}

/**
 * Single snippet returned by the GroundX search result list. The
 * fields we care about for grounded prompting + citation rendering.
 */
export interface GroundXSearchResult {
  documentId: string;
  pageNumber?: number;
  text?: string;
  score?: number;
  fileName?: string;
  /** WF-03 — normalized 0-1 bbox of the cited region, read off the result. */
  bbox?: NormalizedBbox;
}

// ────────────────────────────────────────────────────────────────────
// Shared tuning constants (used by groundxSearch + ragPipeline)
// ────────────────────────────────────────────────────────────────────

export const RAG_SEARCH_LIMIT = 6;
export const RAG_SNIPPET_CHARS = 600;
/**
 * Relevance floor for the zero-result retry. GroundX's default relevance
 * threshold is 10; extract-workflow-indexed documents store their searchable
 * text as extraction JSON, which scores NEGATIVE against natural-language
 * queries (e.g. "what is the total amount" → ~-30 on the Utility sample), so
 * the default floor filters every chunk out and the LLM correctly answers
 * "no snippets." When the first search returns nothing we retry once with
 * this low floor so the doc still grounds an answer. Env-overridable.
 */
export const RAG_FALLBACK_RELEVANCE = Number(process.env.GROUNDX_RAG_FALLBACK_RELEVANCE ?? -100);
/**
 * CF-06 token-budget guard. Caps the assembled snippet block fed to
 * the grounded LLM so a long document set can't blow past the context
 * window. With `RAG_SEARCH_LIMIT = 6` snippets × `RAG_SNIPPET_CHARS =
 * 600`, the natural worst case is ~3600 chars; this cap is set a hair
 * above that as a hard ceiling. When snippets exceed the cap, trailing
 * ones are dropped (the search ranking puts most-relevant first).
 *
 * Conservatively sized for ~1.2k tokens at 4 chars/token. Tune
 * upward via deps when wiring smaller-context models if cost permits.
 */
export const MAX_SNIPPET_BLOCK_CHARS = 4800;

/**
 * CF-06 refusal calibration. When the snippets don't contain the
 * answer, the grounded LLM is instructed to reply with this exact
 * phrase rather than hedge or invent. Exporting the constant so client
 * UIs can pattern-match the refusal and render a distinct UX (e.g. a
 * "try another question" affordance) — and so tests can assert the
 * round-trip.
 */
export const GROUNDED_REFUSAL_PHRASE =
  "I can't answer that from the documents I have.";

/**
 * CF-07: confidence floor for surfacing a suggested-intent chip. Below
 * this the chip is suppressed — a low-confidence guess is more
 * disruptive than a missed suggestion. 0.85 matches the locked decision
 * in `project_chat_session_model.md`.
 */
export const SUGGESTED_INTENT_THRESHOLD = 0.85;

export interface SuggestedIntent {
  intent: string;
  confidence: number;
  reason: string;
}

/**
 * CF-06 — structured citation entry the LLM emits in its JSON block
 * to declare exactly which snippet(s) it used. The chatRouter
 * validates each entry's `documentId` against the snippet set it
 * actually sent the LLM, so the model can't invent references.
 */
export interface StructuredCitation {
  documentId: string;
  page: number;
  quote: string;
  /** WF-06 — the claim in the answer this quote supports (Bridge B). Optional. */
  answerSpan?: string;
}

export interface ParsedRagAnswer {
  /** The LLM's answer with any fenced JSON block removed. */
  cleanedAnswer: string;
  /** Parsed `suggestedIntent` if emitted + well-formed (CF-07). */
  suggestedIntent: SuggestedIntent | null;
  /** Parsed `citations` array if emitted + well-formed (CF-06). */
  structuredCitations: StructuredCitation[] | null;
  /**
   * UI-01 Phase 2a — parsed `proposedSchemaField` if emitted +
   * well-formed (categoryId, name, type ∈ {STRING|NUMBER|DATE|BOOLEAN},
   * description all present + string-valued except `type`). Anything
   * malformed reduces to null so the frontend never sees a half-built
   * card.
   */
  proposedSchemaField: ProposedSchemaField | null;
}

/**
 * widget-llm-integration Phase 5 — raw LLM tool call as parsed from
 * the upstream provider response. The router validates these against
 * the server tool catalog before exposing them on the chat reply.
 */
export interface RawToolCall {
  id: string;
  name: string;
  /** Raw JSON string emitted by the LLM. Unparsed at this layer. */
  argumentsJson: string;
}
