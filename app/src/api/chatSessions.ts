/**
 * Chat-surface API client.
 *
 * Two endpoints behind one helper:
 *
 *   1. `POST /api/chat-sessions`  — idempotent server-side row creation
 *      for an in-memory ChatSession. Anonymous sessions get an
 *      `ownerAnonId` from the session cookie; signed-in sessions get
 *      `ownerUserId`. The frontend mints session ids client-side
 *      (localStorage is still the cache) but the server needs a parent
 *      row before `/api/chat/messages` can write to it.
 *
 *   2. `POST /api/chat/messages`  — the chat surface's single entry
 *      point. Validates → persists user message → builds 3-axis context
 *      bundle → optional compression → routes (mock OR live RAG) →
 *      persists assistant reply → returns the typed envelope.
 *
 * `sendChatMessage` wraps the two: on the first send for a given
 * chatSessionId, it runs the ensure-create step; subsequent sends
 * skip it. The `__resetEnsuredChatSessions` test hook flushes the
 * cache between test cases.
 */

import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

interface CreateChatSessionInput {
  id: string;
  onboardingSessionId?: string;
  title: string;
  isOnboarding: boolean;
  activeEntityKey?: string | null;
}

export interface CreateChatSessionResult {
  chatSessionId: string;
  ownerUserId: string | null;
  ownerAnonId: string | null;
}

// A chat-reply citation IS the shared `Citation` (`@groundx/shared`) — the
// middleware end of this same wire already uses it (chatRouter `Citation`).
// `bbox` (NormalizedBbox) is threaded end-to-end for CiteChip's viewer jump;
// `tier` drives highlight precision; both optional. Used directly as `Citation`
// (no `ChatCitation` alias).
import { ApiError, type Citation, type ScopeFilter, type TemplateFieldType } from "@groundx/shared";

export interface ChatSuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}

/**
 * UI-01 Phase 2a — schema-field addition proposed by the grounded LLM
 * when the user asks to add a field to the schema. The frontend renders
 * an inline Accept/Reject card in the assistant turn; Accept dispatches
 * the ChatStore `addSchemaField` action.
 *
 * Mirrors the server-side `ProposedSchemaField` (minus `id`, which the
 * client mints when pushing into `pendingSchemaOverlay.addedFields`).
 */
/**
 * `proposal-envelope-provenance`: present when the middleware's Zod
 * envelope parse accepted the LLM payload. The renderer surfaces a
 * `proposal_v<version> · envelope verified` label sourced from this
 * field. Optional so legacy callers (pre-envelope wire) still type.
 */
export interface ProposalEnvelopeProvenance {
  version: "v1";
  verified: true;
}

export interface ProposedSchemaField {
  categoryId: string;
  name: string;
  type: TemplateFieldType;
  description: string;
  /**
   * Set by `parseGroundedAnswer` in the middleware on a successful
   * `proposalEnvelopeV1Schema` parse. Renderers gate the provenance
   * label on `provenance?.verified === true`.
   */
  provenance?: ProposalEnvelopeProvenance;
}

/**
 * Dev-only diagnostic payload mirroring the middleware's `ChatRouterDebug`.
 * Present on `ChatReply` when `NODE_ENV !== "production"`. Lets the
 * browser DevTools console show exactly what the chat router asked
 * GroundX and what came back, without needing terminal access.
 */
export interface ChatReplyDebug {
  mode: "rag" | "structured" | "hybrid";
  // Mirrors the middleware `ChatRouterDebug.scope` wire shape (unified
  // `ContentScope` — discriminant `type`, composable `filter`). Kept in sync
  // with `chatRouter.ts`; folding both debug-scope mirrors onto `ContentScope`
  // is tracked in the `core-data-model-hardening` envelope-unification task.
  scope: { type: "bucket" | "group" | "documents"; bucketId?: number; groupId?: number; documentIds?: string[]; filter?: ScopeFilter };
  groundx: {
    path: string;
    query: string;
    n: number;
    filter: unknown;
    resultCount: number;
    topSnippets: Array<{ documentId: string; fileName?: string; score?: number; text?: string }>;
  } | null;
  llm: {
    model: string;
    snippetBlockChars: number;
    userContentChars: number;
    systemChars: number;
    answerChars: number;
  } | null;
}

/**
 * widget-llm-integration Phase 5 — one successful LLM tool call
 * round-trip from the middleware. The frontend dispatches each
 * `intent` through the canvas orchestrator on receipt.
 */
export interface ChatDispatchedIntent {
  name: string;
  arguments: Record<string, unknown>;
  intent: Record<string, unknown>;
}

/** widget-llm-integration Phase 5 — one failed LLM tool call. */
export interface ChatToolFailure {
  name: string;
  reason: string;
}

export interface ChatReply {
  mode: "rag" | "structured" | "hybrid";
  answer: string;
  citations: Citation[];
  suggestedActions: ChatSuggestedAction[];
  tools: { name: string; arguments: Record<string, unknown> }[];
  /**
   * widget-llm-integration Phase 5 — validated LLM tool calls. The
   * chat surface dispatches each `intent` through the canvas
   * orchestrator on receipt. Empty array when the LLM emitted no
   * tools (or no tools matched the registry).
   */
  intents: ChatDispatchedIntent[];
  /**
   * widget-llm-integration Phase 5 — tool calls that failed
   * validation (unknown name, Zod parse failure, etc.). v1 surfaces
   * these as a one-line note; no auto-retry (design.md §M).
   */
  toolFailures: ChatToolFailure[];
  /**
   * UI-01 Phase 2a — non-null when the grounded LLM emitted a
   * well-formed proposed field in its JSON block. The chat surface
   * surfaces this as a Propose card with Accept/Reject controls; the
   * Accept handler calls the ChatStore `addSchemaField` action.
   */
  proposedSchemaField: ProposedSchemaField | null;
  /**
   * Dev-only diagnostic payload. Present iff `NODE_ENV !== production`.
   * `sendChatMessage` logs it to the browser console so the user can
   * see the raw GroundX request + result + LLM dispatch char counts
   * for each chat turn.
   */
  _debug?: ChatReplyDebug;
}

export interface SendChatMessageResult {
  userMessageId: string;
  assistantMessageId: string;
  reply: ChatReply;
  compressionRan: boolean;
}

export interface SendChatMessageInput {
  chatSessionId: string;
  newUserMessage: string;
  intent?: string | null;
  /**
   * Session metadata used by the ensure-create step. Required because
   * the server needs a title + onboarding flag for new rows. Subsequent
   * sends for the same chatSessionId skip the ensure step entirely.
   */
  sessionMeta: {
    title: string;
    isOnboarding: boolean;
    onboardingSessionId: string;
    activeEntityKey?: string | null;
  };
  /**
   * Optional scope hint threaded into the grounded LLM prompt so the
   * model knows what doc the user is currently looking at — even when
   * GroundX search returns 0 snippets. The frontend has the scenario
   * manifest in hand; the server does not. Without this, the model
   * sees `(no snippets found)` for off-topic queries and refuses,
   * with no fallback to "I can talk about the April utility bill —
   * try asking about charges or due date."
   */
  scopeHint?: {
    fileName?: string | null;
    scenarioTitle?: string | null;
  };
  /**
   * widget-llm-integration Phase 5 — the active ViewerStep kind the
   * user is currently on. Sent to the middleware so the LLM tool
   * catalog gets filtered to tools relevant for the user's surface.
   * Mirrors `ViewerStep["kind"]` from `ChatStoreContext`.
   */
  activeStepKind?: string | null;
}

export class ChatApiError extends ApiError {
  constructor(message: string, status: number, detail: unknown) {
    super(message, status, detail);
    this.name = "ChatApiError";
  }
}

/**
 * CF-08 — per-status error → user-facing UX mapping. The chat surface
 * (F2, F5, future steady-mode chat) consumes this in catch sites to
 * render the right copy without leaking raw status codes or stack
 * traces. Status branches:
 *
 *   401   → "sign in to continue" — re-auth flow surface (UI decides
 *           whether to open the gate or redirect to /auth/login).
 *   501   → "I can't answer that yet" — mode-not-wired surface
 *           (structured/hybrid in some deployments).
 *   504   → "took too long" — retryable, retry chip recommended.
 *   400   → "programming error" — developer-visible; the request
 *           should not have shipped.
 *   404   → "session row missing" — recommend refresh (the chatHandler
 *           cache invalidation already happens; this is the user copy).
 *   5xx   → "try again in a moment" — retryable.
 *   network (no status, e.g. fetch threw) → "couldn't reach the chat".
 *   anything else → generic.
 *
 * `retryable: true` is a hint, not an instruction — UIs decide whether
 * to show a retry chip, auto-retry, or just surface the message.
 */
export type ChatErrorKind =
  | "reauth"
  | "not-yet"
  | "timeout"
  | "upstream"
  | "bug"
  | "not-found"
  | "network"
  | "unknown";

export interface ChatErrorMapping {
  kind: ChatErrorKind;
  message: string;
  retryable: boolean;
}

export function chatErrorToUserCopy(err: unknown): ChatErrorMapping {
  if (err instanceof ChatApiError) {
    const status = err.status;
    if (status === 401) {
      return {
        kind: "reauth",
        message: "Please sign in to continue this conversation.",
        retryable: false,
      };
    }
    if (status === 501) {
      return {
        kind: "not-yet",
        message: "I can't answer that yet — that mode isn't available yet in this deployment.",
        retryable: false,
      };
    }
    if (status === 504) {
      return {
        kind: "timeout",
        message: "That took too long — want to try again?",
        retryable: true,
      };
    }
    if (status === 400) {
      return {
        kind: "bug",
        message: "Invalid request (programming error). Please report this if it keeps happening.",
        retryable: false,
      };
    }
    if (status === 404) {
      return {
        kind: "not-found",
        message: "This chat session is no longer on the server — please refresh to start a new one.",
        retryable: false,
      };
    }
    if (status >= 500) {
      return {
        kind: "upstream",
        message: "Something went wrong on our side — try again in a moment.",
        retryable: true,
      };
    }
  }
  // Network-layer throws (fetch rejected before getting a status) come
  // through as plain Errors. Distinguish from "really unknown" by
  // matching the common runtime messages.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed")
    ) {
      return {
        kind: "network",
        message: "Couldn't reach the chat service — check your connection and try again.",
        retryable: true,
      };
    }
  }
  return {
    kind: "unknown",
    message: "Something went wrong — please try again in a moment.",
    retryable: false,
  };
}

const ensuredSessionIds = new Set<string>();
const pendingEnsures = new Map<string, Promise<void>>();

/** Test-only: forget which sessions have been ensured. */
export function __resetEnsuredChatSessions(): void {
  ensuredSessionIds.clear();
  pendingEnsures.clear();
}

/**
 * Test-only: mark a chatSessionId as already-ensured so the
 * fire-and-forget helpers skip their self-trigger ensure POST and
 * go straight to their main call. Lets per-helper tests stay
 * focused on the helper's contract without re-mocking the
 * ensure-create round trip every test.
 */
export function __markChatSessionEnsured(chatSessionId: string): void {
  ensuredSessionIds.add(chatSessionId);
}

/**
 * Idempotently ensure a server-side `chat_sessions` row exists for
 * this id. Used by ChatStoreProvider's mount effect so writes from
 * RT-02..05 endpoints (viewer-events POST, entity PUT, chat-session
 * PATCH, messages GET) succeed instead of 404ing for the brief
 * window between client-side session mint and the first chat send.
 *
 * Tracks pending promises so concurrent callers collapse to a
 * single in-flight POST. Failure is non-fatal: the next call
 * retries (no cache write on throw).
 *
 * Fire-and-forget helpers should call `awaitChatSessionEnsured`
 * (below) before their main POST/PUT/PATCH so they don't race
 * past the ensure POST and 404.
 */
export async function ensureServerChatSession(
  input: CreateChatSessionInput,
): Promise<void> {
  if (ensuredSessionIds.has(input.id)) return;
  const existing = pendingEnsures.get(input.id);
  if (existing) return existing;
  const p = (async () => {
    try {
      await createChatSession(input);
      ensuredSessionIds.add(input.id);
    } catch {
      // Swallow — next call retries. The fire-and-forget helpers
      // will see no pending promise + an unensured id and fire
      // optimistically; their own 404 handler captures to Sentry.
    } finally {
      pendingEnsures.delete(input.id);
    }
  })();
  pendingEnsures.set(input.id, p);
  return p;
}

/**
 * Wait for the in-flight ensure POST (if any) to complete before
 * firing dependent writes. Resolves immediately when:
 *   - The session is already ensured (cache hit).
 *   - No ensure is in flight (no row, no pending — caller proceeds
 *     optimistically and accepts that the dependent call may 404).
 *
 * Otherwise returns the pending ensure promise so the caller's
 * dependent write lands AFTER the row exists server-side.
 */
export function awaitChatSessionEnsured(chatSessionId: string): Promise<void> {
  if (ensuredSessionIds.has(chatSessionId)) return Promise.resolve();
  const pending = pendingEnsures.get(chatSessionId);
  if (pending) return pending;
  return Promise.resolve();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await csrfFetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    throw new ChatApiError(`${path} failed: ${res.status}`, res.status, detail);
  }
  return (await res.json()) as T;
}

/**
 * Idempotently create a server-side ChatSession row. Returns the
 * persisted record's ownership fields so the client can verify it
 * picked up the expected anon/user mapping.
 */
export async function createChatSession(input: CreateChatSessionInput): Promise<CreateChatSessionResult> {
  return postJson<CreateChatSessionResult>("/api/chat-sessions", input);
}

/**
 * Send a user message through the chat surface. On the first call for
 * a given chatSessionId, ensures the server-side row exists; subsequent
 * calls go straight to /api/chat/messages. The ensure-create step is
 * idempotent server-side so a duplicate POST after a cache miss is
 * harmless.
 *
 * Cache-invalidation rules:
 *   - If `createChatSession` throws, we don't add to the cache, so the
 *     next call retries the create.
 *   - If `/api/chat/messages` returns 404 (server has no row for this
 *     chatSessionId — possible after retention sweep, DB wipe, or an
 *     ownership flip we missed), we DROP the id from the cache and
 *     re-throw, so the next call re-creates the row.
 */
export async function sendChatMessage(input: SendChatMessageInput): Promise<SendChatMessageResult> {
  if (!ensuredSessionIds.has(input.chatSessionId)) {
    await createChatSession({
      id: input.chatSessionId,
      onboardingSessionId: input.sessionMeta.onboardingSessionId,
      title: input.sessionMeta.title,
      isOnboarding: input.sessionMeta.isOnboarding,
      activeEntityKey: input.sessionMeta.activeEntityKey ?? null,
    });
    ensuredSessionIds.add(input.chatSessionId);
  }

  try {
    const result = await postJson<SendChatMessageResult>("/api/chat/messages", {
      chatSessionId: input.chatSessionId,
      newUserMessage: input.newUserMessage,
      intent: input.intent ?? null,
      scopeHint: input.scopeHint,
      activeStepKind: input.activeStepKind ?? null,
    });
    // Dev-only: log the raw chat-pipeline diagnostics so the user can
    // see what was actually asked of GroundX + the LLM without
    // context-switching to the middleware terminal. Gated on
    // import.meta.env.DEV so prod builds strip the call entirely.
    if (import.meta.env.DEV && result.reply?._debug) {
      console.groupCollapsed(
        `[chat] ${result.reply._debug.mode} · "${input.newUserMessage.slice(0, 60)}${input.newUserMessage.length > 60 ? "…" : ""}"`,
      );
      console.log("scope", result.reply._debug.scope);
      console.log("groundx", result.reply._debug.groundx);
      console.log("llm", result.reply._debug.llm);
      console.log("answer", result.reply.answer);
      console.groupEnd();
    }
    return result;
  } catch (err) {
    if (err instanceof ChatApiError && err.status === 404) {
      // Server no longer has this row — invalidate the cache so the
      // next send re-creates it.
      ensuredSessionIds.delete(input.chatSessionId);
    }
    // CF-13: ship every chat-send failure to Sentry. The wrapper is a
    // no-op when DSN is unset, so this is safe in dev/test. Extras
    // give the Sentry event enough context to triage without leaking
    // user content.
    captureException(err, {
      route: "/api/chat/messages",
      chatSessionId: input.chatSessionId,
      status: err instanceof ChatApiError ? err.status : null,
    });
    // CF-08: per-status user copy lives in `chatErrorToUserCopy`.
    // Catch sites (F2, F5, future steady chat) call that helper to
    // render the right copy without re-implementing the status branch.
    throw err;
  }
}

/**
 * Subset of `ChatMessageRecord` the UI actually renders. Mirrored
 * from `middleware/src/types.ts` — kept narrow on purpose so
 * unused server-only fields (latency, token counts, etc.) don't
 * leak into UI components.
 */
export interface PersistedChatMessage {
  id: string;
  chatSessionId: string;
  turnIndex: number;
  role: "user" | "assistant" | "system";
  content: string;
  errorCode: string | null;
  /**
   * clickable-citations Phase 1 — assistant turns carry the parsed
   * `citations_json` payload as a typed Citation array. Empty for
   * user turns (and for assistant turns that returned no snippets).
   * Surfaces in the rendered chat thread so chips survive a refresh.
   */
  citations: Citation[];
}

interface ListChatMessagesResponse {
  messages: PersistedChatMessage[];
}

/**
 * RT-01 — read the persisted thread for a chat session. Used on
 * mount to hydrate `liveTurns` so a page refresh doesn't wipe the
 * visible conversation. Returns turn-ordered, non-compressed
 * messages; the server filters down to the active (non-compacted)
 * tail.
 *
 * Status branches mirror the server route:
 *   - 200 → `{ messages: [...] }`
 *   - 401 → no session cookie (caller probably hasn't fully booted yet)
 *   - 403 → cookie session id doesn't match the row's owner
 *   - 404 → no such chat session row (e.g. minted client-side but
 *           POST /api/chat-sessions hasn't landed yet — treat as "no
 *           history yet" rather than an error)
 *
 * The wrapper resolves 404 to an empty array so callers can render
 * the empty-thread state without a try/catch. Other non-2xx
 * statuses throw `ChatApiError`.
 */
export async function listChatMessages(chatSessionId: string): Promise<PersistedChatMessage[]> {
  // Self-trigger ensure-create + wait so this GET doesn't race past
  // the chat_sessions row creation. Same pattern as the fire-and-forget
  // helpers — see ensureServerChatSession docstring.
  await ensureServerChatSession({
    id: chatSessionId,
    onboardingSessionId: chatSessionId,
    title: "Onboarding",
    isOnboarding: true,
  });
  const res = await csrfFetch(`/api/chat-sessions/${encodeURIComponent(chatSessionId)}/messages`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    throw new ChatApiError(`/api/chat-sessions/${chatSessionId}/messages failed: ${res.status}`, res.status, detail);
  }
  const payload = (await res.json()) as ListChatMessagesResponse;
  // clickable-citations Phase 1 — older middleware deployments may
  // not yet project `citations` onto each row. Normalize to `[]` so
  // callers can render `turn.citations.map(...)` unconditionally.
  return (payload.messages ?? []).map((m) => ({
    ...m,
    citations: Array.isArray(m.citations) ? m.citations : [],
  }));
}
