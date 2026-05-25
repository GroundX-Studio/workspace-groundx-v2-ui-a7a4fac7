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

import type { AppRepository, ChatSessionEntityRecord, ChatSessionRecord } from "../types.js";
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
    case "my_projects":
    case "api_keys":
      return answerUnimplementedSubkind(kind);
    case "unknown":
      return answerUnknownStructuredQuery(request.newUserMessage);
  }
}

// ── Sub-handlers — backed by data readers we DO have ────────────────

async function answerPagesRemaining(deps: StructuredHandlerDeps): Promise<ChatRouterResponse> {
  // The real answer needs `page_usage_event` aggregation by user.
  // TODO(chat-fix-list P0 #3 follow-on): query page_usage_event for
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
  };
}

// ── Sub-handlers — readers not yet built ────────────────────────────

function answerUnimplementedSubkind(kind: StructuredQueryKind): ChatRouterResponse {
  // We deliberately do NOT fabricate a plausible answer here. The
  // 501-for-modes-without-readers principle applies inside the
  // structured mode too: be honest about what's not wired.
  // TODO(chat-fix-list P0 #3 follow-on): add per-subkind readers:
  //   - saved_schemas: SELECT FROM extraction_schemas WHERE user=?
  //   - my_projects:   SELECT FROM projects WHERE user=? (or Partner /project)
  //   - api_keys:      Partner /apikey list
  return {
    mode: "structured",
    answer:
      `I can answer questions about "${prettyKind(kind)}" once the data readers ` +
      `for that part of your account are wired. For now, you can find it in ` +
      `the settings page.`,
    citations: [],
    suggestedActions: [{ key: "open-settings", label: "Open settings" }],
    tools: [],
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
}

/**
 * Hybrid mode: combine structured app-state context with grounded
 * snippets to produce a tour-style answer. Today's implementation is
 * minimal — it formats a "here's what you're looking at + here's
 * what the document says" preamble. As the structured readers grow,
 * the hybrid answer naturally gets richer.
 */
export async function runHybridQuery(
  request: ChatRouterRequest,
  deps: HybridHandlerDeps,
): Promise<ChatRouterResponse> {
  const session = await deps.repository.getChatSession(deps.chatSessionId);
  const entities = session ? await deps.repository.listChatSessionEntities(deps.chatSessionId) : [];
  const active = session ? entities.find((e) => e.entityKey === session.activeEntityKey) : null;

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

  return {
    mode: "hybrid",
    answer,
    citations: deps.ragSnippets.map((s) => ({
      documentId: s.documentId,
      page: s.pageNumber ?? 1,
      snippet: s.text ? s.text.slice(0, 600) : undefined,
    })),
    suggestedActions: [
      { key: "show-extract", label: "Show me the extract" },
      { key: "try-chat", label: "Try a question about the sample" },
    ],
    tools: [],
  };
}

// ── helpers ─────────────────────────────────────────────────────────

function frank(message: string): ChatRouterResponse {
  return {
    mode: "structured",
    answer: message,
    citations: [],
    suggestedActions: [],
    tools: [],
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

function prettyKind(kind: StructuredQueryKind): string {
  switch (kind) {
    case "saved_schemas":
      return "saved schemas";
    case "my_projects":
      return "your projects";
    case "api_keys":
      return "API keys";
    default:
      return kind.replace(/_/g, " ");
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
