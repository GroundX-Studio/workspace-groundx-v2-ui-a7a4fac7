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
 * Hybrid mode builds on this via the shared grounded seam: workspace
 * state becomes the WORKSPACE STATE private block on the grounded prompt
 * (chat-architecture-hardening Task 3).
 */

import type {
  AppRepository,
  ChatSessionEntityRecord,
  ChatSessionRecord,
  GroundXClient,
  GroundXPartnerClient,
  LlmClient,
} from "../types.js";
import type { ChatRouterRequest, ChatRouterResponse } from "./chatRouter.js";
import { groundedAnswerOverScope } from "./groundedAnswer.js";
import type { ContentScope } from "@groundx/shared";

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
    // No citations on this structured status reply → no "Show all sources"
    // chip (a sources chip with zero sources is a dead button, 2026-06-11).
    suggestedActions: [],
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
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

// ── Hybrid handler ─────────────────────────────────────────────────
//
// chat-architecture-hardening Task 3 — hybrid is the THIRD caller of the
// shared `groundedAnswerOverScope` seam (chat, report, hybrid). The former
// `HYBRID_SYSTEM_PROMPT` fork + `composeTourAnswer` are DELETED: one grounded
// system prompt, with the workspace state passed as a `structuredContext`
// private block. Hybrid replies gain the full citation-verification contract.

const HYBRID_RECENT_VIEWER_EVENTS = 5;

export interface HybridHandlerDeps extends StructuredHandlerDeps {
  /**
   * Chat-profile LLM (CF-16: hybrid is user-facing — quality model). When
   * missing (or the grounded call fails) the handler returns the
   * deterministic structured fallback.
   */
  llmClient?: LlmClient;
  /** Provider model id for the grounded call. */
  llmModelId?: string;
  /**
   * GroundX client + key for the seam's internal search. Optional — when
   * absent the grounded call runs over EMPTY snippets (LLM prose preserved).
   * The router-side hybrid search is gone; the seam's search is the only one.
   */
  groundxClient?: GroundXClient;
  groundxApiKey?: string;
  /** ContentScope for the seam's search (router-derived). */
  contentScope?: ContentScope | null;
  /** Server-derived RBAC filter (never client-supplied). */
  rbacFilter?: Record<string, unknown>;
  /** Embedding verification seam — see `GroundedAnswerDeps.quoteEmbedder`. */
  quoteEmbedder?: import("./attribution.js").Embedder;
  embedThreshold?: number;
}

/**
 * Hybrid mode: grounded answer over the scope with a WORKSPACE STATE private
 * block (active entity, onboarding frame, saved-schema count, viewer trail).
 *
 * Envelope (pinned by the merge): `mode: "hybrid"`; the existing
 * `show-extract` / `try-chat` chips; a `show-source` chip ONLY when the reply
 * carries verified citations (chat parity); `tools: undefined` on the LLM
 * call (no tool advertising / tool-call routing on this path). Hybrid's turn
 * plan is FIXED — no skill-pack injection (`productKnowledge: false`).
 *
 * Degraded paths (mirrors the pre-merge split):
 *   - no groundx client / search failure → grounded seam over empty snippets;
 *   - no LLM client or model id / grounded LLM failure → deterministic
 *     SNIPPET-LESS structured fallback (accepted change: the router search
 *     that fed the old snippet preview is deleted).
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

  // Signed-in users: saved-schema count so the answer can reference it
  // ("you have 3 saved schemas — want me to apply one?").
  let savedSchemaCount = 0;
  if (deps.groundxUsername) {
    const rows = await deps.repository.listTemplates(deps.groundxUsername, "extract");
    savedSchemaCount = rows.length;
  }

  // Recent viewer trail — where the user has been.
  const allEvents = await deps.repository.listViewerEvents(deps.chatSessionId);
  const recentEvents = allEvents.slice(0, HYBRID_RECENT_VIEWER_EVENTS);

  const contextLines: string[] = [];
  if (active) {
    contextLines.push(`Active entity: ${active.entityKey}`);
    contextLines.push(`Last frame: ${active.lastFrame ?? "f1"}`);
    contextLines.push(`Frames completed: ${safeCount(active.completedFramesJson)}`);
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
  const structuredContext = contextLines.join("\n");

  const baseActions = [
    { key: "show-extract", label: "Show me the extract" },
    { key: "try-chat", label: "Try a question about the sample" },
  ];

  if (deps.llmClient && deps.llmModelId) {
    try {
      const grounded = await groundedAnswerOverScope(
        request.newUserMessage,
        deps.contentScope ?? null,
        {
          llmClient: deps.llmClient,
          llmModelId: deps.llmModelId,
          ...(deps.groundxClient ? { groundxClient: deps.groundxClient } : {}),
          ...(deps.groundxApiKey ? { groundxApiKey: deps.groundxApiKey } : {}),
          ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
          ...(deps.quoteEmbedder ? { quoteEmbedder: deps.quoteEmbedder } : {}),
          ...(deps.embedThreshold !== undefined ? { embedThreshold: deps.embedThreshold } : {}),
        },
        {
          structuredContext,
          // tools deliberately NOT passed: no tool advertising or tool-call
          // routing on the hybrid path (any emitted calls would be dropped).
          searchSoftFail: true,
          // FIXED turn plan (Task 4): the mode classifier already routed the
          // turn; workspace-state questions never inject the skill pack.
          turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: true },
        },
      );
      if (grounded.body.trim().length > 0) {
        return {
          mode: "hybrid",
          answer: grounded.body,
          citations: grounded.citations,
          suggestedActions:
            grounded.citations.length > 0
              ? [{ key: "show-source", label: "Show all sources" }, ...baseActions]
              : baseActions,
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        };
      }
    } catch {
      // Grounded-seam LLM failure → deterministic fallback below.
    }
  }

  // Deterministic SNIPPET-LESS structured fallback (no LLM client/model id,
  // or the grounded call failed). No prompt is involved on this path.
  const sample = active?.entityKey ?? "this sample";
  const answer =
    `You're looking at ${sample}. ` +
    `Ask a specific question about a value, page, or field on the canvas and I'll pull the answer from the document.`;

  return { mode: "hybrid", answer, citations: [], suggestedActions: baseActions, intents: [], toolFailures: [], proposedSchemaField: null };
}

// ── helpers ─────────────────────────────────────────────────────────

function frank(message: string): ChatRouterResponse {
  return {
    mode: "structured",
    answer: message,
    citations: [],
    suggestedActions: [],
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
