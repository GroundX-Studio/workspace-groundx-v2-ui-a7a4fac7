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
import { readSseFrames } from "@/api/sseFrames";
import { ChatApiError } from "@/api/chatErrors";
import { cryptoRandom } from "@/lib/cryptoRandom";
import { captureException } from "@/lib/sentry";

export interface CreateChatSessionInput {
  id: string;
  onboardingSessionId?: string;
  title: string;
  isOnboarding: boolean;
  activeEntityKey?: string | null;
}

export type ChatSessionEnsureMetadata = Omit<CreateChatSessionInput, "id">;

// A chat-reply citation IS the shared `Citation` (`@groundx/shared`) — the
// middleware end of this same wire already uses it (chatRouter `Citation`).
// `bbox` (NormalizedBbox) is threaded end-to-end for CiteChip's viewer jump;
// `tier` drives highlight precision; both optional. Used directly as `Citation`
// (no `ChatCitation` alias).
import {
  chatReplySchema,
  createChatSessionResultSchema,
  type ChatReply as SharedChatReply,
  type ChatReplyDebug as SharedChatReplyDebug,
  type ChatScopeHint,
  type Citation,
  type CreateChatSessionResult as SharedCreateChatSessionResult,
  type DispatchedIntent as SharedDispatchedIntent,
  type ProposalEnvelopeProvenance,
  type ProposedSchemaField,
  type SuggestedAction,
  type ToolFailure as SharedToolFailure,
} from "@groundx/shared";

export { ChatApiError, chatErrorToUserCopy } from "@/api/chatErrors";
export type { ChatErrorKind, ChatErrorMapping } from "@/api/chatErrors";

// 2026-05-31-chat-wire-types-shared — the `POST /api/chat-sessions` result was
// declared on BOTH sides of the wire. It is now single-sourced on
// `@groundx/shared`; re-export so the local name (`CreateChatSessionResult`)
// is unchanged for every consumer.
export type CreateChatSessionResult = SharedCreateChatSessionResult;

// 2026-05-31-core-data-followups §4 #13 — `ChatSuggestedAction` was a
// byte-identical fork of the shared chip shape; it is now an alias of the ONE
// `@groundx/shared` `SuggestedAction`. The local name is kept so its many
// consumers (`useConversation`, `chatPrimitives`, `ChatReply`) don't churn.
export type ChatSuggestedAction = SuggestedAction;

// 2026-05-31-core-data-followups §4 #18 — the proposal-envelope wire shapes
// (`ProposedSchemaField` + `ProposalEnvelopeProvenance`) were declared on BOTH
// sides of the wire and had silently DRIFTED on `provenance`'s optionality.
// They are now single-sourced on `@groundx/shared`; re-export so the many local
// importers (`useConversation`, `ProposeSchemaFieldCard`, `ChatReply`) keep
// their names while the shape lives once. Mirrors the server-side shape (minus
// `id`, which the client mints when pushing into `pendingSchemaOverlay`).
export type { ProposalEnvelopeProvenance, ProposedSchemaField };

// 2026-05-31-chat-wire-types-shared — the chat reply envelope (the dev-only
// `ChatReplyDebug` diagnostic, the per-tool-call `ChatDispatchedIntent` /
// `ChatToolFailure`, and the `ChatReply` body) was declared as a byte-twin of
// the middleware `ChatRouterDebug` / `DispatchedIntent` / `ToolFailure` /
// `ChatRouterResponse`. Both halves now re-export the ONE `@groundx/shared`
// source under the `Eq<>` guards in `chatSessions.test.ts`; the local names are
// kept as aliases so no consumer churns. `ChatReplyDebug.scope` is now the
// shared `ContentScope` (the LOW debug-scope literal twin is closed).
export type ChatReplyDebug = SharedChatReplyDebug;
export type ChatDispatchedIntent = SharedDispatchedIntent;
export type ChatToolFailure = SharedToolFailure;
export type ChatReply = SharedChatReply;

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
  scopeHint?: ChatScopeHint;
  /**
   * widget-llm-integration Phase 5 — the active ViewerStep kind the
   * user is currently on. Sent to the middleware so the LLM tool
   * catalog gets filtered to tools relevant for the user's surface.
   * Mirrors `ViewerStep["kind"]` from `ChatStoreContext`.
   */
  activeStepKind?: string | null;
}

export interface ChatSessionEnsureClient {
  ensureServerChatSession(input: CreateChatSessionInput): Promise<void>;
  ensureChatSessionForSend(input: CreateChatSessionInput): Promise<void>;
  awaitChatSessionEnsured(chatSessionId: string): Promise<void>;
  markChatSessionEnsured(chatSessionId: string): void;
  forgetChatSessionEnsured(chatSessionId: string): void;
  resetEnsuredChatSessions(): void;
}

export function createChatSessionEnsureClient(
  createChatSessionFn: (input: CreateChatSessionInput) => Promise<CreateChatSessionResult> = createChatSession,
): ChatSessionEnsureClient {
  const ensuredSessionIds = new Set<string>();
  const pendingEnsures = new Map<string, Promise<void>>();

  const forgetChatSessionEnsured = (chatSessionId: string): void => {
    ensuredSessionIds.delete(chatSessionId);
    pendingEnsures.delete(chatSessionId);
  };

  const createAndMark = async (input: CreateChatSessionInput, throwOnFailure: boolean): Promise<void> => {
    try {
      await createChatSessionFn(input);
      ensuredSessionIds.add(input.id);
    } catch (err) {
      if (throwOnFailure) throw err;
    } finally {
      pendingEnsures.delete(input.id);
    }
  };

  const ensureServerChatSession = async (input: CreateChatSessionInput): Promise<void> => {
    if (ensuredSessionIds.has(input.id)) return;
    const existing = pendingEnsures.get(input.id);
    if (existing) return existing;
    const p = createAndMark(input, false);
    pendingEnsures.set(input.id, p);
    return p;
  };

  const ensureChatSessionForSend = async (input: CreateChatSessionInput): Promise<void> => {
    if (ensuredSessionIds.has(input.id)) return;
    const existing = pendingEnsures.get(input.id);
    if (existing) {
      await existing;
      if (ensuredSessionIds.has(input.id)) return;
    }
    const p = createAndMark(input, true);
    pendingEnsures.set(input.id, p);
    return p;
  };

  const awaitChatSessionEnsured = (chatSessionId: string): Promise<void> => {
    if (ensuredSessionIds.has(chatSessionId)) return Promise.resolve();
    const pending = pendingEnsures.get(chatSessionId);
    if (pending) return pending;
    return Promise.resolve();
  };

  return {
    ensureServerChatSession,
    ensureChatSessionForSend,
    awaitChatSessionEnsured,
    markChatSessionEnsured: (chatSessionId: string) => {
      ensuredSessionIds.add(chatSessionId);
    },
    forgetChatSessionEnsured,
    resetEnsuredChatSessions: () => {
      ensuredSessionIds.clear();
      pendingEnsures.clear();
    },
  };
}

const legacyChatSessionEnsure = createChatSessionEnsureClient();

/** Test-only: forget which sessions have been ensured. */
export function __resetEnsuredChatSessions(): void {
  legacyChatSessionEnsure.resetEnsuredChatSessions();
}

/**
 * Test-only: mark a chatSessionId as already-ensured so the
 * fire-and-forget helpers skip their self-trigger ensure POST and
 * go straight to their main call. Lets per-helper tests stay
 * focused on the helper's contract without re-mocking the
 * ensure-create round trip every test.
 */
export function __markChatSessionEnsured(chatSessionId: string): void {
  legacyChatSessionEnsure.markChatSessionEnsured(chatSessionId);
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
export const ensureServerChatSession = (input: CreateChatSessionInput): Promise<void> =>
  legacyChatSessionEnsure.ensureServerChatSession(input);

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
  return legacyChatSessionEnsure.awaitChatSessionEnsured(chatSessionId);
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
  const result = await postJson<CreateChatSessionResult>("/api/chat-sessions", input);
  // 2026-05-31-chat-wire-types-shared — runtime-validate the create-session
  // result against the shared `createChatSessionResultSchema` at this parse
  // boundary. Drop-safe (see `sendChatMessage`): report a contract drift to
  // Sentry without throwing, so a parse miss never breaks the ensure-create
  // flow.
  const parsed = createChatSessionResultSchema.safeParse(result);
  if (!parsed.success) {
    captureException(parsed.error, {
      route: "/api/chat-sessions",
      validation: "createChatSessionResultSchema",
    });
  }
  return result;
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
export async function sendChatMessage(
  input: SendChatMessageInput,
  chatSessionEnsure: ChatSessionEnsureClient = legacyChatSessionEnsure,
): Promise<SendChatMessageResult> {
  await chatSessionEnsure.ensureChatSessionForSend({
    id: input.chatSessionId,
    onboardingSessionId: input.sessionMeta.onboardingSessionId,
    title: input.sessionMeta.title,
    isOnboarding: input.sessionMeta.isOnboarding,
    activeEntityKey: input.sessionMeta.activeEntityKey ?? null,
  });

  try {
    const result = await postJson<SendChatMessageResult>("/api/chat/messages", {
      chatSessionId: input.chatSessionId,
      newUserMessage: input.newUserMessage,
      intent: input.intent ?? null,
      scopeHint: input.scopeHint,
      activeStepKind: input.activeStepKind ?? null,
    });
    // 2026-05-31-chat-wire-types-shared — runtime-validate the reply envelope
    // against the shared `chatReplySchema` at this parse boundary. Drop-safe:
    // a malformed reply is reported to Sentry but does NOT throw (behaviour-
    // preserving — the envelope is single-sourced, so a parse miss signals a
    // genuine server/contract drift to triage, not a flow to break).
    const replyParse = chatReplySchema.safeParse(result.reply);
    if (!replyParse.success) {
      captureException(replyParse.error, {
        route: "/api/chat/messages",
        chatSessionId: input.chatSessionId,
        validation: "chatReplySchema",
      });
    }
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
      chatSessionEnsure.forgetChatSessionEnsured(input.chatSessionId);
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

/** Base backoff between streaming reconnect attempts (×attempt number). */
const RECONNECT_BACKOFF_MS = 250;

/** Live callbacks for the streaming send — token-by-token text + tool activity. */
export interface StreamChatCallbacks {
  /** A content delta arrived → append to the in-flight assistant bubble. */
  onToken?: (delta: string) => void;
  /** A server tool ran → drive the live "Checked the documents" indicator. */
  onActivity?: (activity: { name: string; label: string }) => void;
  /** The turn's id confirmed (for reconnect) — first frame. */
  onMeta?: (meta: { turnKey: string }) => void;
}

/**
 * Streaming counterpart to {@link sendChatMessage}: same ensure-create +
 * reply-validation + 404 cache-invalidation, but POSTs `Accept: text/event-stream`
 * with a client idempotency `turnKey` and consumes the SSE frames, firing
 * `onToken`/`onActivity` live and resolving to the SAME `SendChatMessageResult`
 * (from the `envelope` frame) the JSON path returns. Used by the chat send path
 * when streaming is enabled; the JSON `sendChatMessage` is retained for callers/
 * tests that don't stream.
 */
export async function streamChatMessage(
  input: SendChatMessageInput,
  callbacks: StreamChatCallbacks = {},
  chatSessionEnsure: ChatSessionEnsureClient = legacyChatSessionEnsure,
  opts: { signal?: AbortSignal; maxRetries?: number } = {},
): Promise<SendChatMessageResult> {
  await chatSessionEnsure.ensureChatSessionForSend({
    id: input.chatSessionId,
    onboardingSessionId: input.sessionMeta.onboardingSessionId,
    title: input.sessionMeta.title,
    isOnboarding: input.sessionMeta.isOnboarding,
    activeEntityKey: input.sessionMeta.activeEntityKey ?? null,
  });

  // Client-supplied idempotency key: a reconnect re-POST with the same key ATTACHES
  // to the running turn server-side (no duplicate generation), and `Last-Event-ID`
  // makes the server replay only the frames missed during the drop.
  const turnKey = cryptoRandom();
  const maxRetries = opts.maxRetries ?? 2;
  let lastSeq = 0;
  let result: SendChatMessageResult | null = null;
  let attempt = 0;

  // One connect+drain attempt → "done" (envelope seen) | "dropped" (stream ended
  // with no envelope/error — a connection drop). HTTP failures, server `error`
  // frames, and aborts THROW (terminal — not retried here).
  const attemptStream = async (): Promise<SendChatMessageResult | null> => {
    let seen: SendChatMessageResult | null = null;
    const res = await csrfFetch("/api/chat/messages", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(lastSeq > 0 ? { "Last-Event-ID": String(lastSeq) } : {}),
      },
      body: JSON.stringify({
        chatSessionId: input.chatSessionId,
        newUserMessage: input.newUserMessage,
        intent: input.intent ?? null,
        scopeHint: input.scopeHint,
        activeStepKind: input.activeStepKind ?? null,
        turnKey,
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (!res.ok) {
      let detail: unknown = null;
      try {
        detail = await res.json();
      } catch {
        // ignore
      }
      throw new ChatApiError(`/api/chat/messages failed: ${res.status}`, res.status, detail);
    }
    if (!res.body) {
      throw new ChatApiError("/api/chat/messages returned no stream body", 502, null);
    }
    for await (const frame of readSseFrames(res.body)) {
      // 1. PARSE — a COMPLETE-but-unparseable frame is a contract violation, not a
      //    transient (the reader already discards truncated frames). Fail TERMINALLY
      //    as a "malformed frame" — do NOT retry, and do NOT advance `lastSeq` past it.
      let payload: unknown;
      try {
        payload = JSON.parse(frame.data);
      } catch {
        throw new ChatApiError(`malformed chat stream frame (event=${frame.event})`, 502, null);
      }
      // 2. error frame — a turn-level failure (HTTP 200 + error frame) is terminal.
      if (frame.event === "error") {
        const code = (payload as { code: string }).code;
        if (code === "chat_session_not_found") {
          chatSessionEnsure.forgetChatSessionEnsured(input.chatSessionId);
        }
        throw new ChatApiError(`chat stream error: ${code}`, 500, { code });
      }
      // 3. DISPATCH — a throwing consumer callback is a CALLER bug, not a transport
      //    issue, so label it honestly (not "malformed frame"); it is still TERMINAL
      //    (a buggy callback must never trigger a server re-POST).
      try {
        switch (frame.event) {
          case "meta":
            callbacks.onMeta?.(payload as { turnKey: string });
            break;
          case "token":
            callbacks.onToken?.((payload as { delta: string }).delta);
            break;
          case "activity":
            callbacks.onActivity?.(payload as { name: string; label: string });
            break;
          case "envelope":
            seen = payload as SendChatMessageResult;
            break;
          default:
            break;
        }
      } catch (cbErr) {
        if (cbErr instanceof ChatApiError) throw cbErr;
        throw new ChatApiError(`chat stream callback threw (event=${frame.event})`, 500, null);
      }
      // Advance Last-Event-ID ONLY after the frame's payload is parsed + dispatched,
      // so a frame whose content never reached the caller can't be skipped on resume.
      if (frame.seq != null) lastSeq = frame.seq;
    }
    return seen;
  };

  const backoff = (n: number) => new Promise((r) => setTimeout(r, RECONNECT_BACKOFF_MS * n));

  try {
    for (;;) {
      let seen: SendChatMessageResult | null;
      try {
        seen = await attemptStream();
      } catch (err) {
        // Terminal: HTTP error / server error-frame / abort → re-throw. A bare
        // network drop (fetch or body stream threw) is retryable.
        if (err instanceof ChatApiError) throw err;
        if (opts.signal?.aborted) throw err;
        if (attempt >= maxRetries) throw err;
        attempt += 1;
        await backoff(attempt);
        continue;
      }
      if (seen) {
        result = seen;
        break;
      }
      // Silent drop (no envelope) → reconnect from Last-Event-ID if attempts remain.
      if (opts.signal?.aborted) throw new ChatApiError("chat stream aborted", 0, null);
      if (attempt >= maxRetries) {
        throw new ChatApiError("chat stream ended without an envelope", 502, null);
      }
      attempt += 1;
      await backoff(attempt);
    }

    if (!result) {
      throw new ChatApiError("chat stream ended without an envelope", 502, null);
    }
    // Same drop-safe reply validation as sendChatMessage (single-sourced envelope).
    const replyParse = chatReplySchema.safeParse(result.reply);
    if (!replyParse.success) {
      captureException(replyParse.error, {
        route: "/api/chat/messages",
        chatSessionId: input.chatSessionId,
        validation: "chatReplySchema",
        transport: "sse",
      });
    }
    return result;
  } catch (err) {
    if (err instanceof ChatApiError && err.status === 404) {
      chatSessionEnsure.forgetChatSessionEnsured(input.chatSessionId);
    }
    captureException(err, {
      route: "/api/chat/messages",
      chatSessionId: input.chatSessionId,
      transport: "sse",
      status: err instanceof ChatApiError ? err.status : null,
    });
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
export async function listChatMessages(
  chatSessionId: string,
  sessionMeta?: ChatSessionEnsureMetadata,
  chatSessionEnsure: ChatSessionEnsureClient = legacyChatSessionEnsure,
): Promise<PersistedChatMessage[]> {
  // Self-trigger ensure-create + wait so this GET doesn't race past
  // the chat_sessions row creation. Same pattern as the fire-and-forget
  // helpers — see ensureServerChatSession docstring.
  await chatSessionEnsure.ensureServerChatSession({
    id: chatSessionId,
    onboardingSessionId: sessionMeta?.onboardingSessionId ?? chatSessionId,
    title: sessionMeta?.title ?? "Onboarding",
    isOnboarding: sessionMeta?.isOnboarding ?? true,
    activeEntityKey: sessionMeta?.activeEntityKey ?? null,
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
