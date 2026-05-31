/**
 * Structured chat handler — app-state Q&A (NOT document Q&A).
 *
 * Users asking "saved schemas?" / "pages remaining?" / "my workspace"
 * want the answer to come from app state, not a document. This module
 * routes those questions to per-query data readers and formats the
 * response without needing a grounded LLM call.
 *
 * Today this is a thin scaffold: a handful of canned answers + an
 * `unimplemented` fallback that surfaces clearly in the response so
 * users (and telemetry) know which sub-queries still need data
 * readers. Real readers for "saved schemas" / "projects" land when
 * those tables exist (project_database.md).
 *
 * Hybrid mode (P0 #4) builds on this: it merges the structured
 * answer + a small RAG snippet block into a tour-style response.
 */

import type {
  AppRepository,
  ChatSessionEntityRecord,
  ChatSessionRecord,
  GroundXPartnerClient,
  LlmClient,
} from "../types.js";
import type { ChatRouterRequest, ChatRouterResponse } from "./chatRouter.js";

export type StructuredQueryKind =
  | "pages_remaining"
  | "onboarding_state"
  | "current_entity"
  | "saved_schemas"
  | "my_projects"
  | "api_keys"
  | "unknown";

/**
 * Classify a structured query into a sub-kind. Pattern-matched
 * against the message text + the optional intent hint from the UI.
 * Deterministic, NOT an LLM call.
 */
export function classifyStructuredQuery(request: ChatRouterRequest): StructuredQueryKind {
  const msg = request.newUserMessage.toLowerCase();

  if (msg.includes("pages remaining") || msg.includes("page budget") || msg.includes("free tier")) {
    return "pages_remaining";
  }
  if (msg.includes("onboarding") && (msg.includes("state") || msg.includes("progress"))) {
    return "onboarding_state";
  }
  if (msg.includes("current") && (msg.includes("view") || msg.includes("entity") || msg.includes("doc"))) {
    return "current_entity";
  }
  if (msg.includes("saved schema") || msg.includes("my schema") || msg.includes("schemas")) {
    return "saved_schemas";
  }
  if (msg.includes("my project") || msg.includes("project list") || msg.includes("my workspace")) {
    return "my_projects";
  }
  if (msg.includes("api key")) {
    return "api_keys";
  }
  return "unknown";
}

export interface StructuredHandlerDeps {
  repository: AppRepository;
  /**
   * CF-04: Partner API client used by the `my_projects` and `api_keys`
   * sub-handlers. Optional so callers that only exercise the local-
   * data sub-handlers (pages_remaining, onboarding_state, current_entity,
   * saved_schemas) don't need to construct one. When a sub-handler
   * needs the partner client and it's absent, the reader returns a
   * frank "Partner API not configured" reply rather than crashing.
   */
  partnerClient?: GroundXPartnerClient;
  chatSessionId: string;
  // The user's signed-in groundxUsername if authed, else null.
  groundxUsername: string | null;
  // Free-tier byo page budget (env config).
  byoPagesLimit: number;
}

/**
 * Run a structured-mode chat request. Returns a `ChatRouterResponse`
 * with no citations + suggested actions tailored to the query kind.
 *
 * Sub-handlers that need data readers we don't have yet return a
 * frank "I can answer that once X is wired" reply rather than a
 * fabricated one — same principle as the structured/hybrid 501 fix.
 */
export async function runStructuredQuery(
  request: ChatRouterRequest,
  deps: StructuredHandlerDeps,
): Promise<ChatRouterResponse> {
  const kind = classifyStructuredQuery(request);

  switch (kind) {
    case "pages_remaining":
      return await answerPagesRemaining(deps);
    case "onboarding_state":
      return await answerOnboardingState(deps);
    case "current_entity":
      return await answerCurrentEntity(deps);
    case "saved_schemas":
      return await answerSavedSchemas(deps);
    case "my_projects":
      return await answerMyProjects(deps);
    case "api_keys":
      return await answerApiKeys(deps);
    case "unknown":
      return answerUnknownStructuredQuery(request.newUserMessage);
  }
}

// ── Sub-handlers — backed by data readers we DO have ────────────────

async function answerPagesRemaining(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  // The real answer needs `page_usage_event` aggregation by user.
  // TODO(CF-04): query page_usage_event for
  // sum-of-pages-this-month for the user, subtract from byoPagesLimit.
  // For now we surface the budget itself + a frank note that usage
  // accounting needs the page_usage_event reader.
  return {
    mode: "structured",
    answer:
      `Your BYO free-tier budget is ${deps.byoPagesLimit} pages per month. ` +
      `I don't have the live usage count wired yet — once page-usage telemetry ` +
      `is queryable I'll show "X of ${deps.byoPagesLimit} pages used."`,
    citations: [],
    suggestedActions: [{ key: "open-settings", label: "Open settings" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

async function answerOnboardingState(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  const session = await deps.repository.getChatSession(deps.chatSessionId);
  if (!session) {
    return frank("structured: chat session row not found.");
  }
  const entities = await deps.repository.listChatSessionEntities(deps.chatSessionId);
  const activeKey = session.activeEntityKey;
  const active = entities.find((e) => e.entityKey === activeKey);
  return {
    mode: "structured",
    answer: formatOnboardingStateAnswer(session, active, entities),
    citations: [],
    suggestedActions: [
      { key: "show-extract", label: "Show me the extract" },
      { key: "open-samples", label: "Pick another sample" },
    ],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

async function answerCurrentEntity(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  const session = await deps.repository.getChatSession(deps.chatSessionId);
  if (!session) return frank("structured: chat session row not found.");
  const entities = await deps.repository.listChatSessionEntities(deps.chatSessionId);
  const active = entities.find((e) => e.entityKey === session.activeEntityKey);
  if (!active) {
    return {
      mode: "structured",
      answer: "You haven't picked an entity yet. Pick a sample on the start screen to begin.",
      citations: [],
      suggestedActions: [{ key: "open-samples", label: "Open samples" }],
      tools: [],
      intents: [],
      toolFailures: [],
    proposedSchemaField: null,
    };
  }
  return {
    mode: "structured",
    answer:
      `You're currently viewing \`${active.entityKey}\`. ` +
      `Last frame: \`${active.lastFrame ?? "f1"}\`. ` +
      `${safeCount(active.completedFramesJson)} frames completed so far.`,
    citations: [],
    suggestedActions: [{ key: "show-source", label: "Show source" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

// ── CF-04 readers — saved_schemas / my_projects / api_keys ──────────

async function answerSavedSchemas(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  if (!deps.groundxUsername) {
    return signInNudge("your saved schemas");
  }
  const rows = await deps.repository.listTemplates(deps.groundxUsername, "extract");
  if (rows.length === 0) {
    return {
      mode: "structured",
      answer: "You haven't saved any extraction schemas yet. Build one in F4 and pin it.",
      citations: [],
      suggestedActions: [{ key: "open-schema-builder", label: "Open schema builder" }],
      tools: [],
      intents: [],
      toolFailures: [],
    proposedSchemaField: null,
    };
  }
  const lines = rows.map((s) => `• ${s.name} (id ${s.id})`);
  return {
    mode: "structured",
    answer:
      `You have ${rows.length} saved schema${rows.length === 1 ? "" : "s"}:\n` +
      lines.join("\n"),
    citations: [],
    suggestedActions: [{ key: "open-schema-builder", label: "Open schema builder" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

interface PartnerProjectListItem {
  projectId?: string;
  id?: string;
  name?: string;
}

async function answerMyProjects(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  if (!deps.groundxUsername) {
    return signInNudge("your projects");
  }
  if (!deps.partnerClient) {
    return frank("My-projects reader needs the Partner API client and it's not wired.");
  }
  let response: Response;
  try {
    response = await deps.partnerClient.forward("/project", {
      method: "GET",
      customerKey: deps.groundxUsername,
    });
  } catch {
    return upstreamErrorReply("your projects");
  }
  if (!response.ok) return upstreamErrorReply("your projects");
  const payload = (await response.json().catch(() => null)) as
    | { projects?: PartnerProjectListItem[] }
    | null;
  const projects = payload?.projects ?? [];
  if (projects.length === 0) {
    return {
      mode: "structured",
      answer: "You don't have any projects in your workspace yet.",
      citations: [],
      suggestedActions: [{ key: "open-workspace", label: "Open workspace" }],
      tools: [],
      intents: [],
      toolFailures: [],
    proposedSchemaField: null,
    };
  }
  const lines = projects.map((p) => `• ${p.name ?? "(unnamed)"} (id ${p.projectId ?? p.id ?? "?"})`);
  return {
    mode: "structured",
    answer:
      `You have ${projects.length} project${projects.length === 1 ? "" : "s"}:\n` +
      lines.join("\n"),
    citations: [],
    suggestedActions: [{ key: "open-workspace", label: "Open workspace" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

interface PartnerApiKeyListItem {
  id?: string;
  name?: string;
  apiKey?: string;
}

async function answerApiKeys(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  if (!deps.groundxUsername) {
    return signInNudge("your API keys");
  }
  if (!deps.partnerClient) {
    return frank("API-keys reader needs the Partner API client and it's not wired.");
  }
  let response: Response;
  try {
    response = await deps.partnerClient.forward("/apikey", {
      method: "GET",
      customerKey: deps.groundxUsername,
    });
  } catch {
    return upstreamErrorReply("your API keys");
  }
  if (!response.ok) return upstreamErrorReply("your API keys");
  const payload = (await response.json().catch(() => null)) as
    | { apiKeys?: PartnerApiKeyListItem[] }
    | null;
  const keys = payload?.apiKeys ?? [];
  if (keys.length === 0) {
    return {
      mode: "structured",
      answer: "You don't have any API keys yet. Create one from the workspace settings.",
      citations: [],
      suggestedActions: [{ key: "open-api-keys", label: "Manage API keys" }],
      tools: [],
      intents: [],
      toolFailures: [],
    proposedSchemaField: null,
    };
  }
  // SECURITY: never show the full key value in a chat answer. Show
  // name + last-4 chars only. This matches the "never commit
  // *username fields" rule but for the live chat surface.
  const lines = keys.map((k) => {
    const tail = (k.apiKey ?? "").slice(-4);
    return `• ${k.name ?? "(unnamed)"} (…${tail})`;
  });
  return {
    mode: "structured",
    answer:
      `You have ${keys.length} API key${keys.length === 1 ? "" : "s"}:\n` +
      lines.join("\n") +
      `\n\nFull key values aren't shown here — manage them in workspace settings.`,
    citations: [],
    suggestedActions: [{ key: "open-api-keys", label: "Manage API keys" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

function signInNudge(subject: string): ChatRouterResponse {
  return {
    mode: "structured",
    answer: `Sign in to see ${subject}. I can show ${subject} once your session is authenticated.`,
    citations: [],
    suggestedActions: [{ key: "open-signin", label: "Sign in" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

function upstreamErrorReply(subject: string): ChatRouterResponse {
  return {
    mode: "structured",
    answer:
      `I couldn't reach the workspace API to look up ${subject} — please try again in a moment. ` +
      `(I don't make up an answer when the upstream is down.)`,
    citations: [],
    suggestedActions: [],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

function answerUnknownStructuredQuery(question: string): ChatRouterResponse {
  return {
    mode: "structured",
    answer:
      `I think you're asking about your account or workspace, but I couldn't ` +
      `match "${truncate(question, 80)}" to a known query. Try asking about ` +
      `"pages remaining", "current view", "saved schemas", or "my projects".`,
    citations: [],
    suggestedActions: [{ key: "open-settings", label: "Open settings" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

// ── Hybrid handler ─────────────────────────────────────────────────

export interface HybridHandlerDeps extends StructuredHandlerDeps {
  /**
   * RAG snippets to fold into the response. The hybrid pipeline runs
   * a thin RAG search first, then layers the structured context on
   * top. Caller passes the snippets already collected so this stays
   * pure / synchronous after the search step.
   */
  ragSnippets: Array<{ documentId: string; pageNumber?: number; text?: string }>;
  /**
   * CF-05: LLM client used to compose the tour-style answer. Optional
   * — when missing OR when the call fails, the handler falls back to
   * the deterministic hand-rolled answer (the previous behavior).
   * Chat-side profile per CF-16: hybrid mode is user-facing and
   * deserves the quality model, not the light one.
   */
  llmClient?: LlmClient;
  /** Provider model id for the tour-prompt LLM call. */
  llmModelId?: string;
}

const HYBRID_SNIPPET_CHARS = 400;
const HYBRID_RECENT_VIEWER_EVENTS = 5;
const HYBRID_SYSTEM_PROMPT =
  "You are giving a tour-style answer to a GroundX user. Use the structured " +
  "context (what they're looking at, where they are in onboarding, what " +
  "they've saved) PLUS the document snippets below. Be concise (3–4 short " +
  "sentences). Mention the active entity. Cite snippets by quoting short " +
  "phrases verbatim. If neither the structured context nor the snippets " +
  "answer the question, say so plainly — don't make anything up.";

/**
 * Hybrid mode: combine structured app-state context with grounded
 * snippets to produce a tour-style answer. CF-05 closure:
 *
 *   1. Read real structured context — active entity, recent viewer
 *      trail, signed-in user's saved-schema count.
 *   2. If an LLM client is wired, compose a tour-style answer via
 *      a focused chat-completion call. Otherwise (or on failure)
 *      fall back to the deterministic hand-rolled formatter.
 *   3. Citations always come straight from the input snippets — the
 *      LLM doesn't get to invent them.
 */
export async function runHybridQuery(
  request: ChatRouterRequest,
  deps: HybridHandlerDeps,
): Promise<ChatRouterResponse> {
  const session = await deps.repository.getChatSession(deps.chatSessionId);
  const entities = session ? await deps.repository.listChatSessionEntities(deps.chatSessionId) : [];
  const active: ChatSessionEntityRecord | undefined = session
    ? entities.find((e) => e.entityKey === session.activeEntityKey)
    : undefined;

  // Signed-in users: pull their saved-schema count so the tour can
  // reference it ("you have 3 saved schemas — want me to apply one?").
  let savedSchemaCount = 0;
  if (deps.groundxUsername) {
    const rows = await deps.repository.listTemplates(deps.groundxUsername, "extract");
    savedSchemaCount = rows.length;
  }

  // Recent viewer trail — tells the tour where the user has been.
  const allEvents = await deps.repository.listViewerEvents(deps.chatSessionId);
  const recentEvents = allEvents.slice(0, HYBRID_RECENT_VIEWER_EVENTS);

  const citations = deps.ragSnippets.map((s) => ({
    documentId: s.documentId,
    page: s.pageNumber ?? 1,
    snippet: s.text ? s.text.slice(0, 600) : undefined,
  }));
  const suggestedActions = [
    { key: "show-extract", label: "Show me the extract" },
    { key: "try-chat", label: "Try a question about the sample" },
  ];

  // Try the LLM-composed tour first; fall back on any failure.
  if (deps.llmClient && deps.llmModelId) {
    try {
      const composed = await composeTourAnswer(request, deps, active, savedSchemaCount, recentEvents);
      if (composed != null) {
        return { mode: "hybrid", answer: composed, citations, suggestedActions, tools: [], intents: [], toolFailures: [], proposedSchemaField: null };
      }
    } catch {
      // Fall through to hand-rolled.
    }
  }

  const sample = active?.entityKey ?? "this sample";
  const snippetCount = deps.ragSnippets.length;
  const snippetPreview = deps.ragSnippets
    .slice(0, 2)
    .map((s) => `"${truncate(s.text ?? "", 120)}" (doc ${s.documentId}, p${s.pageNumber ?? "?"})`)
    .join("; ");

  const answer =
    `You're looking at ${sample}. ` +
    (snippetCount > 0
      ? `Recent snippets I pulled to answer "${truncate(request.newUserMessage, 60)}": ${snippetPreview}. ` +
        `I can pull more if you ask a specific question.`
      : `I didn't find document snippets that match your question. ` +
        `Try asking about a specific value, page, or field on the canvas.`);

  return { mode: "hybrid", answer, citations, suggestedActions, tools: [], intents: [], toolFailures: [], proposedSchemaField: null };
}

async function composeTourAnswer(
  request: ChatRouterRequest,
  deps: HybridHandlerDeps,
  active: ChatSessionEntityRecord | undefined,
  savedSchemaCount: number,
  recentEvents: Array<{ action: string; entityKey: string | null }>,
): Promise<string | null> {
  if (!deps.llmClient || !deps.llmModelId) return null;

  const contextLines: string[] = [];
  if (active) {
    contextLines.push(`Active entity: ${active.entityKey}`);
    contextLines.push(`Last frame: ${active.lastFrame ?? "f1"}`);
    const completed = safeCount(active.completedFramesJson);
    contextLines.push(`Frames completed: ${completed}`);
  } else {
    contextLines.push("No active entity yet.");
  }
  if (deps.groundxUsername) {
    contextLines.push(
      `Signed-in user has ${savedSchemaCount} saved schema${savedSchemaCount === 1 ? "" : "s"}.`,
    );
  } else {
    contextLines.push("User is anonymous.");
  }
  if (recentEvents.length > 0) {
    const trail = recentEvents.map((e) => `${e.action}@${e.entityKey ?? "-"}`).join(" → ");
    contextLines.push(`Recent viewer trail: ${trail}`);
  }
  const structuredBlock = contextLines.join("\n");

  const snippetBlock =
    deps.ragSnippets.length > 0
      ? deps.ragSnippets
          .map(
            (s, i) =>
              `[${i + 1}] doc=${s.documentId} page=${s.pageNumber ?? "?"}\n${(s.text ?? "").slice(0, HYBRID_SNIPPET_CHARS)}`,
          )
          .join("\n\n")
      : "(no snippets found)";

  const userBlock =
    `Structured context:\n${structuredBlock}\n\n` +
    `Document snippets:\n${snippetBlock}\n\n` +
    `Question: ${request.newUserMessage}`;

  const response = await deps.llmClient.forward("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: deps.llmModelId,
      messages: [
        { role: "system", content: HYBRID_SYSTEM_PROMPT },
        { role: "user", content: userBlock },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const answer = payload?.choices?.[0]?.message?.content?.trim();
  return answer && answer.length > 0 ? answer : null;
}

// ── helpers ─────────────────────────────────────────────────────────

function frank(message: string): ChatRouterResponse {
  return {
    mode: "structured",
    answer: message,
    citations: [],
    suggestedActions: [],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

function formatOnboardingStateAnswer(
  session: ChatSessionRecord,
  active: ChatSessionEntityRecord | undefined,
  entities: ChatSessionEntityRecord[],
): string {
  const lines: string[] = [];
  lines.push(`Session: ${session.title}${session.isOnboarding ? " (onboarding)" : ""}`);
  if (active) {
    lines.push(`Active entity: ${active.entityKey} (frame ${active.lastFrame ?? "f1"})`);
    const completed = safeCount(active.completedFramesJson);
    lines.push(`Frames completed: ${completed}`);
  } else {
    lines.push("No active entity.");
  }
  if (entities.length > 1) {
    lines.push(`Other entities you've visited: ${entities.length - 1}`);
  }
  return lines.join("\n");
}

function safeCount(json: string | null): number {
  if (!json) return 0;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
