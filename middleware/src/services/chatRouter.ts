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

import type { AppRepository, GroundXClient, LlmClient } from "../types.js";

import { runHybridQuery, runStructuredQuery } from "./structuredHandler.js";

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
   * Optional intent hint from the canvas orchestrator (e.g.
   * extract.field-hovered, smart.report). Lets the router skip
   * classification when the UI has already signalled the mode.
   */
  intent?: string | null;
}

export interface Citation {
  documentId: string;
  page: number;
  snippet?: string;
}

export interface SuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}

export interface ChatRouterResponse {
  mode: ChatMode;
  answer: string;
  citations: Citation[];
  suggestedActions: SuggestedAction[];
  /** Tool calls the assistant invoked (Phase 7 wire-up). */
  tools: { name: string; arguments: Record<string, unknown> }[];
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
   * Sourced from session.groundxApiKey OR env.GROUNDX_ANON_API_KEY by
   * the caller. Required when not in mockMode.
   */
  groundxApiKey?: string;
  /**
   * Bucket id to search against — typically the customer's primary
   * bucket, OR the samples bucket id for anonymous onboarding flows.
   * Legacy single-bucket-only path; new code should pass `contentScope`.
   */
  searchBucketId?: number | null;
  /**
   * Explicit content scope. Wins over `searchBucketId` when supplied.
   * The chatHandler derives this from the active entity / current
   * intent / project membership; the chatRouter doesn't recompute it.
   */
  contentScope?: RagContentScope;
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
 * buckets and passing `{kind:"group", groupId}`. Today no upstream
 * caller produces multi-workspace scopes, so the ensure-group logic
 * is deferred (see TODO in this file).
 */
export type RagContentScope =
  | { kind: "bucket"; bucketId: number; projectIds?: string[] }
  | { kind: "group"; groupId: number }
  | { kind: "documents"; documentIds: string[] }
  // Legacy fallback for the case where ContentScope is unknown:
  // search the doc-wide endpoint. Tracked so it shows up in logs.
  | { kind: "unknown" };

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
  };
  if (mode === "structured") {
    return runStructuredQuery(request, structuredDeps);
  }
  // Hybrid: layer structured context onto a thin RAG search. If the
  // RAG side isn't configured, hybrid still produces a useful response
  // (just without grounded snippets).
  let snippets: GroundXSearchResult[] = [];
  if (deps.groundxClient && deps.groundxApiKey) {
    const scope: RagContentScope =
      deps.contentScope ??
      (deps.searchBucketId != null
        ? { kind: "bucket", bucketId: deps.searchBucketId }
        : { kind: "unknown" });
    try {
      snippets = await searchGroundX(request.newUserMessage, scope, deps.groundxClient, deps.groundxApiKey);
    } catch (err) {
      // Hybrid is best-effort on the RAG side — log + continue with
      // empty snippets rather than 502 the whole request.
      // eslint-disable-next-line no-console
      console.warn("hybrid mode: RAG search failed, proceeding without snippets", err);
    }
  }
  return runHybridQuery(request, { ...structuredDeps, ragSnippets: snippets });
}

// ────────────────────────────────────────────────────────────────────
// RAG pipeline — live GroundX search → grounded prompt → LLM
// ────────────────────────────────────────────────────────────────────

const RAG_SEARCH_LIMIT = 6;
const RAG_SNIPPET_CHARS = 600;

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
  const scope: RagContentScope =
    deps.contentScope ??
    (deps.searchBucketId != null ? { kind: "bucket", bucketId: deps.searchBucketId } : { kind: "unknown" });

  const snippets = await searchGroundX(
    request.newUserMessage,
    scope,
    deps.groundxClient,
    deps.groundxApiKey,
  );

  const llmResponse = await callGroundedLlm(request.newUserMessage, snippets, deps.llmClient, deps.llmModelId);

  return {
    mode: "rag",
    answer: llmResponse.answer,
    citations: snippets.map((s) => ({
      documentId: s.documentId,
      page: s.pageNumber ?? 1,
      snippet: s.text ? s.text.slice(0, RAG_SNIPPET_CHARS) : undefined,
    })),
    suggestedActions: [{ key: "show-source", label: "Show source" }],
    tools: [],
  };
}

/**
 * Issue a GroundX search dispatched on `ContentScope`. The five
 * supported shapes per the docs:
 *
 *   bucket / no projectIds  → POST /v1/search/{bucketId} + {query, n}
 *   bucket / 1 projectId    → POST /v1/search/{bucketId} +
 *                             {query, n, filter: {projectId: P}}
 *   bucket / N projectIds   → POST /v1/search/{bucketId} +
 *                             {query, n, filter: {projectId: {$in: [...]}}}
 *   group                   → POST /v1/search/{groupId} + {query, n}
 *   documents               → POST /v1/search/documents +
 *                             {query, n, documentIds: [...]}
 *
 * TODO(chat-fix-list P0 #2 follow-on): multi-bucket usage today
 * requires the caller to provide an existing groupId. The "ensure-
 * create group of buckets [B1, B2, …] if none exists" helper lives
 * outside this function and isn't built yet — when it lands, the
 * handler can pass `{kind:"group", groupId}` after the ensure call.
 */
export async function searchGroundX(
  query: string,
  scope: RagContentScope,
  client: GroundXClient,
  apiKey: string,
): Promise<GroundXSearchResult[]> {
  let path: string;
  // Body must always include {query, n}; some scopes add fields.
  const body: Record<string, unknown> = { query, n: RAG_SEARCH_LIMIT };

  switch (scope.kind) {
    case "bucket": {
      path = `/v1/search/${scope.bucketId}`;
      const ids = scope.projectIds ?? [];
      if (ids.length === 1) {
        body.filter = { projectId: ids[0] };
      } else if (ids.length > 1) {
        body.filter = { projectId: { $in: ids } };
      }
      break;
    }
    case "group": {
      // Group search has the same shape as bucket search — different
      // resource id, same endpoint. GroundX resolves the group to its
      // member buckets server-side.
      path = `/v1/search/${scope.groupId}`;
      break;
    }
    case "documents": {
      if (scope.documentIds.length === 0) {
        throw new Error("rag scope 'documents' requires at least one documentId");
      }
      path = "/v1/search/documents";
      body.documentIds = scope.documentIds;
      break;
    }
    case "unknown": {
      // Legacy fallback: doc-wide search. This SHOULD only happen when
      // the chatHandler doesn't know the active entity yet (early
      // onboarding). Log surfaces this so we can spot it in telemetry.
      // eslint-disable-next-line no-console
      console.warn("rag search dispatched with kind=unknown — falling back to /v1/search/documents");
      path = "/v1/search/documents";
      break;
    }
  }

  const response = await client.forward(path, {
    method: "POST",
    apiKey,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`groundx search failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    search?: { results?: Array<Record<string, unknown>> };
    results?: Array<Record<string, unknown>>;
  };
  const rawResults = payload.search?.results ?? payload.results ?? [];
  return rawResults.map((r) => ({
    documentId: typeof r.documentId === "string" ? r.documentId : String(r.documentId ?? ""),
    pageNumber: typeof r.pageNumber === "number" ? r.pageNumber : undefined,
    text: typeof r.text === "string" ? r.text : undefined,
    score: typeof r.score === "number" ? r.score : undefined,
    fileName: typeof r.fileName === "string" ? r.fileName : undefined,
  }));
}

/**
 * TODO(chat-fix-list P1 #6): the grounded completion prompt is naïve.
 * Open items:
 *   - Token-budget guard so the LLM plans its answer length against
 *     snippet count + length (today it can blow past context if
 *     snippets are large).
 *   - Structured citation output (current "repeat short phrases
 *     verbatim" produces inconsistent citation extraction; a JSON
 *     citations field is more reliable).
 *   - "I don't know" calibration when snippets don't contain the
 *     answer — the LLM currently hedges; should refuse cleanly.
 *   - An eval set per scenario for regression testing once telemetry
 *     is live.
 *
 * TODO(chat-fix-list P1 #7): viewer intent inference. Ask the LLM to
 * optionally output a `suggestedIntent: {intent, confidence, reason}`
 * when the question implies the user should look at a different view
 * (source PDF, extraction table, specific citation). Dispatch logic
 * must surface as a suggestedActions chip (user opt-in) ONLY when
 * `confidence >= 0.85` — never auto-navigate. Auto-navigation on a
 * low-confidence guess is more disruptive than a missed suggestion.
 */
async function callGroundedLlm(
  userMessage: string,
  snippets: GroundXSearchResult[],
  llmClient: LlmClient,
  modelId: string,
): Promise<{ answer: string }> {
  const system =
    "You are a document Q&A assistant. Answer ONLY using the snippets " +
    "provided below as context. If the snippets do not contain enough " +
    "information to answer, say so plainly. Cite by repeating short " +
    "phrases verbatim. Be concise.";

  const contextBlock = snippets.length
    ? snippets
        .map(
          (s, i) =>
            `[${i + 1}] doc=${s.documentId} page=${s.pageNumber ?? "?"}\n${(s.text ?? "").slice(0, RAG_SNIPPET_CHARS)}`,
        )
        .join("\n\n")
    : "(no snippets found)";

  const response = await llmClient.forward("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Snippets:\n${contextBlock}\n\nQuestion: ${userMessage}` },
      ],
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`grounded llm call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = payload.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("grounded llm call returned no content");
  return { answer };
}

function mockResponseFor(mode: ChatMode, request: ChatRouterRequest): ChatRouterResponse {
  const entityHint = request.currentEntityKey ? ` (about ${request.currentEntityKey})` : "";
  switch (mode) {
    case "rag":
      return {
        mode,
        answer: `Mock RAG answer${entityHint}: I'd cite the sample document here once GroundX search is wired.`,
        citations: [{ documentId: "mock-doc-1", page: 1, snippet: "Mock snippet for the cited page." }],
        suggestedActions: [{ key: "show-source", label: "Show source" }],
        tools: [],
      };
    case "structured":
      return {
        mode,
        answer: "Mock structured answer: app-state lookup would go here.",
        citations: [],
        suggestedActions: [{ key: "open-settings", label: "Open settings" }],
        tools: [],
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
      };
  }
}
