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

import type { GroundXClient, LlmClient } from "../types.js";

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
   */
  searchBucketId?: number | null;
  /** Provider model id for the LLM call, e.g. "gpt-4o" or "claude-3-haiku". */
  llmModelId?: string;
  mockMode: boolean;
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

  // Structured / hybrid live wiring isn't ready yet — those need MySQL
  // + Partner readers we haven't built. The earlier code returned a
  // mock envelope in production, which looked plausible but was fake
  // data; downstream clients had no way to distinguish a real answer
  // from a stub. Failing fast with a typed error so the handler can
  // map to HTTP 501 is the safer behavior. Use MOCK_MODE=true during
  // development to keep the chat surface usable while the live wiring
  // catches up.
  throw new ChatRouteNotImplementedError(mode);
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

  const snippets = await searchGroundX(
    request.newUserMessage,
    deps.searchBucketId ?? null,
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

async function searchGroundX(
  query: string,
  bucketId: number | null,
  client: GroundXClient,
  apiKey: string,
): Promise<GroundXSearchResult[]> {
  // POST /v1/search/{id} where id = bucket id. The GroundX search
  // endpoint takes { query, n, nextToken? } and returns { search: { results: [...] } }.
  const path = bucketId === null
    ? "/v1/search/documents"
    : `/v1/search/${bucketId}`;
  const response = await client.forward(path, {
    method: "POST",
    apiKey,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, n: RAG_SEARCH_LIMIT }),
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
