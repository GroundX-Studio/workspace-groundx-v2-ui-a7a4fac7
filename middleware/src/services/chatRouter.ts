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
 * This file is the contract + a stub implementation. Live wiring of
 * GroundX search calls + token counting + compression triggers comes
 * with the rest of the real-middleware-wiring track; MOCK_MODE
 * returns canned responses so the chat surface can boot today.
 */

import { z } from "zod";

import type { AppRepository, GroundXClient, GroundXPartnerClient, LlmClient } from "../types.js";

import { logger } from "../lib/logger.js";
import {
  bboxForResult,
  parseBoundingBoxes,
  parsePages,
  resolveGeometryFromXray,
  type NormalizedBbox,
} from "./citationGeometry.js";
import { runHybridQuery, runStructuredQuery } from "./structuredHandler.js";
import { assignTier, confidenceFor, verifyQuote } from "./attribution.js";
import { fetchDocumentXray } from "./xrayCache.js";
import { getServerTool, toolsForStep, type ViewerStepKind } from "./toolCatalog.js";
import { toOpenAiTools, type OpenAiFunctionTool } from "./zodToJsonSchema.js";

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

export type ChatMode = "rag" | "structured" | "hybrid";

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
  scopeHint?: {
    fileName?: string | null;
    scenarioTitle?: string | null;
  };
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
}

// Canonical Citation now lives in the shared wire contract (`@groundx/shared`,
// schema-as-source-of-truth). Import for local use + re-export so existing
// middleware imports (`Citation` from "./chatRouter.js") keep resolving. The
// shared shape is identical: documentId, page, snippet?, bbox? (NormalizedBbox),
// tier? (CitationTier), confidence?, answerSpan?.
import { compileScopeFilter, type Citation, type ContentScope, type ScopeFilter } from "@groundx/shared";
export type { Citation };

export interface SuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}

/**
 * UI-01 Phase 2a — schema-field addition proposed by the grounded LLM
 * in response to a user request like "add a field for total tax". The
 * frontend renders this as an Accept/Reject card in the chat live-turn
 * stream; Accept dispatches the ChatStore `addSchemaField` action.
 *
 * Shape mirrors the client-side `SchemaFieldAddition` (minus `id`,
 * which the client mints) so the round-trip is lossless. Type values
 * are restricted to the four supported primitive types — the parser
 * filters anything else out.
 */
export interface ProposalEnvelopeProvenance {
  /** Versioned envelope tag — currently always "v1". */
  version: "v1";
  /** True when the server-side Zod parse succeeded. */
  verified: true;
}

export interface ProposedSchemaField {
  categoryId: string;
  name: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
  description: string;
  /**
   * `proposal-envelope-provenance`: present iff
   * `proposalEnvelopeV1Schema.safeParse` accepted the LLM payload. The
   * frontend renders a `proposal_v<version> · envelope verified` label
   * sourced from this field.
   */
  provenance: ProposalEnvelopeProvenance;
}

/**
 * Dev-only diagnostic payload attached to chat replies in non-prod
 * environments. Surfaces what the chat router actually asked GroundX
 * and what came back, so the user can see (in browser DevTools) why
 * the LLM said "no snippets" — without context-switching to the
 * middleware terminal. NEVER set in production.
 */
export interface ChatRouterDebug {
  mode: ChatMode;
  scope: { type: "bucket" | "group" | "documents"; bucketId?: number; groupId?: number; documentIds?: string[]; filter?: ScopeFilter };
  groundx: {
    /** Full URL path of the GroundX search call (e.g. /v1/search/...) */
    path: string;
    /** The raw query string that was sent — what the model would search for. */
    query: string;
    /** Top-N requested. */
    n: number;
    /** Filter object passed to GroundX (RBAC + scope). */
    filter: unknown;
    /** Number of snippets returned. */
    resultCount: number;
    /** Top-3 snippets (truncated) so the user can verify what came back. */
    topSnippets: Array<{ documentId: string; fileName?: string; score?: number; text?: string }>;
  } | null;
  llm: {
    model: string;
    /** Snippet block char count actually passed to the model. */
    snippetBlockChars: number;
    /** Total user-content chars (snippet block + question + scope hint). */
    userContentChars: number;
    /** System prompt char count. */
    systemChars: number;
    /** Final answer char count. */
    answerChars: number;
  } | null;
}

/**
 * widget-llm-integration Phase 5 — one successful tool call. The
 * frontend looks up the tool by name in the app-side `toolRegistry`,
 * runs the handler with `arguments`, and dispatches the resulting
 * intent via the canvas orchestrator. We also carry the
 * already-constructed `intent` payload (built by the server tool's
 * `intentBuilder`) so the app can dispatch directly without a second
 * handler invocation when it trusts the server.
 */
export interface DispatchedIntent {
  name: string;
  arguments: Record<string, unknown>;
  intent: Record<string, unknown>;
}

/** widget-llm-integration Phase 5 — one failed tool call. */
export interface ToolFailure {
  name: string;
  reason: string;
}

export interface ChatRouterResponse {
  mode: ChatMode;
  answer: string;
  citations: Citation[];
  suggestedActions: SuggestedAction[];
  /** Tool calls the assistant invoked (Phase 7 wire-up). */
  tools: { name: string; arguments: Record<string, unknown> }[];
  /**
   * widget-llm-integration Phase 5 — validated, dispatchable LLM tool
   * calls. The frontend orchestrator routes each entry to its
   * registered intent handler. Empty array when the LLM emitted no
   * tool calls.
   */
  intents: DispatchedIntent[];
  /**
   * widget-llm-integration Phase 5 — tool calls that failed
   * validation (unknown tool name, Zod parse failure, etc.). The
   * frontend can surface these as a "tried to do X but ..." chip;
   * v1 does not auto-retry (design.md §M).
   */
  toolFailures: ToolFailure[];
  /**
   * UI-01 Phase 2a — non-null when the LLM emitted a well-formed
   * `proposedSchemaField` in its fenced JSON block AND the user's
   * turn looked like a schema-add request. The frontend renders an
   * Accept/Reject card inline with the assistant turn; Accept calls
   * the ChatStore `addSchemaField` action.
   */
  proposedSchemaField: ProposedSchemaField | null;
  /**
   * Dev-only diagnostic payload. Present when `NODE_ENV !== "production"`.
   * Lets the browser DevTools console + Network tab show exactly what
   * the chat router asked GroundX and what came back, so users don't
   * need terminal access to debug "why did the LLM say no snippets."
   */
  _debug?: ChatRouterDebug;
}

/**
 * Classify the request into one of the three modes. Deterministic
 * by intent + viewer-event signal + simple string heuristics — NOT
 * an LLM call.
 */
export function classifyChatMode(request: ChatRouterRequest): ChatMode {
  // 1. Explicit intent hint from the UI wins.
  if (request.intent) {
    if (request.intent.startsWith("extract.") || request.intent === "chat.sources" || request.intent === "understand") {
      return "rag";
    }
    if (request.intent === "smart.report" || request.intent === "explain.sample") {
      return "hybrid";
    }
    if (request.intent.startsWith("app.") || request.intent.startsWith("workspace.")) {
      return "structured";
    }
  }

  // 2. Pattern match the message. Structured questions are about the
  //    app/workspace, not document content.
  const msg = request.newUserMessage.toLowerCase();
  const structuredHints = [
    "saved schema",
    "saved schemas",
    "pages remaining",
    "page budget",
    "my workspace",
    "my projects",
    "api key",
    "my account",
    "my subscription",
  ];
  if (structuredHints.some((h) => msg.includes(h))) return "structured";

  // 3. Open-ended exploratory questions read as hybrid.
  const hybridHints = ["explain this sample", "what can i do", "what is this", "tour"];
  if (hybridHints.some((h) => msg.includes(h))) return "hybrid";

  // 4. Default — assume document-grounded.
  return "rag";
}

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
export class ChatRouteNotImplementedError extends Error {
  readonly mode: ChatMode;
  constructor(mode: ChatMode) {
    super(`chat mode '${mode}' is not wired for live use yet`);
    this.name = "ChatRouteNotImplementedError";
    this.mode = mode;
  }
}

/**
 * Discriminated union for which GroundX search call to make.
 * Mirrors the frontend `ContentScope` type but adds the
 * project-filter case that frontend doesn't surface yet.
 *
 *   bucket    — search a single bucket. Optional projectIds filter:
 *     []        → no filter (whole bucket)
 *     [P]       → single-project filter
 *     [P1, P2]  → multi-project filter ($in)
 *   group     — search a pre-created group of buckets (no filter).
 *   documents — search by explicit documentIds via the doc-search API.
 *
 * For "multi-workspace" usage (the user is looking across N buckets),
 * the caller is responsible for ensure-creating a group of those
 * buckets and passing `{type:"group", groupId}`. Multi-workspace
 * scopes aren't produced by any upstream caller today; the ensure-
 * group helper is tracked in
 * `openspec/specs/chat-routing/spec.md` (Multi-bucket pivots
 * requirement).
 *
 * The scope type itself is the unified `ContentScope` from `@groundx/shared`
 * (was a local `RagContentScope` that diverged on the `kind`/`type`
 * discriminant + a separate `projectIds` field + an `unknown` variant).
 * `projectIds` is now expressed via the composable `filter` (`{projectId:
 * [...]}`); "no derivable scope" is represented by `null` (not a fake variant)
 * and handled explicitly in `searchGroundX`.
 */

/**
 * Single snippet returned by the GroundX search result list. The
 * fields we care about for grounded prompting + citation rendering.
 */
interface GroundXSearchResult {
  documentId: string;
  pageNumber?: number;
  text?: string;
  score?: number;
  fileName?: string;
  /** WF-03 — normalized 0-1 bbox of the cited region, read off the result. */
  bbox?: NormalizedBbox;
}

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

// ────────────────────────────────────────────────────────────────────
// RAG pipeline — live GroundX search → grounded prompt → LLM
// ────────────────────────────────────────────────────────────────────

const RAG_SEARCH_LIMIT = 6;
const RAG_SNIPPET_CHARS = 600;
/**
 * Relevance floor for the zero-result retry. GroundX's default relevance
 * threshold is 10; extract-workflow-indexed documents store their searchable
 * text as extraction JSON, which scores NEGATIVE against natural-language
 * queries (e.g. "what is the total amount" → ~-30 on the Utility sample), so
 * the default floor filters every chunk out and the LLM correctly answers
 * "no snippets." When the first search returns nothing we retry once with
 * this low floor so the doc still grounds an answer. Env-overridable.
 */
const RAG_FALLBACK_RELEVANCE = Number(process.env.GROUNDX_RAG_FALLBACK_RELEVANCE ?? -100);
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

async function runRagPipeline(
  request: ChatRouterRequest,
  deps: ChatRouterDeps,
): Promise<ChatRouterResponse> {
  if (!deps.groundxClient || !deps.groundxApiKey) {
    throw new Error("rag mode: groundxClient + groundxApiKey are required outside MOCK_MODE");
  }
  if (!deps.llmModelId) {
    throw new Error("rag mode: llmModelId is required outside MOCK_MODE");
  }

  // Derive the ContentScope. Callers can override via `deps.contentScope`
  // once the chatHandler wires it from the entity bundle; for now we
  // fall back to the legacy single-bucket scope from env.
  const scope: ContentScope | null =
    deps.contentScope ??
    (deps.samplesBucketId != null ? { type: "bucket", bucketId: deps.samplesBucketId } : null);

  // Dev-only diagnostic accumulator — populated by searchGroundX +
  // callGroundedLlm, surfaced on the chat reply's `_debug` field so
  // the browser DevTools console can show exactly what we asked
  // GroundX + the LLM. NEVER populated in production.
  const debugCapture: { groundx?: ChatRouterDebug["groundx"]; llm?: ChatRouterDebug["llm"] } = {};
  const debugEnabled = process.env.NODE_ENV !== "production";

  const snippets = await searchGroundX(
    request.newUserMessage,
    scope,
    deps.groundxClient,
    deps.groundxApiKey,
    { rbacFilter: deps.rbacFilter, ...(debugEnabled ? { debug: debugCapture } : {}) },
  );

  // widget-llm-integration Phase 5 — assemble the tool catalog
  // (filtered to the active ViewerStep) + advertise it to the LLM via
  // native function calling. The empty-catalog case still sends a
  // `tools: []` so the test surface can assert request shape.
  // NOTE: `as ViewerStepKind` is an unvalidated wire cast (a tracked loose-typing
  // seam). Do NOT "fix" it by `safeParse → undefined` fallback: `toolsForStep(undefined)`
  // returns the FULL catalog, but a present-but-invalid kind goes through the
  // filter and returns the safe unrestricted-only set — so the naive validation
  // WIDENS the tool surface for bogus input. A proper fix needs `toolsForStep` to
  // express "unknown step → safe minimum" first. Tracked separately.
  const catalog = toolsForStep(request.activeStepKind as ViewerStepKind | undefined);
  const openAiTools: OpenAiFunctionTool[] = toOpenAiTools(catalog);

  const llmResponse = await callGroundedLlm(
    request.newUserMessage,
    snippets,
    deps.llmClient,
    deps.llmModelId,
    request.scopeHint,
    debugEnabled ? debugCapture : undefined,
    openAiTools,
  );

  // widget-llm-integration Phase 5 — validate each emitted tool_call
  // against the server catalog. Successful calls land on
  // `intents[]`; failures (unknown name / bad args) land on
  // `toolFailures[]`. Per design.md §M, v1 surfaces failures
  // without auto-retry.
  // widget-llm-integration Phase 8 — category-aware routing.
  // Read-category tools auto-dispatch via `intents[]`. Mutate-category
  // tools surface as confirmable chips on `suggestedActions[]` (per
  // design.md §C — state-mutating actions are user-confirmed by
  // default). The mutate buffer below is flushed into the
  // `suggestedActions` array after the "show-source" + legacy
  // `suggested-intent` chips are seeded.
  const intents: DispatchedIntent[] = [];
  const toolFailures: ToolFailure[] = [];
  const mutateChips: SuggestedAction[] = [];
  for (const call of llmResponse.toolCalls) {
    const tool = getServerTool(call.name);
    if (!tool) {
      toolFailures.push({ name: call.name, reason: `unknown tool name "${call.name}"` });
      continue;
    }
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(call.argumentsJson);
    } catch {
      toolFailures.push({ name: call.name, reason: "arguments_not_valid_json" });
      continue;
    }
    const parseResult = tool.inputSchema.safeParse(parsedArgs);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      toolFailures.push({ name: call.name, reason: `invalid arguments — ${issues}` });
      continue;
    }
    const intentPayload = tool.intentBuilder(parseResult.data);
    if (tool.category === "mutate") {
      // Surface as a chip the user must click to confirm. The label
      // is the first sentence of the tool description (terminated at
      // the first ".", "?", or "!") so the chat row stays compact.
      const firstSentenceMatch = tool.description.match(/^[^.?!]+[.?!]?/);
      const label = (firstSentenceMatch?.[0] ?? tool.description).trim();
      mutateChips.push({
        key: `tool:${call.name}`,
        label,
        detail: {
          name: call.name,
          arguments: parseResult.data as Record<string, unknown>,
          intent: intentPayload,
        },
      });
    } else {
      intents.push({
        name: call.name,
        arguments: parseResult.data as Record<string, unknown>,
        intent: intentPayload,
      });
    }
  }

  // Parse the LLM's optional JSON block. Post-A.5 (follow-up
  // 2026-05-28) this only extracts `citations` — `suggestedIntent`
  // + `proposedSchemaField` ship via `tool:*` chips now.
  const parsed = parseGroundedAnswer(llmResponse.answer);
  const suggestedActions: ChatRouterResponse["suggestedActions"] = [
    { key: "show-source", label: "Show source" },
  ];
  // widget-llm-integration follow-up A.5 — the legacy
  // `suggested-intent` chip emit is gone. `tool:suggest_intent`
  // chips arrive via the mutateChips buffer below.
  // Phase 8 — append every mutate-tool chip AFTER the legacy chips so
  // the existing "show-source" / "suggested-intent" rendering order is
  // preserved. Frontend `SuggestedActionChips` renders in array order.
  for (const chip of mutateChips) suggestedActions.push(chip);

  // widget-llm-integration follow-up A.4 (2026-05-28) — back-compat
  // shim: when the LLM emits a `propose_schema_field` tool call,
  // mirror the validated payload onto `reply.proposedSchemaField`
  // so consumers that still read the legacy field (ChatColumn,
  // ExtractView) keep working through the one-release shim window.
  // A.5 deletes this once consumers migrate.
  let proposedSchemaFieldShim: ProposedSchemaField | null = null;
  const proposeChip = mutateChips.find((c) => c.key === "tool:propose_schema_field");
  if (proposeChip) {
    const args = proposeChip.detail?.arguments as
      | { categoryId: string; name: string; type: ProposedSchemaField["type"]; description: string }
      | undefined;
    if (args) {
      proposedSchemaFieldShim = {
        categoryId: args.categoryId,
        name: args.name,
        type: args.type,
        description: args.description,
        provenance: { version: "v1", verified: true },
      };
    }
  }

  // CF-06 structured citations. When the LLM emitted a citations
  // block AND at least one entry references a documentId that's in
  // our snippet set, use the validated subset as `reply.citations`.
  // Otherwise fall back to the legacy "all snippets become cites"
  // behavior. Cross-checking against the snippet set is the trust
  // boundary — we don't let the LLM invent references.
  const allowedDocIds = new Set(snippets.map((s) => s.documentId));
  const validatedCitations =
    parsed.structuredCitations?.filter((c) => allowedDocIds.has(c.documentId)) ?? [];
  // WF-03 — attach the normalized source-region bbox. For LLM-emitted
  // (validated) citations, look up the matching snippet's geometry by
  // documentId + page; for the ambient fallback, the snippet IS the source.
  const bboxFor = (documentId: string, page: number): NormalizedBbox | undefined =>
    snippets.find((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page)?.bbox;
  const snippetTextFor = (documentId: string, page: number): string =>
    snippets.find((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page)?.text ?? "";
  // WF-06 — graduated attribution. For each LLM-emitted (validated) citation,
  // verify the verbatim `quote` against the chunk it cited and assign a tier
  // + confidence + the supported answer span. The `exact` (word-level) tier
  // needs WF-05's `-118-map` atom box (not built) so it's dormant: a verified
  // quote resolves at `paraphrase` (chunk bbox). The all-snippets fallback has
  // no claim-level proof → `ambient` (source chip; bbox kept for click-to-view).
  const citations: Citation[] =
    validatedCitations.length > 0
      ? validatedCitations.map((c) => {
          const v = verifyQuote(c.quote, snippetTextFor(c.documentId, c.page));
          const tier = assignTier(v, { hasAtomBox: false });
          return {
            documentId: c.documentId,
            page: c.page,
            snippet: c.quote.slice(0, RAG_SNIPPET_CHARS),
            bbox: bboxFor(c.documentId, c.page),
            tier,
            confidence: confidenceFor(v),
            ...(c.answerSpan ? { answerSpan: c.answerSpan } : {}),
          };
        })
      : snippets.map((s) => ({
          documentId: s.documentId,
          page: s.pageNumber ?? 1,
          snippet: s.text ? s.text.slice(0, RAG_SNIPPET_CHARS) : undefined,
          bbox: s.bbox,
          tier: "ambient" as const,
          confidence: 0,
        }));

  return {
    mode: "rag",
    answer: parsed.cleanedAnswer,
    citations,
    suggestedActions,
    tools: [],
    intents,
    toolFailures,
    // widget-llm-integration follow-up A.4 — prefer the back-compat
    // shim from the tool call; fall back to the fenced-JSON parse
    // until A.5 deletes the legacy branch. After A.5, the parsed
    // branch returns null and only the shim path is live.
    proposedSchemaField: proposedSchemaFieldShim ?? parsed.proposedSchemaField,
    ...(debugEnabled
      ? {
          _debug: {
            mode: "rag" as const,
            scope: (scope === null
              ? { type: "documents" }
              : {
                  type: scope.type,
                  ...("bucketId" in scope ? { bucketId: scope.bucketId } : {}),
                  ...("groupId" in scope ? { groupId: scope.groupId } : {}),
                  ...("documentIds" in scope ? { documentIds: scope.documentIds } : {}),
                  ...(scope.filter ? { filter: scope.filter } : {}),
                }) as ChatRouterDebug["scope"],
            groundx: debugCapture.groundx ?? null,
            llm: debugCapture.llm ?? null,
          },
        }
      : {}),
  };
}

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
 * Extract the optional ```json fenced block the grounded LLM may
 * append. Single block; may contain either or both of:
 *
 *   - `suggestedIntent` (CF-07): { intent, confidence, reason }
 *   - `citations`      (CF-06): array of { documentId, page, quote }
 *
 * Robustness:
 *   - No fenced block            → cleanedAnswer = trimmed input, both fields null.
 *   - Block present + malformed  → cleanedAnswer = trimmed input, both fields null
 *                                  (we DON'T strip a broken block since the cleanup
 *                                  heuristic is fragile on partial JSON).
 *   - Block parses but field shape wrong → that field stays null (the other
 *                                  one is still considered independently).
 *   - Citation entries with wrong types are silently filtered; if NO valid
 *     entries remain, `structuredCitations` is null (not `[]`) so callers
 *     can fall back to the GroundX-derived list.
 */
export function parseGroundedAnswer(rawAnswer: string): ParsedRagAnswer {
  // widget-llm-integration follow-up A.5 (2026-05-28) — the
  // fenced-JSON parser used to handle three concerns: `citations`,
  // `suggestedIntent`, and `proposedSchemaField`. The latter two
  // have migrated to native LLM function-calling (see toolCatalog's
  // `suggest_intent` and `propose_schema_field` tools). This
  // parser retains ONLY the `citations` branch — citations are
  // metadata on the answer, not a tool surface. The
  // `suggestedIntent` and `proposedSchemaField` fields on the
  // return type are preserved (always `null`) for one release as a
  // type-shape shim; deprecated, slated for removal.
  const fenceMatch = rawAnswer.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!fenceMatch) {
    return {
      cleanedAnswer: rawAnswer.trim(),
      suggestedIntent: null,
      structuredCitations: null,
      proposedSchemaField: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenceMatch[1]);
  } catch {
    // Malformed JSON — leave the body alone (don't strip the block,
    // since the cleanup heuristic would be fragile on partial JSON).
    return {
      cleanedAnswer: rawAnswer.trim(),
      suggestedIntent: null,
      structuredCitations: null,
      proposedSchemaField: null,
    };
  }

  // citations — filter to well-formed entries (CF-06).
  const citationsRaw = (parsed as { citations?: unknown })?.citations;
  let structuredCitations: StructuredCitation[] | null = null;
  if (Array.isArray(citationsRaw)) {
    const valid = citationsRaw.filter(
      (c): c is StructuredCitation =>
        c != null &&
        typeof c === "object" &&
        typeof (c as StructuredCitation).documentId === "string" &&
        typeof (c as StructuredCitation).page === "number" &&
        typeof (c as StructuredCitation).quote === "string",
    );
    if (valid.length > 0) structuredCitations = valid;
  }

  // Strip the fenced block from the user-facing answer. Collapse any
  // surrounding blank lines so the cleaned answer reads naturally.
  const cleaned = rawAnswer
    .replace(fenceMatch[0], "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    cleanedAnswer: cleaned,
    // Deprecated — always null after A.5; one-release shim.
    suggestedIntent: null,
    structuredCitations,
    // Deprecated — always null after A.5; populated via the
    // tool-call back-compat shim in routeChat. One-release shim.
    proposedSchemaField: null,
  };
}

/**
 * Issue a GroundX search dispatched on `ContentScope` (or `null`). The
 * endpoint is chosen by the scope discriminant; the optional composable
 * `filter` is compiled (shared `compileScopeFilter`) and applied uniformly
 * to ANY shape, then composed with the server-derived `rbacFilter` via $and:
 *
 *   bucket    → POST /v1/search/{bucketId} + {query, n}
 *   group     → POST /v1/search/{groupId}  + {query, n}
 *   documents → POST /v1/search/documents  + {query, n, documentIds: [...]}
 *   null      → POST /v1/search/documents  (doc-wide fallback; logged)
 *
 *   + filter  → adds {filter: <compiled>}  (project/portfolio/fund/folder
 *               filter-fields; single→{field:v}, multi→{$in}, multi-field
 *               →$and). Was bucket+projectIds-only before B1 inc. 3.
 *
 * TODO(CF-19): multi-bucket usage today requires the caller to
 * provide an existing groupId. The "ensure-create group of buckets
 * [B1, B2, …] if none exists" helper lives outside this function;
 * when it lands, the handler can pass `{type:"group", groupId}`
 * after the ensure call. CF-02 + CF-15 closed 2026-05-25 — the
 * scope dispatch + entity-driven scope derivation are live; only
 * the multi-bucket→group helper remains.
 */
/**
 * CF-03: options for layering a server-derived metadata filter (RBAC,
 * tenant, region, etc.) on top of the scope filter. The contract:
 *
 *   - If only the scope produces a filter → use it as-is.
 *   - If only `rbacFilter` is set        → use it as-is.
 *   - If both are present                → compose via `$and: [rbac, scope]`.
 *
 * The `rbacFilter` is ALWAYS server-derived (from session.groundx-
 * Username → org → allowed visibility). It MUST NOT be accepted from
 * the client. This function doesn't enforce that — the caller does, by
 * never plumbing client input into this parameter.
 */
export interface SearchGroundXOptions {
  rbacFilter?: Record<string, unknown>;
  /**
   * Optional dev-only diagnostic accumulator. When passed, searchGroundX
   * populates `debug.groundx` with the final request shape + result
   * summary so callers (chatRouter → chatHandler → /api/chat) can
   * surface it to the browser. Never set in production.
   */
  debug?: { groundx?: ChatRouterDebug["groundx"] };
}

/**
 * Compose two independent filters into one. Returns null when both
 * are absent. Uses Mongo-style `$and` for composition rather than a
 * shallow merge — shallow merge silently drops collisions and
 * collapses any structured logic the caller already encoded.
 */
function composeFilters(
  rbac: Record<string, unknown> | null,
  scope: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!rbac && !scope) return null;
  if (!rbac) return scope;
  if (!scope) return rbac;
  return { $and: [rbac, scope] };
}

export async function searchGroundX(
  query: string,
  scope: ContentScope | null,
  client: GroundXClient,
  apiKey: string,
  options: SearchGroundXOptions = {},
): Promise<GroundXSearchResult[]> {
  let path: string;
  // Body must always include {query, n}; some scopes add fields.
  const body: Record<string, unknown> = { query, n: RAG_SEARCH_LIMIT };

  if (scope === null) {
    // No derivable scope — the chatHandler couldn't resolve an active entity
    // and there's no env samples bucket (early onboarding). Legacy fallback:
    // doc-wide search. Logged so the gap shows in telemetry.
    // eslint-disable-next-line no-console
    console.warn("rag search dispatched with no scope — falling back to /v1/search/documents");
    path = "/search/documents";
  } else {
    switch (scope.type) {
      case "bucket": {
        path = `/search/${scope.bucketId}`;
        break;
      }
      case "group": {
        // Group search has the same shape as bucket search — different
        // resource id, same endpoint. GroundX resolves the group to its
        // member buckets server-side.
        path = `/search/${scope.groupId}`;
        break;
      }
      case "documents": {
        if (scope.documentIds.length === 0) {
          throw new Error("rag scope 'documents' requires at least one documentId");
        }
        path = "/search/documents";
        body.documentIds = scope.documentIds;
        break;
      }
      default: {
        // Exhaustiveness guard — the discriminated union has no other member.
        const _never: never = scope;
        throw new Error(`unreachable scope: ${JSON.stringify(_never)}`);
      }
    }
  }

  // Composable scope filter — applies to EVERY scope shape (project /
  // portfolio / fund / folder filter-fields). Compiled once via the shared
  // `compileScopeFilter` (single→{field:v}, multi→$in, multi-field→$and).
  const scopeFilter = scope ? compileScopeFilter(scope.filter) : null;

  // CF-03: compose rbacFilter with scopeFilter via $and. The two are
  // independent constraints from different sources — never collapse
  // them naively (e.g. spread-merge would silently drop a key
  // collision). $and is the contract GroundX search expects when two
  // independent filters must both match.
  const composed = composeFilters(options.rbacFilter ?? null, scopeFilter);
  if (composed) body.filter = composed;

  // Dev-side full request log so the console shows what we're
  // actually asking GroundX. Query goes through pino's redact paths
  // (the `query` field is on the redact list), so prod logs see
  // [REDACTED] for the prompt itself but keep scope info.
  logger.info(
    {
      groundxSearch: { path, scope: scope?.type ?? "none", bodyKeys: Object.keys(body), query: body.query, n: body.n, filter: body.filter ?? null },
    },
    "groundx search dispatch",
  );

  const runSearch = async (relevanceFloor?: number): Promise<Array<Record<string, unknown>>> => {
    const reqBody = relevanceFloor === undefined ? body : { ...body, relevance: relevanceFloor };
    const response = await client.forward(path, {
      method: "POST",
      apiKey,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "<unreadable>");
      throw new Error(`groundx search failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      search?: { results?: Array<Record<string, unknown>> };
      results?: Array<Record<string, unknown>>;
    };
    return payload.search?.results ?? payload.results ?? [];
  };

  let rawResults = await runSearch();
  // Zero-result retry: extract-indexed docs (searchable text = extraction
  // JSON) score below GroundX's default relevance floor of 10, so a natural
  // query returns nothing and the LLM says "no snippets." Retry once with a
  // low floor to surface the JSON chunks — the grounding prompt already tells
  // the model to read JSON. Normal (prose) docs clear the default floor on
  // the first pass, so they never pay this second round-trip.
  if (rawResults.length === 0 && Number.isFinite(RAG_FALLBACK_RELEVANCE)) {
    logger.info(
      { groundxSearchRetry: { path, query: body.query, fallbackRelevance: RAG_FALLBACK_RELEVANCE } },
      "groundx search: 0 results at default relevance — retrying with low floor",
    );
    rawResults = await runSearch(RAG_FALLBACK_RELEVANCE);
  }
  const mapped: GroundXSearchResult[] = rawResults.map((r) => {
    // WF-03: the deployed API does NOT return a top-level `r.pageNumber`.
    // Page + bbox live in `r.boundingBoxes[]` (px corners + pageNumber) and
    // `r.pages[]` (page dims). Read geometry off the result and normalize.
    const { page, bbox } = bboxForResult(parseBoundingBoxes(r.boundingBoxes), parsePages(r.pages));
    return {
      documentId: typeof r.documentId === "string" ? r.documentId : String(r.documentId ?? ""),
      pageNumber: page,
      bbox: bbox ?? undefined,
      text: typeof r.text === "string" ? r.text : undefined,
      score: typeof r.score === "number" ? r.score : undefined,
      fileName: typeof r.fileName === "string" ? r.fileName : undefined,
    };
  });
  // WF-03 fallback — results that carry NO search-side geometry resolve from
  // the document's X-Ray (cached per doc). Fires ONLY when `bbox` is absent,
  // so the common layout-doc path (geometry already on the result) pays no
  // X-Ray fetch. Best-effort: a failed fetch/parse leaves the citation bare.
  for (const r of mapped) {
    if (r.bbox || !r.text || !r.documentId) continue;
    const xray = await fetchDocumentXray(client, apiKey, r.documentId);
    if (!xray) continue;
    const geo = resolveGeometryFromXray(r.text, xray);
    if (geo) {
      r.pageNumber = geo.page;
      if (geo.bbox) r.bbox = geo.bbox;
    }
  }
  // Result summary for dev visibility (top scores + filenames; we
  // DON'T log full snippet text because it can contain user content
  // and would dominate the log).
  logger.info(
    {
      groundxSearchResult: {
        count: mapped.length,
        topScore: mapped[0]?.score ?? null,
        files: Array.from(new Set(mapped.map((r) => r.fileName).filter(Boolean))).slice(0, 3),
        // Top-3 snippets with truncated text so the log shows what
        // actually came back from GroundX without exploding.
        topSnippets: mapped.slice(0, 3).map((r) => ({
          documentId: r.documentId,
          fileName: r.fileName,
          page: r.pageNumber,
          score: r.score,
          textPreview: (r.text ?? "").slice(0, 240),
        })),
      },
    },
    "groundx search result",
  );
  // Capture dev-side debug snapshot (browser surfaces this via _debug
  // on the chat reply). Only populated when the caller passes
  // `options.debug` — `searchGroundX` doesn't know whether the caller
  // wants diagnostics or not.
  if (options.debug) {
    options.debug.groundx = {
      path,
      query,
      n: typeof body.n === "number" ? body.n : RAG_SEARCH_LIMIT,
      filter: body.filter ?? null,
      resultCount: mapped.length,
      topSnippets: mapped.slice(0, 3).map((r) => ({
        documentId: r.documentId,
        fileName: r.fileName,
        score: r.score,
        text: (r.text ?? "").slice(0, 240),
      })),
    };
  }
  return mapped;
}

/**
 * Grounded completion prompt. Three-mode behavior baked in:
 *
 *   1. Greeting / meta — respond conversationally, name the file(s),
 *      suggest a couple of starter questions. NOT a refusal.
 *   2. In-coverage content question — concise answer using only the
 *      snippets; cite via the fenced JSON block.
 *   3. Out-of-coverage content question — honest acknowledgement +
 *      pointer to what the doc DOES cover. No fabrication, no
 *      general-knowledge fill-in.
 *
 * Structured outputs (still required):
 *   - `citations` array inside the same fenced JSON block as
 *     `suggestedIntent`. `runRagPipeline` validates each entry's
 *     `documentId` against the snippet set before using it.
 *   - Token-budget guard: `buildSnippetBlock` truncates to
 *     `MAX_SNIPPET_BLOCK_CHARS` (most-relevant first, trailing dropped).
 *
 * `GROUNDED_REFUSAL_PHRASE` is no longer prescribed by the prompt —
 * the model phrases its own refusal — but the constant + the
 * pass-through test stay as a regression guard against
 * legacy-phrase mutation.
 */
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

async function callGroundedLlm(
  userMessage: string,
  snippets: GroundXSearchResult[],
  llmClient: LlmClient,
  modelId: string,
  scopeHint?: { fileName?: string | null; scenarioTitle?: string | null },
  debug?: { llm?: ChatRouterDebug["llm"] },
  tools?: OpenAiFunctionTool[],
): Promise<{ answer: string; toolCalls: RawToolCall[] }> {
  const system =
    "You are the user's analyst for the documents in the snippets " +
    "below. You read them on the user's behalf and answer in plain " +
    "English — warm, direct, brief.\n\n" +

    "For content claims, use only what's in the snippets. Don't invent " +
    "facts and don't fill in from general knowledge. If the snippets " +
    "cover the answer, lead with it and quote a short verbatim phrase " +
    "when it helps. If they don't, say so in one sentence and point to " +
    "something the documents do cover.\n\n" +

    // Snippet-rereading nudge (2026-05-28). Observed failure mode: a
    // snippet contains a JSON object whose key directly answers the
    // question (e.g. `"due_date": "2025-07-30"`), and the model still
    // replies "no snippets." Tell it to read the JSON.
    "Snippets may be JSON-shaped (key/value blocks extracted from the " +
    "document). If a JSON field or JSON key in a snippet directly " +
    "answers the question, quote its value verbatim — that IS the " +
    "answer. Do not claim 'no snippets' or 'I can't determine' when " +
    "the JSON field is right there.\n\n" +

    "Greetings, small talk, and meta questions about your capabilities " +
    "aren't content questions — respond conversationally and offer a " +
    "starter question or two grounded in the snippets.\n\n" +

    // widget-llm-integration follow-up A.3 (2026-05-28) — the
    // grounded prompt no longer asks for `proposedSchemaField` or
    // `suggestedIntent` JSON. Both surfaces ship via native LLM
    // function-calling tools now; the chat router validates +
    // routes them to `reply.intents[]` (read) or
    // `reply.suggestedActions[]` (mutate, user-confirmed chip).
    //
    // The fenced ```json block is still permitted for `citations`
    // (citations are metadata on the answer, not a tool surface).
    "After your answer you MAY append a single ```json fenced block " +
    "with `citations` only. Skip the block for non-content turns. Add one " +
    "entry per content claim: `quote` MUST be copied VERBATIM from that " +
    "snippet (it is the proof the claim is grounded), and `answerSpan` is " +
    "the exact phrase from YOUR answer that the quote supports.\n\n" +
    "```json\n" +
    '{"citations":[{"documentId":"<id-from-the-snippet-header>","page":<int>,"quote":"<verbatim phrase copied from the snippet>","answerSpan":"<the claim in your answer it supports>"}]}\n' +
    "```\n\n" +
    "`citations` MUST reference only documentIds present in the snippet " +
    "headers — the client drops the rest. Copy `quote` exactly; do NOT " +
    "paraphrase it (a quote that doesn't match the source is dropped to a " +
    "lower-confidence, region-only citation).\n\n" +

    "**Schema-field proposals and intent suggestions ship via tools, " +
    "not JSON.**\n\n" +
    "When the user explicitly asks to add a schema field (\"add a " +
    "field for X\", \"track Y too\", \"capture Z\"), call the " +
    "`propose_schema_field` tool with `{categoryId, name, type, " +
    "description}`. Pick the best-fit existing category id from the " +
    "user's surrounding context if one is visible; otherwise use a " +
    "plausible snake_case id. Type must be one of STRING, NUMBER, " +
    "DATE, BOOLEAN. The frontend renders an Accept/Reject card; " +
    "write the conversational answer naturally (\"I can add a 'total " +
    "tax' field…\") and let the tool call carry the structured payload.\n\n" +

    "When you've reasoned that the user might want to navigate to " +
    "another canvas surface (\"open the extract to compare line " +
    "items\", \"check the report for the rollup\"), call the " +
    "`suggest_intent` tool with `{intent, reason, confidence}`. " +
    "Use `show-extract` / `show-report` / `show-interact` for the " +
    "intent label. Fire only at confidence > 0.8.";

  const contextBlock = buildSnippetBlock(snippets);
  // Scope line — independent of snippet hits. Names the doc the user
  // is currently looking at so the model knows what to talk about
  // even when GroundX search returned 0 results. Goes ABOVE the
  // snippet block so the model reads it first.
  const scopeParts: string[] = [];
  if (scopeHint?.fileName) scopeParts.push(`file=${scopeHint.fileName}`);
  if (scopeHint?.scenarioTitle) scopeParts.push(`scenario=${scopeHint.scenarioTitle}`);
  const scopeLine = scopeParts.length > 0 ? `Working on: ${scopeParts.join(", ")}\n\n` : "";
  const userContent = `${scopeLine}Snippets:\n${contextBlock}\n\nQuestion: ${userMessage}`;

  // Dev-side full request log. The `messages` field is on pino's
  // redact list (prod sees [REDACTED]); dev sees the full prompt so
  // the user can see what the model actually gets.
  logger.info(
    {
      groundedLlmCall: {
        model: modelId,
        snippetCount: snippets.length,
        snippetBlockChars: contextBlock.length,
        userMessage,
        systemChars: system.length,
        userContentChars: userContent.length,
        // The full bodies — gated to dev by log-level + pino redaction.
        systemContent: system,
        userContent,
      },
    },
    "grounded LLM dispatch",
  );

  const requestBody: Record<string, unknown> = {
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  };
  // Phase 5 — when a (filtered) tool catalog is supplied, advertise
  // it on the LLM request via OpenAI's function-calling envelope.
  // We always include the `tools` key when the caller passed one
  // (even if empty) so the test for "step with zero tools" can
  // assert the request shape exactly.
  if (tools !== undefined) {
    requestBody.tools = tools;
    if (tools.length > 0) {
      requestBody.tool_choice = "auto";
    }
  }
  const response = await llmClient.forward("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`grounded llm call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  const message = payload.choices?.[0]?.message;
  // Either a textual answer OR tool_calls is acceptable — providers
  // return an empty content string when the model emitted a tool
  // call instead of prose. Treat that as a "no answer" fallback
  // (empty string) rather than throwing.
  const rawAnswer = message?.content?.trim() ?? "";
  const toolCalls: RawToolCall[] = (message?.tool_calls ?? [])
    .filter((tc) => tc.type === "function" && tc.function?.name)
    .map((tc, idx) => ({
      id: tc.id ?? `call_${idx}`,
      name: tc.function!.name!,
      argumentsJson: tc.function!.arguments ?? "{}",
    }));
  // If there's no prose AND no tool calls, we got a useless reply —
  // surface as a hard error so the user sees something specific.
  if (!rawAnswer && toolCalls.length === 0) {
    throw new Error("grounded llm call returned no content");
  }
  const answer = rawAnswer;
  // Capture dev-side debug snapshot (browser surfaces this via _debug
  // on the chat reply). Only populated when the caller passed `debug`.
  if (debug) {
    debug.llm = {
      model: modelId,
      snippetBlockChars: contextBlock.length,
      userContentChars: userContent.length,
      systemChars: system.length,
      answerChars: answer.length,
    };
  }
  // Log the actual LLM response so the user can compare what was
  // sent (logged above) with what came back. Counterpart to the
  // "grounded LLM dispatch" log line.
  logger.info(
    {
      groundedLlmResponse: {
        model: modelId,
        answerChars: answer.length,
        answer,
      },
    },
    "grounded LLM response",
  );
  return { answer, toolCalls };
}

/**
 * CF-06 token-budget guard. Assemble snippets into the context block
 * the LLM sees, truncating from the end once the budget is hit so the
 * highest-ranked snippets are preserved. The per-snippet cap
 * (`RAG_SNIPPET_CHARS`) is applied first; this function then drops
 * whole snippets if the budget would still be blown.
 */
export function buildSnippetBlock(snippets: GroundXSearchResult[]): string {
  if (snippets.length === 0) return "(no snippets found)";
  const entries: string[] = [];
  let used = 0;
  for (const [i, s] of snippets.entries()) {
    const text = (s.text ?? "").slice(0, RAG_SNIPPET_CHARS);
    const header = s.fileName
      ? `[${i + 1}] file="${s.fileName}" doc=${s.documentId} page=${s.pageNumber ?? "?"}`
      : `[${i + 1}] doc=${s.documentId} page=${s.pageNumber ?? "?"}`;
    const entry = `${header}\n${text}`;
    // +2 for the "\n\n" join we'll add between entries.
    const projected = used + entry.length + (entries.length > 0 ? 2 : 0);
    if (projected > MAX_SNIPPET_BLOCK_CHARS) break;
    entries.push(entry);
    used = projected;
  }
  // Edge case: even the FIRST snippet exceeds the budget. Truncate it
  // hard rather than send an empty block — a partial top result is
  // more useful than nothing.
  if (entries.length === 0) {
    const s = snippets[0];
    const truncated = (s.text ?? "").slice(0, MAX_SNIPPET_BLOCK_CHARS - 80);
    return `[1] doc=${s.documentId} page=${s.pageNumber ?? "?"}\n${truncated}`;
  }
  return entries.join("\n\n");
}

/**
 * CF-09 — per-scenario MOCK_MODE fixtures. The pre-CF-09 mock always
 * returned generic "Mock RAG answer about X" copy, which made dev / QA
 * useless for testing scenario-specific UX. Now each sample has a
 * small library of canonical questions with realistic-shaped answers
 * + the right citation docId so consumers can verify routing.
 *
 * Per locked decision: keep this map IN-CODE rather than reading from
 * scenario manifests. Manifest authoring is on the product team's
 * track; the mock-mode fixtures are a dev-quality concern that should
 * be reviewable in PR + grep-friendly. When manifests grow a
 * `mockChatScript` field (SCEN-* track), this map can become a
 * fallback for scenarios without one — not a sole source of truth.
 *
 * Pattern matching is intentionally lenient (`/total/i`, `/dti/i`)
 * rather than exact strings — the user types whatever; we just need
 * to recognize the canonical intent.
 */
interface MockScenarioFixture {
  match: RegExp;
  answer: string;
  citations: Array<{ documentId: string; page: number; snippet?: string }>;
}

interface MockScenarioBundle {
  /** Friendly name baked into the fallback so it reads scenario-aware. */
  sampleName: string;
  /** Document id for the fallback citation (and tied to `sampleName`). */
  fallbackDocId: string;
  /** Question → answer fixtures, tried in order. */
  fixtures: MockScenarioFixture[];
}

const MOCK_SCENARIO_FIXTURES: Record<string, MockScenarioBundle> = {
  "sample:utility": {
    sampleName: "utility bill",
    fallbackDocId: "utility-bill-2026-04",
    fixtures: [
      {
        match: /\btotal\b|\bamount\s+due\b/i,
        answer: "The bill total is $214.07 (current charges + carryover).",
        citations: [
          {
            documentId: "utility-bill-2026-04",
            page: 1,
            snippet: "Total amount due: $214.07",
          },
        ],
      },
      {
        match: /\bdue\s*date\b|\bwhen\s+is\s+(it|this)\s+due\b/i,
        answer: "The bill is due on May 15, 2026. Late fee kicks in after May 22.",
        citations: [
          {
            documentId: "utility-bill-2026-04",
            page: 1,
            snippet: "Due date: 05/15/2026",
          },
        ],
      },
      {
        match: /\bkwh\b|\busage\b|\bconsumption\b/i,
        answer:
          "Total usage this period: 642 kWh across two meters. That's up ~8% vs. the same month last year.",
        citations: [
          {
            documentId: "utility-bill-2026-04",
            page: 2,
            snippet: "Meter A: 412 kWh; Meter B: 230 kWh",
          },
        ],
      },
    ],
  },
  "sample:loan": {
    sampleName: "loan packet",
    fallbackDocId: "loan-applicant-summary",
    fixtures: [
      {
        match: /\bdti\b|\bdebt[- ]to[- ]income\b/i,
        answer:
          "Estimated DTI is 22% (gross), comfortably under the 35% threshold. Driven by $1,210/mo recurring debt against $5,500/mo gross income.",
        citations: [
          {
            documentId: "loan-applicant-summary",
            page: 3,
            snippet: "Recurring monthly debt: $1,210",
          },
        ],
      },
      {
        match: /\bcredit\s*score\b|\bfico\b/i,
        answer:
          "Applicant's reported FICO is 742 (mid-tier prime). Most recent pull is two months old; recommend a fresh pull before final commitment.",
        citations: [
          {
            documentId: "loan-credit-report",
            page: 1,
            snippet: "FICO 8 score: 742",
          },
        ],
      },
      {
        match: /\bincome\b|\bemployment\b|\bsalary\b/i,
        answer:
          "Gross monthly income $5,500 verified across 3 paystubs + 1 employment letter. Tenure 4.2 years at current employer.",
        citations: [
          {
            documentId: "loan-employment-letter",
            page: 1,
            snippet: "Annual gross salary: $66,000",
          },
        ],
      },
    ],
  },
  "sample:solar": {
    sampleName: "solar portfolio",
    fallbackDocId: "solar-fund-overview",
    fixtures: [
      {
        match: /\birr\b|\binternal\s+rate\b/i,
        answer:
          "Top project (Fund A · Project 11) projected IRR is 14.2% (base case). Fund-wide weighted IRR: 11.8%.",
        citations: [
          {
            documentId: "solar-fund-A-project-11",
            page: 4,
            snippet: "Base-case IRR: 14.2%",
          },
        ],
      },
      {
        match: /\brisk\b/i,
        answer:
          "Highest-risk project is Fund B · Project 03 — flagged for interconnection delay + degradation curve uncertainty. Risk score 7.4/10.",
        citations: [
          {
            documentId: "solar-fund-B-project-03",
            page: 2,
            snippet: "Risk roll-up: 7.4/10",
          },
        ],
      },
      {
        match: /\bdeal\s*size\b|\b(total|fund)\s*(value|size)\b/i,
        answer:
          "Combined deal size across the 142-project portfolio is $487M, with $312M committed and $175M in pipeline.",
        citations: [
          {
            documentId: "solar-fund-overview",
            page: 1,
            snippet: "Total fund commitment: $487M",
          },
        ],
      },
    ],
  },
};

function mockRagResponse(request: ChatRouterRequest): ChatRouterResponse {
  const bundle = request.currentEntityKey ? MOCK_SCENARIO_FIXTURES[request.currentEntityKey] : null;
  if (bundle) {
    for (const fixture of bundle.fixtures) {
      if (fixture.match.test(request.newUserMessage)) {
        return {
          mode: "rag",
          answer: fixture.answer,
          citations: fixture.citations,
          suggestedActions: [{ key: "show-source", label: "Show source" }],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        };
      }
    }
    // Scenario-aware fallback: the entity matched a known bundle but
    // no canonical question matched. Better to mention the sample
    // than serve the fully-generic copy.
    return {
      mode: "rag",
      answer:
        `I can answer questions about the ${bundle.sampleName} — try asking about the ` +
        `headline values or page-specific details. ` +
        `(Mock-mode reply; live RAG would search the sample documents.)`,
      citations: [
        { documentId: bundle.fallbackDocId, page: 1, snippet: "Sample document." },
      ],
      suggestedActions: [{ key: "show-source", label: "Show source" }],
      tools: [],
      intents: [],
      toolFailures: [],
      proposedSchemaField: null,
    };
  }
  // Fully-generic fallback for pre-CF-09 callers that don't ship
  // currentEntityKey OR scenarios we haven't authored yet.
  const entityHint = request.currentEntityKey ? ` (about ${request.currentEntityKey})` : "";
  return {
    mode: "rag",
    answer: `Mock RAG answer${entityHint}: I'd cite the sample document here once GroundX search is wired.`,
    citations: [{ documentId: "mock-doc-1", page: 1, snippet: "Mock snippet for the cited page." }],
    suggestedActions: [{ key: "show-source", label: "Show source" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

function mockResponseFor(mode: ChatMode, request: ChatRouterRequest): ChatRouterResponse {
  const entityHint = request.currentEntityKey ? ` (about ${request.currentEntityKey})` : "";
  switch (mode) {
    case "rag":
      return mockRagResponse(request);
    case "structured":
      return {
        mode,
        answer: "Mock structured answer: app-state lookup would go here.",
        citations: [],
        suggestedActions: [{ key: "open-settings", label: "Open settings" }],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      };
    case "hybrid":
      return {
        mode,
        answer: `Mock hybrid answer${entityHint}: a tour-style explanation combining sample metadata with grounded snippets.`,
        citations: [{ documentId: "mock-doc-1", page: 1, snippet: "Mock snippet from a hybrid response." }],
        suggestedActions: [
          { key: "show-extract", label: "Show me the extract" },
          { key: "try-chat", label: "Try asking a question" },
        ],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      };
  }
}
