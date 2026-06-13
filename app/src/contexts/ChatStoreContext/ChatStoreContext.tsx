import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { useApi } from "@/contexts/ApiContext";
import { makeEntityKey, type EntityKey, type EntityKind, type EntitySession } from "@/contexts/EntitySessionStoreContext";
import type { FFrame } from "@/types/onboarding";
import { compileScopeFilter, parseCanvasIntent, type ContentScope, type NormalizedBbox } from "@groundx/shared";

import {
  parseChatStoreSnapshot,
  STORAGE_VERSION,
  type SerializedEntitySession,
  type SerializedSession,
  type SerializedSnapshot,
} from "./parseChatStoreSnapshot";
import { resolvePinTarget, type PinResolution, type PinTargetTemplate } from "./resolvePinTarget";
import {
  EMPTY_PENDING_REPORT_OVERLAY,
  EMPTY_PENDING_SCHEMA_OVERLAY,
  EMPTY_VIEWER_SESSION,
} from "./types";
import type {
  CanvasIntent,
  ChatMessage,
  ChatSession,
  ChatStoreApi,
  ChatStoreState,
  NewMessageInput,
  NewViewerEventInput,
  ViewerEvent,
} from "./types";

const ChatStoreContext = createContext<ChatStoreApi | null>(null);

/**
 * Coerce an untrusted `currentIntent` value read back from the server
 * (`chat_sessions.current_intent_json` — arbitrary JSON) into a `CanvasIntent`.
 *
 * Full structural + variant validation via the shared `parseCanvasIntent`
 * (`2026-05-31-canvas-intent-schema-shared`): a value that is not a real
 * `CanvasIntent` — a bogus `kind`, a variant missing a required field, a
 * primitive/array/`{}` — coerces to `null` rather than masquerading as a typed
 * intent flowing into the orchestrator. The strict `currentIntent: CanvasIntent
 * | null` state type is therefore never populated from an unchecked cast. This
 * is the same `canvasIntentSchema` the middleware row mapper validates against
 * (one source of truth across both `current_intent_json` read boundaries).
 */
function coerceHydratedIntent(raw: unknown): CanvasIntent | null {
  return parseCanvasIntent(raw);
}

/**
 * The actions slice — `newSession`, `appendMessage`, etc. — is stable
 * across state changes. Consumers that ONLY need to dispatch (e.g.
 * the F5 chat input on submit) can subscribe to this context alone
 * and skip re-renders when unrelated state mutates.
 *
 * Concrete shape: every field in ChatStoreApi EXCEPT `state`.
 */
type ChatStoreActions = Omit<ChatStoreApi, "state">;

/**
 * A deterministic, stable string key for a `ContentScope`. Used to title the
 * per-scope chat session so re-resolving the same Workspace / Project nav
 * entry returns the same session row (rather than collide on one shared
 * session). Stable across reload because it derives only from the scope's own
 * fields; the compiled filter normalizes value/array forms.
 */
export function scopeSessionKey(scope: ContentScope): string {
  const filter = compileScopeFilter(scope.filter);
  const filterPart = filter ? `|${JSON.stringify(filter)}` : "";
  switch (scope.type) {
    case "bucket":
      return `scope:bucket:${scope.bucketId}${filterPart}`;
    case "group":
      return `scope:group:${scope.groupId}${filterPart}`;
    case "documents":
      return `scope:documents:${[...scope.documentIds].sort().join(",")}${filterPart}`;
    default:
      return "scope:unknown";
  }
}

/**
 * Best-effort inverse for {@link scopeSessionKey}. Product deep links (`/c/:id`)
 * may hydrate a scoped session without its route wrapper, so the steady shell
 * needs a read site for the persisted scope key. Complex compiled filters are
 * intentionally treated as unavailable instead of being guessed.
 */
export function scopeFromSessionKey(scopeKey: string | undefined): ContentScope | null {
  if (!scopeKey) return null;
  const [head, rawFilter] = scopeKey.split("|", 2);
  let filter: ContentScope["filter"] | undefined;
  if (rawFilter) {
    try {
      const parsed = JSON.parse(rawFilter) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.values(parsed).every(
          (value) => typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string")),
        )
      ) {
        filter = parsed as ContentScope["filter"];
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  if (head.startsWith("scope:bucket:")) {
    const bucketId = Number(head.slice("scope:bucket:".length));
    return Number.isFinite(bucketId) ? { type: "bucket", bucketId, ...(filter ? { filter } : {}) } : null;
  }
  if (head.startsWith("scope:group:")) {
    const groupId = Number(head.slice("scope:group:".length));
    return Number.isFinite(groupId) ? { type: "group", groupId, ...(filter ? { filter } : {}) } : null;
  }
  if (head.startsWith("scope:documents:")) {
    const encoded = head.slice("scope:documents:".length);
    const documentIds = encoded ? encoded.split(",").filter(Boolean) : [];
    return { type: "documents", documentIds, ...(filter ? { filter } : {}) };
  }
  return null;
}

export function titleForEnsure(session: ChatSession): string {
  if (!session.scopeKey || (session.title !== "Onboarding" && session.title !== "Untitled")) {
    return session.title;
  }
  const scope = scopeFromSessionKey(session.scopeKey);
  if (!scope) return session.title;
  if (scope.type === "bucket" && scope.filter) return "Project";
  if (scope.type === "bucket") return "Workspace";
  if (scope.type === "group") return "Group";
  if (scope.type === "documents") return "Documents";
  return session.title;
}

const ChatStoreStateContext = createContext<ChatStoreState | null>(null);
const ChatStoreActionsContext = createContext<ChatStoreActions | null>(null);

const STORAGE_KEY = "groundx-onboarding.chat-store.v1";
// STORAGE_VERSION + the Serialized* shapes are single-sourced in
// `parseChatStoreSnapshot.ts` (the localStorage trust-boundary validator).
/**
 * Maximum messages persisted per session. In-memory messages are not
 * yet trimmed (compression will drop older ones into summaries before
 * this matters for re-render cost); this cap protects localStorage
 * from unbounded growth, which would silently fail with
 * QuotaExceededError once a user accumulates ~5MB of chat. Bounded
 * deliberately — bumping this is fine if you're sure the disk budget
 * is there.
 */
const MAX_PERSISTED_MESSAGES_PER_SESSION = 500;
/**
 * In-memory cap on per-session viewer history. Only the recent slice
 * informs LLM context bundling (~10 events), and older entries are
 * pure noise from a cost perspective. Cap at 50 to give some headroom
 * above the bundling slice for debugging without unbounded growth.
 */
const MAX_VIEWER_HISTORY_PER_SESSION = 50;
/**
 * Legacy key from the standalone EntityRegistry persistence (Phase 2
 * of the state-preservation work). On ChatStore first mount we read
 * this once, fold its entities into a fresh "onboarding" session,
 * then delete it.
 */
const LEGACY_ENTITY_REGISTRY_KEY = "groundx-onboarding.entity-registry.v1";

/**
 * Generate an anonymous owner key (`anon-<uuid>`). Stable across the
 * browser's lifetime, persisted in localStorage with the rest of
 * the store.
 */
function mintAnonOwnerKey(): string {
  return `anon-${cryptoRandom()}`;
}

function mintSessionId(): string {
  return `c-${cryptoRandom()}`;
}

function mintMessageId(): string {
  return `m-${cryptoRandom()}`;
}

function mintViewerEventId(): string {
  return `v-${cryptoRandom()}`;
}

/**
 * crypto.randomUUID() is widely available but not universal in jsdom
 * test environments. Fall back to Math.random for tests.
 */
function cryptoRandom(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ============================================================================
// Persistence
// ============================================================================

// `SerializedSnapshot` / `SerializedSession` / `SerializedEntitySession` are
// single-sourced (Zod `z.infer<>`) in `parseChatStoreSnapshot.ts` — imported
// above. `serialize` writes the shape the validator reads back. The v1
// serialization deliberately omits gate / summaries / viewerHistory /
// currentIntent (ephemeral or not-yet-populated); they join vNext as they land.

function serialize(state: ChatStoreState): string {
  const sessions: SerializedSession[] = [];
  for (const session of state.sessions.values()) {
    const entities: Array<[EntityKey, SerializedEntitySession]> = [];
    for (const [key, entity] of session.entities) {
      entities.push([
        key,
        {
          kind: entity.kind,
          id: entity.id,
          lastFrame: entity.lastFrame,
          completedFrames: [...entity.completedFrames],
          createdAt: entity.createdAt,
          lastVisitedAt: entity.lastVisitedAt,
        },
      ]);
    }
    // Persist only the most-recent N messages. In-memory keeps the full
    // list (semantic continuity for the active chat) but localStorage
    // stays bounded so a chatty session can't cause QuotaExceededError
    // on the next persist tick.
    const persistedMessages =
      session.messages.length > MAX_PERSISTED_MESSAGES_PER_SESSION
        ? session.messages.slice(-MAX_PERSISTED_MESSAGES_PER_SESSION)
        : session.messages;
    sessions.push({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: persistedMessages,
      entities,
      activeEntityKey: session.activeEntityKey,
      isOnboardingSession: session.isOnboardingSession,
      signupOpen: session.signupOpen,
      ...(session.scopeKey ? { scopeKey: session.scopeKey } : {}),
    });
  }
  const snapshot: SerializedSnapshot = {
    version: STORAGE_VERSION,
    ownerKey: state.ownerKey,
    activeSessionId: state.activeSessionId,
    sessions,
  };
  return JSON.stringify(snapshot);
}

function deserialize(raw: string): ChatStoreState | null {
  try {
    // localStorage is untrusted input — parse + validate at the boundary, never
    // cast. A corrupt / wrong-version / structurally wrong blob (even one that
    // JSON-parses) returns `null`, so rehydrate falls back to legacy migration
    // / a fresh store exactly as the old throw-path did.
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const parsed = parseChatStoreSnapshot(json);
    if (!parsed) return null;
    const sessions = new Map<string, ChatSession>();
    for (const s of parsed.sessions) {
      const entities = new Map<EntityKey, EntitySession>();
      for (const [key, entity] of s.entities) {
        // Restore lastFrame VERBATIM — resume lands on the frame the
        // user was actually on, even when they navigated "backwards"
        // (f7 → f5) before reloading. An earlier "highest frame ever
        // reached" watermark here caused the stale-resume bug: once f7
        // entered completedFrames, every reload resumed f7 no matter
        // where the user had moved since.
        entities.set(key, {
          kind: entity.kind,
          id: entity.id,
          lastFrame: entity.lastFrame,
          completedFrames: new Set<FFrame>(entity.completedFrames),
          createdAt: entity.createdAt,
          lastVisitedAt: entity.lastVisitedAt,
        });
      }
      sessions.set(s.id, {
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messages: s.messages,
        summaries: [],
        entities,
        activeEntityKey: s.activeEntityKey,
        viewerHistory: [],
        currentIntent: null,
        pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
        reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
        viewer: EMPTY_VIEWER_SESSION,
        gate: { status: "idle" },
        signupOpen: s.signupOpen,
        isOnboardingSession: s.isOnboardingSession,
        ...(s.scopeKey ? { scopeKey: s.scopeKey } : {}),
      });
    }
    return { ownerKey: parsed.ownerKey, sessions, activeSessionId: parsed.activeSessionId };
  } catch {
    return null;
  }
}

/**
 * One-shot migration from the standalone EntityRegistry localStorage
 * payload (the Phase-2 format that pre-dates this ChatStore). If the
 * legacy key is present and we DON'T already have a ChatStore
 * payload, we fold the legacy entities into a fresh onboarding
 * session. Then we delete the legacy key.
 */
function migrateLegacyEntityRegistry(): ChatStoreState | null {
  if (typeof window === "undefined") return null;
  let legacyRaw: string | null;
  try {
    legacyRaw = window.localStorage.getItem(LEGACY_ENTITY_REGISTRY_KEY);
  } catch {
    return null;
  }
  if (!legacyRaw) return null;
  try {
    const legacy = JSON.parse(legacyRaw) as {
      version: number;
      activeKey: EntityKey | null;
      entities: Array<[EntityKey, SerializedEntitySession]>;
    };
    if (legacy.version !== 1) {
      window.localStorage.removeItem(LEGACY_ENTITY_REGISTRY_KEY);
      return null;
    }
    const entities = new Map<EntityKey, EntitySession>();
    for (const [key, e] of legacy.entities) {
      entities.set(key, {
        kind: e.kind,
        id: e.id,
        lastFrame: e.lastFrame,
        completedFrames: new Set(e.completedFrames),
        createdAt: e.createdAt,
        lastVisitedAt: e.lastVisitedAt,
      });
    }
    const now = Date.now();
    const sessionId = mintSessionId();
    const session: ChatSession = {
      id: sessionId,
      title: "Onboarding",
      createdAt: now,
      updatedAt: now,
      messages: [],
      summaries: [],
      entities,
      activeEntityKey: legacy.activeKey,
      viewerHistory: [],
      currentIntent: null,
      pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
      reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
      viewer: EMPTY_VIEWER_SESSION,
      gate: { status: "idle" },
      signupOpen: false,
      isOnboardingSession: true,
    };
    window.localStorage.removeItem(LEGACY_ENTITY_REGISTRY_KEY);
    return {
      ownerKey: mintAnonOwnerKey(),
      sessions: new Map([[sessionId, session]]),
      activeSessionId: sessionId,
    };
  } catch {
    return null;
  }
}

function rehydrate(): ChatStoreState | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw) {
    const fromCurrent = deserialize(raw);
    if (fromCurrent) return fromCurrent;
  }
  // No ChatStore payload — try legacy EntityRegistry payload.
  return migrateLegacyEntityRegistry();
}

function persist(state: ChatStoreState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Quota exceeded / disabled — fall through; in-memory state still works.
  }
}

// ============================================================================
// Provider
// ============================================================================

interface ChatStoreProviderProps {
  children: ReactNode;
  /**
   * Tests can preload an owner key, sessions, and an active id.
   * When provided, takes priority over localStorage rehydration.
   * Production omits these.
   */
  initialOwnerKey?: string;
  initialSessions?: ReadonlyMap<string, ChatSession>;
  initialActiveSessionId?: string | null;
  /**
   * Suppress persistence + rehydration. Used by tests that need a
   * clean in-memory store (and don't want to coordinate localStorage
   * cleanup).
   */
  ephemeral?: boolean;
  /**
   * If true and rehydration returns nothing AND no `initialSessions`,
   * auto-create a single default onboarding session so consumers
   * always have an active session to operate on. EntitySessionStoreProvider
   * sets this; ChatStore-only tests leave it false to verify the
   * "no sessions" baseline.
   */
  autoSeedDefaultSession?: boolean;
}

/**
 * ChatStore — the **root state container** per
 * /memory/project_chat_session_model.md. Owns the user's collection
 * of chat sessions and which one is active. Each session contains
 * its own messages, entity registry, summaries, viewer trail, and
 * (for the onboarding session only) gate + signupOpen.
 *
 * Action callbacks are reference-stable — they read latest state
 * via a ref so consumers can wire them to useEffects without
 * causing infinite loops. Same idiom as
 * OnboardingSessionContext's facade.
 */
export const ChatStoreProvider: FC<ChatStoreProviderProps> = ({
  children,
  initialOwnerKey,
  initialSessions,
  initialActiveSessionId,
  ephemeral = false,
  autoSeedDefaultSession = false,
}) => {
  const api = useApi();
  const [state, setState] = useState<ChatStoreState>(() => {
    // If the caller pre-loaded sessions or an explicit active id,
    // that wins outright — tests use this to construct a known state.
    if (initialSessions || initialActiveSessionId !== undefined) {
      return {
        ownerKey: initialOwnerKey ?? mintAnonOwnerKey(),
        sessions: initialSessions ?? new Map(),
        activeSessionId: initialActiveSessionId ?? null,
      };
    }
    if (ephemeral) {
      return {
        ownerKey: initialOwnerKey ?? mintAnonOwnerKey(),
        sessions: new Map(),
        activeSessionId: null,
      };
    }
    const persisted = rehydrate();
    if (persisted) return persisted;
    if (autoSeedDefaultSession) {
      // Mint a fresh "implicit onboarding" session. F1 picker views
      // and other consumers that call upsertEntityAndActivate need
      // an active session to operate on. Default for production +
      // EntitySessionStoreProvider; off for ChatStore-only tests.
      const now = Date.now();
      const sessionId = mintSessionId();
      const session: ChatSession = {
        id: sessionId,
        title: "Onboarding",
        createdAt: now,
        updatedAt: now,
        messages: [],
        summaries: [],
        entities: new Map(),
        activeEntityKey: null,
        viewerHistory: [],
        currentIntent: null,
        pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
        reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
        viewer: EMPTY_VIEWER_SESSION,
        gate: { status: "idle" },
        signupOpen: false,
        isOnboardingSession: true,
      };
      return {
        ownerKey: mintAnonOwnerKey(),
        sessions: new Map([[sessionId, session]]),
        activeSessionId: sessionId,
      };
    }
    return { ownerKey: mintAnonOwnerKey(), sessions: new Map(), activeSessionId: null };
  });

  // Latest-state ref so synchronous actions (e.g. resolveSessionForScope,
  // which must RETURN a session id in the same tick) can read the current
  // sessions without waiting for a functional-updater to flush. Assigned
  // during render — committed before any event handler that calls an action.
  const stateRef = useRef(state);
  stateRef.current = state;
  const scopeSessionIdsRef = useRef<Map<string, string>>(new Map());

  // Persist on every commit (except in ephemeral mode).
  useEffect(() => {
    if (ephemeral) return;
    persist(state);
  }, [state, ephemeral]);

  // Eagerly create the server-side chat_sessions row for the active
  // session. Without this, RT-02..05 endpoints (viewer-events POST,
  // entity PUT, chat-session PATCH, messages GET) all 404 in the
  // window between client-side session mint and the first chat send
  // — `sendChatMessage` has its own lazy ensure-create cache but
  // those telemetry/state-sync endpoints fire well before the first
  // chat. `ensureServerChatSession` is idempotent (Set-cached) so
  // re-renders don't churn duplicate POSTs.
  useEffect(() => {
    if (ephemeral) return;
    const sid = state.activeSessionId;
    if (!sid) return;
    const session = state.sessions.get(sid);
    if (!session) return;
    void (async () => {
      try {
        if (session.isOnboardingSession) {
          await api.session.ensureAnonSession();
        }
        await api.chat.ensureServerChatSession({
          id: sid,
          onboardingSessionId: sid,
          title: titleForEnsure(session),
          isOnboarding: session.scopeKey ? false : session.isOnboardingSession,
          activeEntityKey: session.activeEntityKey,
        });
      } catch {
        // Non-fatal bootstrap: the next send or state write can retry through
        // the same injected client while the preview remains usable.
      }
    })();
  }, [api.chat, api.session, state.activeSessionId, state.sessions, ephemeral]);

  // ----- session-level actions ---------------------------------------

  const newSession = useCallback(
    (options?: { isOnboardingSession?: boolean; title?: string; scopeKey?: string }): string => {
      const id = mintSessionId();
      setState((prev) => {
        const now = Date.now();
        const session: ChatSession = {
          id,
          title: options?.title ?? "Untitled",
          createdAt: now,
          updatedAt: now,
          messages: [],
          summaries: [],
          entities: new Map(),
          activeEntityKey: null,
          viewerHistory: [],
          currentIntent: null,
          pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
          reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
          viewer: EMPTY_VIEWER_SESSION,
          gate: { status: "idle" },
          signupOpen: false,
          isOnboardingSession: Boolean(options?.isOnboardingSession),
          ...(options?.scopeKey ? { scopeKey: options.scopeKey } : {}),
        };
        const sessions = new Map(prev.sessions);
        sessions.set(id, session);
        return { ...prev, sessions, activeSessionId: id };
      });
      return id;
    },
    [],
  );

  const switchTo = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.sessions.has(id)) return prev;
      if (prev.activeSessionId === id) return prev;
      return { ...prev, activeSessionId: id };
    });
  }, []);

  // 2026-05-31-onboarding-experiences — resolve (ensure-create + activate) the
  // stable session for a `ContentScope`. Idempotent per scope: the deterministic
  // `scopeSessionKey` is stored on the session, so a second resolve for the
  // same scope returns the SAME row. Reuses `newSession` (no forked creation).
  const resolveSessionForScope = useCallback(
    (scope: ContentScope, options?: { title?: string }): string => {
      const key = scopeSessionKey(scope);
      // Synchronous decision off the latest-state ref so we can RETURN the id
      // in the same tick (the caller routes to it immediately).
      const match = [...stateRef.current.sessions.values()].find((s) => s.scopeKey === key);
      if (match) {
        scopeSessionIdsRef.current.set(key, match.id);
        switchTo(match.id);
        return match.id;
      }
      const pendingId = scopeSessionIdsRef.current.get(key);
      if (pendingId) {
        switchTo(pendingId);
        return pendingId;
      }
      // Ensure-create via the shared newSession path (no forked creation),
      // tagging the new row with the scope key so re-resolve is idempotent.
      const id = newSession({ title: options?.title, scopeKey: key });
      scopeSessionIdsRef.current.set(key, id);
      return id;
    },
    [newSession, switchTo],
  );

  const appendMessage = useCallback((input: NewMessageInput) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const now = Date.now();
      const message: ChatMessage = {
        id: mintMessageId(),
        role: input.role,
        content: input.content,
        timestamp: now,
        compressedIntoSummaryId: null,
        ...(input.citations && input.citations.length > 0 ? { citations: input.citations } : {}),
      };
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        messages: [...current.messages, message],
        updatedAt: now,
      });
      return { ...prev, sessions };
    });
  }, []);

  // ----- entity actions ---------------------------------------------
  // These replace the standalone EntityRegistry's mutation API. The
  // legacy `useEntitySessionStore()` hook is now a derived facade over
  // these (see EntitySessionStoreContext.tsx).

  const activateEntity = useCallback((key: EntityKey | null) => {
    // RT-04 — capture the post-mutation activeEntityKey so we PATCH
    // the chat_sessions row to match. Without this, the server's
    // `active_entity_key` column goes stale the moment the user
    // navigates away from the first activated entity, and
    // chatHandler.ts:204 picks up the wrong scope for bundling.
    let patchPayload: { chatSessionId: string; activeEntityKey: string | null } | null = null;

    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (current.activeEntityKey === key) return prev;
      if (key !== null && !current.entities.has(key)) return prev;
      const sessions = new Map(prev.sessions);
      const entities = new Map(current.entities);
      if (key !== null) {
        const entity = entities.get(key);
        if (entity) entities.set(key, { ...entity, lastVisitedAt: Date.now() });
      }
      sessions.set(prev.activeSessionId, {
        ...current,
        entities,
        activeEntityKey: key,
        updatedAt: Date.now(),
      });
      patchPayload = { chatSessionId: prev.activeSessionId, activeEntityKey: key };
      return { ...prev, sessions };
    });

    if (patchPayload) {
      void api.chat.patchChatSession(patchPayload);
    }
  }, [api.chat]);

  const upsertEntityAndActivate = useCallback(
    (kind: EntityKind, id: string, defaults: Partial<EntitySession>): EntityKey => {
      const key = makeEntityKey(kind, id);
      // RT-03 — capture the post-mutation entity from inside the
      // updater so we PUT the latest committed state, not a stale
      // closure. setState may run twice in StrictMode; capturing
      // here keeps the PUT consistent with what actually landed.
      type PutPayload = {
        chatSessionId: string;
        entityKey: EntityKey;
        lastFrame: FFrame;
        completedFramesJson: string;
      };
      // Use a 1-slot tuple so the closure-mutation assignment doesn't
      // confuse TS's flow-analysis narrowing (which otherwise sees the
      // outer `let` as `never` after the truthy-check).
      const putPayloadBox: { current: PutPayload | null } = { current: null };

      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const existing = current.entities.get(key);
        // Idempotent: entity already exists AND already active → no-op.
        if (existing && current.activeEntityKey === key) return prev;
        const now = Date.now();
        const entities = new Map(current.entities);
        let committed: EntitySession;
        if (existing) {
          committed = { ...existing, lastVisitedAt: now };
        } else {
          committed = {
            kind,
            id,
            lastFrame: "f1",
            completedFrames: new Set(),
            createdAt: now,
            lastVisitedAt: now,
            ...defaults,
          };
        }
        entities.set(key, committed);
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          entities,
          activeEntityKey: key,
          updatedAt: now,
        });
        putPayloadBox.current = {
          chatSessionId: prev.activeSessionId,
          entityKey: key,
          lastFrame: committed.lastFrame,
          completedFramesJson: JSON.stringify([...committed.completedFrames]),
        };
        return { ...prev, sessions };
      });

      const putPayload = putPayloadBox.current;
      if (putPayload) {
        // Fire-and-forget — never throws (Sentry catches failures).
        // Server-side merge preserves scope refs the client doesn't
        // know about. Without this, chatHandler.ts:249 would always
        // see [] for the active-entity context axis.
        void api.chat.upsertChatSessionEntity(putPayload);
        // RT-04 — also update the chat_sessions row's
        // active_entity_key column so chatHandler.ts:204's
        // getChatSession read sees the live value, not a stale one
        // from the session-create moment.
        void api.chat.patchChatSession({ chatSessionId: putPayload.chatSessionId, activeEntityKey: key });
      }
      return key;
    },
    [api.chat],
  );

  const appendViewerEvent = useCallback((input: NewViewerEventInput) => {
    // We need the chatSessionId for the POST AFTER the in-memory
    // append commits; capture it from inside the updater so we use
    // the correct value even if React batches multiple appends.
    let postPayload: {
      chatSessionId: string;
      timestamp: number;
      entityKey: string | null;
      action: ViewerEvent["action"];
      source: ViewerEvent["source"];
      detail?: Record<string, unknown>;
    } | null = null;

    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const event: ViewerEvent = {
        id: mintViewerEventId(),
        timestamp: Date.now(),
        entityKey: input.entityKey,
        action: input.action,
        source: input.source,
        detail: input.detail,
      };
      // Cap viewerHistory at MAX_VIEWER_HISTORY_PER_SESSION; oldest
      // entries drop off the front. Only the recent slice (~10) informs
      // LLM context bundling, so older events are pure noise.
      const next = [...current.viewerHistory, event];
      const viewerHistory =
        next.length > MAX_VIEWER_HISTORY_PER_SESSION
          ? next.slice(-MAX_VIEWER_HISTORY_PER_SESSION)
          : next;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewerHistory,
        updatedAt: event.timestamp,
      });
      // RT-02 — capture the payload for the durable POST. We POST
      // OUTSIDE the updater so the in-memory append commits even if
      // the network call fails (Sentry catches that). Without this,
      // chatHandler's listViewerEvents would always return [] and
      // the LLM context bundle would be missing the viewer axis.
      postPayload = {
        chatSessionId: prev.activeSessionId,
        timestamp: event.timestamp,
        entityKey: event.entityKey,
        action: event.action,
        source: event.source,
        detail: event.detail,
      };
      return { ...prev, sessions };
    });

    if (postPayload) {
      // Fire-and-forget — recordViewerEvent never throws (Sentry
      // captures on failure). The optimistic in-memory append is
      // the source of truth for the visible session; this write
      // makes the next chat turn's LLM context bundle complete.
      void api.viewerEvents.recordViewerEvent(postPayload);
    }
  }, [api.viewerEvents]);

  const setCurrentIntent = useCallback((intent: CanvasIntent | null) => {
    // RT-04 — capture the post-mutation chatSessionId from inside
    // the updater so the PATCH runs only when the in-memory change
    // actually committed (not on a reference-equality short-circuit).
    let patchPayload: {
      chatSessionId: string;
      currentIntent: Record<string, unknown> | null;
    } | null = null;

    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      // Reference equality short-circuit so re-dispatching the same
      // intent doesn't churn subscribers (or the network).
      if (current.currentIntent === intent) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        currentIntent: intent,
        updatedAt: Date.now(),
      });
      patchPayload = {
        chatSessionId: prev.activeSessionId,
        currentIntent: intent,
      };
      return { ...prev, sessions };
    });

    if (patchPayload) {
      // Fire-and-forget. Without this, chatHandler reads stale
      // currentIntent every chat turn (only the creation-time
      // value, typically null) — the LLM never knows what view
      // the user is on.
      void api.chat.patchChatSession(patchPayload);
    }
  }, [api.chat]);

  const updateActiveEntity = useCallback((updater: (session: EntitySession) => EntitySession) => {
    // RT-03 — capture the post-mutation entity from inside the
    // updater so the PUT carries the just-committed state, not
    // a stale snapshot. See upsertEntityAndActivate above for
    // the same pattern.
    let putPayload: {
      chatSessionId: string;
      entityKey: EntityKey;
      lastFrame: FFrame;
      completedFramesJson: string;
    } | null = null;

    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current || !current.activeEntityKey) return prev;
      const entity = current.entities.get(current.activeEntityKey);
      if (!entity) return prev;
      const next = updater(entity);
      if (next === entity) return prev;
      const committed: EntitySession = { ...next, lastVisitedAt: Date.now() };
      const entities = new Map(current.entities);
      entities.set(current.activeEntityKey, committed);
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, { ...current, entities, updatedAt: Date.now() });
      putPayload = {
        chatSessionId: prev.activeSessionId,
        entityKey: current.activeEntityKey,
        lastFrame: committed.lastFrame,
        completedFramesJson: JSON.stringify([...committed.completedFrames]),
      };
      return { ...prev, sessions };
    });

    if (putPayload) {
      void api.chat.upsertChatSessionEntity(putPayload);
    }
  }, [api.chat]);

  /**
   * RT-05 — merge a server-provided list of ChatSessionRecord into
   * the in-memory map. Used by the on-auth-resolved hook (see
   * `useHydrateFromServer` below) so a signed-in user on a fresh
   * browser sees their full session history.
   *
   * Merge rule per `project_chat_session_model.md`:
   *   - Server is authoritative for fields it carries (title,
   *     activeEntityKey, currentIntent, updatedAt).
   *   - Client-only fields (messages / summaries / entities /
   *     viewerHistory / gate / signupOpen / isOnboardingSession-flag)
   *     are preserved on sessions present in both stores; defaulted
   *     to empty for sessions only on the server.
   */
  const hydrateFromServer = useCallback(
    (
      serverSessions: ReadonlyArray<{
        id: string;
        title: string;
        isOnboarding: boolean;
        activeEntityKey: string | null;
        currentIntent: Record<string, unknown> | null;
        createdAt: string;
        updatedAt: string;
      }>,
    ) => {
      if (serverSessions.length === 0) return;
      // Viewer state is client-only — it is NOT persisted on the
      // chat_sessions row (the Phase-1 viewer_* columns were dropped in
      // `2026-05-31-viewer-history-column-drop` as write-NULL-only dead
      // plumbing). The server therefore carries no viewer slots to
      // hydrate; a server-only session starts with the empty viewer
      // session + empty schema overlay, exactly as the always-null
      // hydrate did before the drop. A session already present locally
      // keeps its own client-only state via the spread below.
      setState((prev) => {
        const nextSessions = new Map(prev.sessions);
        for (const remote of serverSessions) {
          const local = nextSessions.get(remote.id);
          const merged: ChatSession = local
            ? {
                ...local,
                // Server wins on fields it owns.
                title: remote.title,
                activeEntityKey: (remote.activeEntityKey as EntityKey | null) ?? null,
                currentIntent: coerceHydratedIntent(remote.currentIntent),
                viewer: EMPTY_VIEWER_SESSION,
                pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
                createdAt: new Date(remote.createdAt).getTime(),
                updatedAt: new Date(remote.updatedAt).getTime(),
              }
            : {
                id: remote.id,
                title: remote.title,
                createdAt: new Date(remote.createdAt).getTime(),
                updatedAt: new Date(remote.updatedAt).getTime(),
                messages: [],
                summaries: [],
                entities: new Map(),
                activeEntityKey: (remote.activeEntityKey as EntityKey | null) ?? null,
                viewerHistory: [],
                currentIntent: coerceHydratedIntent(remote.currentIntent),
                pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
                // Report overlay is client-only (not DB-hydrated, like
                // messages/entities); a server-only session starts empty.
                reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
                viewer: EMPTY_VIEWER_SESSION,
                gate: { status: "idle" },
                signupOpen: false,
                isOnboardingSession: remote.isOnboarding,
              };
          nextSessions.set(remote.id, merged);
        }
        return { ...prev, sessions: nextSessions };
      });
    },
    [],
  );

  // UI-01 Phase 2 — schema-overlay mutation actions. Both update
  // `pendingSchemaOverlay` on the active session. Idempotent: adding
  // a field with an existing id is a no-op; removing a field id
  // already in the set is a no-op.
  const addSchemaField = useCallback(
    (input: import("./types").SchemaFieldAddition) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        // Idempotent — same field id wins.
        if (current.pendingSchemaOverlay.addedFields.some((f) => f.id === input.id)) return prev;
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          pendingSchemaOverlay: {
            ...current.pendingSchemaOverlay,
            addedFields: [...current.pendingSchemaOverlay.addedFields, input],
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  const removeSchemaField = useCallback(
    (fieldId: string) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        if (current.pendingSchemaOverlay.removedFieldIds.has(fieldId)) return prev;
        const nextRemoved = new Set(current.pendingSchemaOverlay.removedFieldIds);
        nextRemoved.add(fieldId);
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          pendingSchemaOverlay: {
            ...current.pendingSchemaOverlay,
            removedFieldIds: nextRemoved,
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  // F3a inline editor — commit per-field overrides into the
  // pendingSchemaOverlay. Shallow-merge onto any existing patch for
  // the same field id so editing the prompt and later editing the
  // type doesn't clobber the first edit. SchemaView merges this onto
  // the manifest field at render time.
  const editSchemaField = useCallback(
    (fieldId: string, edit: import("./types").SchemaFieldEdit) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const existing = current.pendingSchemaOverlay.editedFields.get(fieldId) ?? {};
        const merged: import("./types").SchemaFieldEdit = { ...existing, ...edit };
        // Strip keys that match the manifest (we don't have the
        // manifest in scope here; the noise is tolerable — applyOverlay
        // will collapse no-op edits at render time).
        const nextEdited = new Map(current.pendingSchemaOverlay.editedFields);
        nextEdited.set(fieldId, merged);
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          pendingSchemaOverlay: {
            ...current.pendingSchemaOverlay,
            editedFields: nextEdited,
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  const resetSchemaFieldEdit = useCallback((fieldId: string) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (!current.pendingSchemaOverlay.editedFields.has(fieldId)) return prev;
      const nextEdited = new Map(current.pendingSchemaOverlay.editedFields);
      nextEdited.delete(fieldId);
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        pendingSchemaOverlay: {
          ...current.pendingSchemaOverlay,
          editedFields: nextEdited,
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // F3a propose-cards — surface above the list. Idempotent on
  // (categoryId, name) so a chat turn that re-proposes the same field
  // doesn't pile a duplicate row.
  const enqueueFieldProposal = useCallback(
    (proposal: Omit<import("./types").SchemaFieldProposal, "id">) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const dup = current.pendingSchemaOverlay.pendingFieldProposals.some(
          (p) => p.categoryId === proposal.categoryId && p.name === proposal.name,
        );
        if (dup) return prev;
        const id = `prop-${cryptoRandom()}`;
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          pendingSchemaOverlay: {
            ...current.pendingSchemaOverlay,
            pendingFieldProposals: [
              ...current.pendingSchemaOverlay.pendingFieldProposals,
              { id, ...proposal },
            ],
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  const acceptFieldProposal = useCallback((proposalId: string): string | null => {
    let mintedFieldId: string | null = null;
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const proposal = current.pendingSchemaOverlay.pendingFieldProposals.find(
        (p) => p.id === proposalId,
      );
      if (!proposal) return prev;
      mintedFieldId = `field_${proposal.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${cryptoRandom().slice(0, 6)}`;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        pendingSchemaOverlay: {
          ...current.pendingSchemaOverlay,
          addedFields: [
            ...current.pendingSchemaOverlay.addedFields,
            {
              id: mintedFieldId,
              categoryId: proposal.categoryId,
              name: proposal.name,
              type: proposal.type,
              description: proposal.description,
            },
          ],
          pendingFieldProposals: current.pendingSchemaOverlay.pendingFieldProposals.filter(
            (p) => p.id !== proposalId,
          ),
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
    return mintedFieldId;
  }, []);

  const dismissFieldProposal = useCallback((proposalId: string) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (!current.pendingSchemaOverlay.pendingFieldProposals.some((p) => p.id === proposalId)) {
        return prev;
      }
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        pendingSchemaOverlay: {
          ...current.pendingSchemaOverlay,
          pendingFieldProposals: current.pendingSchemaOverlay.pendingFieldProposals.filter(
            (p) => p.id !== proposalId,
          ),
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // `add-pinned-samples-row` — sample-pinning + focused-category actions.
  const pinSample = useCallback((sampleId: string) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const pinned = current.pendingSchemaOverlay.pinnedSamples;
      if (pinned.includes(sampleId)) return prev;
      if (pinned.length >= 3) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        pendingSchemaOverlay: {
          ...current.pendingSchemaOverlay,
          pinnedSamples: [...pinned, sampleId],
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  const unpinSample = useCallback((sampleId: string) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (!current.pendingSchemaOverlay.pinnedSamples.includes(sampleId)) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        pendingSchemaOverlay: {
          ...current.pendingSchemaOverlay,
          pinnedSamples: current.pendingSchemaOverlay.pinnedSamples.filter((id) => id !== sampleId),
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  const setFocusedCategory = useCallback((categoryId: string | null) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (current.pendingSchemaOverlay.focusedCategoryId === categoryId) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        pendingSchemaOverlay: {
          ...current.pendingSchemaOverlay,
          focusedCategoryId: categoryId,
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // ── Report-builder section actions (smart-report Phase 4) ──────────
  // The `report`-kind siblings of addSchemaField / editSchemaField /
  // removeSchemaField, mutating `reportOverlay` on the active session. The
  // builder's UI controls call these; Phase 5's `*.tools.ts` reuse them.

  const addReportSection = useCallback((input: import("./types").ReportSectionItem) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      // Idempotent on id.
      if (current.reportOverlay.addedFields.some((s) => s.id === input.id)) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        reportOverlay: {
          ...current.reportOverlay,
          addedFields: [...current.reportOverlay.addedFields, input],
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  const editReportSection = useCallback(
    (sectionId: string, edit: import("./types").ReportSectionEdit) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const existing = current.reportOverlay.editedFields.get(sectionId) ?? {};
        const merged: import("./types").ReportSectionEdit = { ...existing, ...edit };
        const nextEdited = new Map(current.reportOverlay.editedFields);
        nextEdited.set(sectionId, merged);
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          reportOverlay: {
            ...current.reportOverlay,
            editedFields: nextEdited,
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  const removeReportSection = useCallback((sectionId: string) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (current.reportOverlay.removedFieldIds.has(sectionId)) return prev;
      const nextRemoved = new Set(current.reportOverlay.removedFieldIds);
      nextRemoved.add(sectionId);
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        reportOverlay: {
          ...current.reportOverlay,
          removedFieldIds: nextRemoved,
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // ── Pin + section-proposal actions (smart-report Phase 5) ──────────────
  // The pin affordance + `pin_to_report` tool are the real callers of the pure
  // `resolvePinTarget` resolver. The proposal actions are the `report`-kind
  // siblings of enqueue/accept/dismissFieldProposal.

  const pinToReport = useCallback((input: import("./types").PinToReportInput): PinResolution => {
    // The available SAVED report templates the user could target. v1
    // (onboarding) has none yet — the Save/persist endpoint is Phase 6 — so
    // the resolution is `prompt-new-only`. The in-memory `reportOverlay` IS the
    // single draft target; landing into it is NOT auto-creating a saved
    // template (the "no silent auto-create" rule is about saved templates).
    // Phase 6 sources this list from `listTemplates({kind:"report"})`.
    const available: PinTargetTemplate[] = [];
    const resolution = resolvePinTarget(available, {
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    });
    if (input.resolveOnly) return resolution;

    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const id = `sec-pin-${cryptoRandom().slice(0, 8)}`;
      const section: import("./types").ReportSectionItem = {
        id,
        // The pinned section's display name derives from the turn; the user
        // can rename it in the builder. Literal-only (#12).
        name: "pinned_answer",
        renderAs: "PARAGRAPH",
        // The question IS the literal turn text (#12 — no auto-variable inference).
        question: input.text,
        instructions: [],
        variables: [],
        pinnedFromTurnId: input.turnId,
      };
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        reportOverlay: {
          ...current.reportOverlay,
          addedFields: [...current.reportOverlay.addedFields, section],
          // Persist an explicitly-targeted template id so the render surface
          // picks up the right template — the read↔write round-trip for
          // `reportOverlay.templateId` (the render reads it; the pin path is its
          // writer). NOT auto-creating a SAVED template (Pin→template = NO auto);
          // onboarding pins pass none (no saved template yet) → unchanged. The
          // onboarding-bootstrap writer is `report-default-template`.
          ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
    return resolution;
  }, []);

  const enqueueReportProposal = useCallback(
    (proposal: Omit<import("./types").ReportSectionProposal, "id">) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        // Idempotent on name (the report sibling of the (categoryId,name) dedupe).
        const dup = current.reportOverlay.pendingFieldProposals.some((p) => p.name === proposal.name);
        if (dup) return prev;
        const id = `rprop-${cryptoRandom()}`;
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          reportOverlay: {
            ...current.reportOverlay,
            pendingFieldProposals: [
              ...current.reportOverlay.pendingFieldProposals,
              { id, ...proposal },
            ],
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  const acceptReportProposal = useCallback((proposalId: string): string | null => {
    let mintedSectionId: string | null = null;
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const proposal = current.reportOverlay.pendingFieldProposals.find((p) => p.id === proposalId);
      if (!proposal) return prev;
      mintedSectionId = `sec_${proposal.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${cryptoRandom().slice(0, 6)}`;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        reportOverlay: {
          ...current.reportOverlay,
          addedFields: [
            ...current.reportOverlay.addedFields,
            {
              id: mintedSectionId,
              name: proposal.name,
              renderAs: proposal.renderAs,
              question: proposal.question,
              instructions: [],
              variables: [],
            },
          ],
          pendingFieldProposals: current.reportOverlay.pendingFieldProposals.filter(
            (p) => p.id !== proposalId,
          ),
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
    return mintedSectionId;
  }, []);

  const dismissReportProposal = useCallback((proposalId: string) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (!current.reportOverlay.pendingFieldProposals.some((p) => p.id === proposalId)) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        reportOverlay: {
          ...current.reportOverlay,
          pendingFieldProposals: current.reportOverlay.pendingFieldProposals.filter(
            (p) => p.id !== proposalId,
          ),
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // `schema-agent-chat-affordances`: emit an assistant bubble from the
  // Schema-Agent flow (e.g. confidence-delta narration after a rerun).
  // Pushes a new ChatMessage with `agent-<rand>` id prefix so ChatColumn
  // can distinguish agent-injected bubbles from user-driven turns.
  const appendAgentMessage = useCallback((content: string): string | null => {
    let mintedId: string | null = null;
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      mintedId = `agent-${cryptoRandom()}`;
      const message: import("./types").ChatMessage = {
        id: mintedId,
        role: "assistant",
        content,
        timestamp: Date.now(),
      };
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        messages: [...current.messages, message],
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
    return mintedId;
  }, []);

  // `master-viewer-session` Phase 2 — viewer overlay actions. The
  // overlay stack is the new source of truth for transient surfaces
  // (sign-up, citation-peek, book-call). Each action mutates the
  // active session's `viewer.overlays` in place; OnboardingShell
  // reads the stack to layer overlay components over the current
  // viewer step instead of swapping the canvas wholesale.
  const pushOverlay = useCallback((overlay: import("./types").ViewerOverlay) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      // Idempotent on `(kind, cause)` so a re-fire of the same URL
      // effect doesn't pile duplicate overlays. Mutating an existing
      // overlay belongs on `mutateOverlay`, not on push.
      const cause = (overlay as { cause?: string }).cause;
      const dup = current.viewer.overlays.some(
        (o) => o.kind === overlay.kind && (o as { cause?: string }).cause === cause,
      );
      if (dup) return prev;
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewer: { ...current.viewer, overlays: [...current.viewer.overlays, overlay] },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  const mutateOverlay = useCallback(
    (
      kind: import("./types").ViewerOverlay["kind"],
      patch: Partial<import("./types").ViewerOverlay>,
    ) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        // Mutate the topmost overlay matching the kind. If none
        // match, no-op (avoid silent push on missing target).
        const idx = [...current.viewer.overlays].reverse().findIndex((o) => o.kind === kind);
        if (idx === -1) return prev;
        const realIdx = current.viewer.overlays.length - 1 - idx;
        const next = current.viewer.overlays.slice();
        next[realIdx] = { ...next[realIdx], ...patch } as import("./types").ViewerOverlay;
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          viewer: { ...current.viewer, overlays: next },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  const popOverlay = useCallback((kind?: import("./types").ViewerOverlay["kind"]) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      if (current.viewer.overlays.length === 0) return prev;
      let next: import("./types").ViewerOverlay[];
      if (kind === undefined) {
        next = current.viewer.overlays.slice(0, -1);
      } else {
        // Pop the topmost overlay of the kind. If none match, no-op.
        const lastIdx = current.viewer.overlays.length - 1;
        let foundAt = -1;
        for (let i = lastIdx; i >= 0; i--) {
          if (current.viewer.overlays[i].kind === kind) {
            foundAt = i;
            break;
          }
        }
        if (foundAt === -1) return prev;
        next = current.viewer.overlays.slice(0, foundAt).concat(current.viewer.overlays.slice(foundAt + 1));
      }
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewer: { ...current.viewer, overlays: next },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // `master-viewer-session` Phase 3 — pushStep appends a ViewerStep
  // onto viewer.history and advances currentStep.stepIndex. Idempotent
  // on structural equality with the current step so re-firing the
  // same navigation effect doesn't pollute history.
  const pushStep = useCallback((step: import("./types").ViewerStep) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const cur = current.viewer.currentStep.stepIndex;
      const top = cur >= 0 ? current.viewer.history[cur] : null;
      // Idempotent on full structural equality (kind + payload).
      // JSON.stringify is adequate here — steps are small + JSON-safe.
      if (top != null && JSON.stringify(top) === JSON.stringify(step)) return prev;
      const nextHistory = [...current.viewer.history, step];
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewer: {
          ...current.viewer,
          history: nextHistory,
          currentStep: { stepIndex: nextHistory.length - 1 },
        },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // clickable-citations Phase 3 — push-or-mutate a doc-viewer step
  // based on whether the current step already targets the same
  // documentId. The orchestrator calls this on every
  // `highlightCitation` dispatch so chip clicks reliably route the
  // viewer pane to the cited region without polluting viewer-history
  // with duplicate doc-viewer entries.
  const gotoDocViewer = useCallback(
    (input: {
      documentId: string;
      page: number;
      bbox?: NormalizedBbox;
      sourceCitationIndex?: number;
      tier?: import("@/types/onboarding").CitationTier;
    }) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const cur = current.viewer.currentStep.stepIndex;
        const top = cur >= 0 ? current.viewer.history[cur] : null;
        const highlight = {
          page: input.page,
          ...(input.bbox ? { bbox: input.bbox } : {}),
          ...(input.sourceCitationIndex != null ? { sourceCitationIndex: input.sourceCitationIndex } : {}),
          ...(input.tier ? { tier: input.tier } : {}),
        };
        // Same-document case → mutate the active step in place.
        if (top != null && top.kind === "doc-viewer" && top.documentId === input.documentId) {
          // Reference-equality short-circuit when the highlight slot
          // would be identical (prevents render churn from rapid
          // re-clicks on the same chip).
          if (JSON.stringify(top.highlight) === JSON.stringify(highlight) && top.page === input.page) {
            return prev;
          }
          const nextHistory = current.viewer.history.slice();
          // WF-01 C5 — a citation jump is NOT the F2 reading beat. If the
          // step being mutated is the reading step (`scanning: true`), clear
          // the flag so the sweep stops once the user clicks into a cited
          // region (otherwise `...top` would carry it forward).
          nextHistory[cur] = { ...top, page: input.page, highlight, scanning: false };
          const sessions = new Map(prev.sessions);
          sessions.set(prev.activeSessionId, {
            ...current,
            viewer: { ...current.viewer, history: nextHistory },
            updatedAt: Date.now(),
          });
          return { ...prev, sessions };
        }
        // Different-document case (or no step yet) → push a new step.
        const newStep: import("./types").ViewerStep = {
          kind: "doc-viewer",
          documentId: input.documentId,
          page: input.page,
          highlight,
        };
        const nextHistory = [...current.viewer.history, newStep];
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          viewer: {
            ...current.viewer,
            history: nextHistory,
            currentStep: { stepIndex: nextHistory.length - 1 },
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  // "Show all sources" sink — open the doc at `page` and draw all citation
  // regions at once. Mirrors gotoDocViewer's mutate/push, but writes
  // `litRegions` and clears the single-region `highlight`.
  const showCitationRegions = useCallback(
    (input: {
      documentId: string;
      page: number;
      regions: ReadonlyArray<import("@groundx/shared").CitationRegion>;
    }) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const cur = current.viewer.currentStep.stepIndex;
        const top = cur >= 0 ? current.viewer.history[cur] : null;
        const regions = [...input.regions];
        if (top != null && top.kind === "doc-viewer" && top.documentId === input.documentId) {
          const nextHistory = current.viewer.history.slice();
          nextHistory[cur] = {
            ...top,
            page: input.page,
            highlight: undefined,
            litRegions: regions,
            scanning: false,
          };
          const sessions = new Map(prev.sessions);
          sessions.set(prev.activeSessionId, {
            ...current,
            viewer: { ...current.viewer, history: nextHistory },
            updatedAt: Date.now(),
          });
          return { ...prev, sessions };
        }
        const newStep: import("./types").ViewerStep = {
          kind: "doc-viewer",
          documentId: input.documentId,
          page: input.page,
          litRegions: regions,
        };
        const nextHistory = [...current.viewer.history, newStep];
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          viewer: {
            ...current.viewer,
            history: nextHistory,
            currentStep: { stepIndex: nextHistory.length - 1 },
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  // Toggle-off sink (add-citation-toggle): clear the current doc-viewer step's
  // highlight, leaving the page shown. No-op when there's no active highlight.
  const clearCitationHighlight = useCallback(() => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const cur = current.viewer.currentStep.stepIndex;
      const top = cur >= 0 ? current.viewer.history[cur] : null;
      if (!top || top.kind !== "doc-viewer" || top.highlight == null) return prev;
      const nextHistory = current.viewer.history.slice();
      nextHistory[cur] = { ...top, highlight: undefined };
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewer: { ...current.viewer, history: nextHistory },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  // show-all-sources toggle (2026-06-11) — clear the active doc-viewer step's
  // litRegions (the multi-region "Show all sources" overlay). Mirror of
  // `clearCitationHighlight` above; the page stays shown, only the regions go.
  const clearCitationRegions = useCallback(() => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current) return prev;
      const cur = current.viewer.currentStep.stepIndex;
      const top = cur >= 0 ? current.viewer.history[cur] : null;
      if (!top || top.kind !== "doc-viewer" || top.litRegions == null) return prev;
      const nextHistory = current.viewer.history.slice();
      nextHistory[cur] = { ...top, litRegions: undefined };
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewer: { ...current.viewer, history: nextHistory },
        updatedAt: Date.now(),
      });
      return { ...prev, sessions };
    });
  }, []);

  const setSchemaFieldExtraction = useCallback(
    (fieldId: string, result: import("./types").SchemaFieldExtractionResult) => {
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const idx = current.pendingSchemaOverlay.addedFields.findIndex((f) => f.id === fieldId);
        if (idx === -1) return prev;
        const existing = current.pendingSchemaOverlay.addedFields[idx];
        // Reference-equality short-circuit so a repeat of the same
        // result (network retry, double-click) doesn't churn re-renders.
        // `value`/`confidence` live ONLY on the "done" arm, so the value
        // comparison is meaningful only when both sides are "done".
        const same =
          existing.extraction &&
          existing.extraction.status === result.status &&
          (result.status === "done" && existing.extraction.status === "done"
            ? existing.extraction.value === result.value &&
              existing.extraction.confidence === result.confidence
            : true);
        if (same) return prev;
        const nextAdditions = current.pendingSchemaOverlay.addedFields.slice();
        // `expand-inline-editor-fields` — when transitioning to "done"
        // and a previous "done" extraction was on record, capture its
        // confidence so the preview chip can render `conf <new> ↑ <old>`.
        const priorConfidence =
          existing.extraction?.status === "done" ? existing.extraction.confidence : undefined;
        const enriched: import("./types").SchemaFieldExtractionResult =
          result.status === "done" && priorConfidence != null && result.previousConfidence == null
            ? { ...result, previousConfidence: priorConfidence }
            : result;
        nextAdditions[idx] = { ...existing, extraction: enriched };
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          pendingSchemaOverlay: {
            ...current.pendingSchemaOverlay,
            addedFields: nextAdditions,
          },
          updatedAt: Date.now(),
        });
        return { ...prev, sessions };
      });
    },
    [],
  );

  // Actions are reference-stable (each useCallback above has empty
  // deps + reads latest state via setState's updater function). Putting
  // them in their own context means consumers that ONLY dispatch
  // (e.g. a chat input's onSubmit) don't re-render on unrelated state
  // mutations.
  const actions = useMemo<ChatStoreActions>(
    () => ({
      newSession,
      switchTo,
      resolveSessionForScope,
      appendMessage,
      activateEntity,
      upsertEntityAndActivate,
      updateActiveEntity,
      appendViewerEvent,
      setCurrentIntent,
      hydrateFromServer,
      addSchemaField,
      removeSchemaField,
      setSchemaFieldExtraction,
      editSchemaField,
      resetSchemaFieldEdit,
      enqueueFieldProposal,
      acceptFieldProposal,
      dismissFieldProposal,
      pinSample,
      unpinSample,
      setFocusedCategory,
      addReportSection,
      editReportSection,
      removeReportSection,
      pinToReport,
      enqueueReportProposal,
      acceptReportProposal,
      dismissReportProposal,
      appendAgentMessage,
      pushOverlay,
      mutateOverlay,
      popOverlay,
      pushStep,
      gotoDocViewer,
      showCitationRegions,
      clearCitationHighlight,
      clearCitationRegions,
    }),
    [
      newSession,
      switchTo,
      resolveSessionForScope,
      appendMessage,
      activateEntity,
      upsertEntityAndActivate,
      updateActiveEntity,
      appendViewerEvent,
      setCurrentIntent,
      hydrateFromServer,
      addSchemaField,
      removeSchemaField,
      setSchemaFieldExtraction,
      editSchemaField,
      resetSchemaFieldEdit,
      enqueueFieldProposal,
      acceptFieldProposal,
      dismissFieldProposal,
      pinSample,
      unpinSample,
      setFocusedCategory,
      addReportSection,
      editReportSection,
      removeReportSection,
      pinToReport,
      enqueueReportProposal,
      acceptReportProposal,
      dismissReportProposal,
      appendAgentMessage,
      pushOverlay,
      mutateOverlay,
      popOverlay,
      pushStep,
      gotoDocViewer,
      showCitationRegions,
      clearCitationHighlight,
      clearCitationRegions,
    ],
  );

  // `master-viewer-session` Phase 4 — project `pendingSchemaOverlay`
  // onto `viewer.workspace.schemaOverlay` for every session before
  // exposing state to consumers. The schema-mutation actions write
  // only to the legacy `pendingSchemaOverlay` slot for now (12+
  // sites); this projection keeps the new slot in lockstep without
  // touching each site. Phase 7 inverts the relationship (the viewer
  // slot becomes canonical) and removes the legacy slot.
  const projectedState = useMemo<ChatStoreState>(() => {
    const nextSessions = new Map<string, ChatSession>();
    state.sessions.forEach((session, id) => {
      const currentInWorkspace = session.viewer.workspace.schemaOverlay;
      if (currentInWorkspace === session.pendingSchemaOverlay) {
        // Already in sync — reuse the original reference. Cheap
        // identity check avoids needless object churn.
        nextSessions.set(id, session);
        return;
      }
      nextSessions.set(id, {
        ...session,
        viewer: {
          ...session.viewer,
          workspace: {
            ...session.viewer.workspace,
            schemaOverlay: session.pendingSchemaOverlay,
          },
        },
      });
    });
    return { ...state, sessions: nextSessions };
  }, [state]);

  // Backward-compat combined value. Existing useChatStore() callers
  // keep working unchanged. New code that's perf-sensitive should
  // reach for useChatStoreState / useChatStoreActions instead.
  const value = useMemo<ChatStoreApi>(
    () => ({ state: projectedState, ...actions }),
    [projectedState, actions],
  );

  return (
    <ChatStoreContext.Provider value={value}>
      <ChatStoreActionsContext.Provider value={actions}>
        {/* Phase 4: expose the projected state through both contexts
            so `useChatStoreState()` and `useChatStore().state` return
            the same reference. */}
        <ChatStoreStateContext.Provider value={projectedState}>{children}</ChatStoreStateContext.Provider>
      </ChatStoreActionsContext.Provider>
    </ChatStoreContext.Provider>
  );
};

export const useChatStore = (): ChatStoreApi => {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) throw new Error("useChatStore must be used inside ChatStoreProvider");
  return ctx;
};

/**
 * UI-10 — non-throwing variant of `useChatStore`. Returns `null` when
 * no `ChatStoreProvider` is mounted, so callers like
 * `CanvasOrchestratorProvider` can opt INTO chat-store side effects
 * without making ChatStore a hard mount-order dependency. Use the
 * throwing `useChatStore` for everything that actually needs the
 * store — this hook is for plumbing.
 */
export const useChatStoreOptional = (): ChatStoreApi | null => {
  return useContext(ChatStoreContext);
};

/**
 * Read-only subscription to the ChatStore state slice. Re-renders on
 * every state change. Prefer the more specific `useChatStoreActions`
 * if you only need to dispatch.
 */
export const useChatStoreState = (): ChatStoreState => {
  const ctx = useContext(ChatStoreStateContext);
  if (!ctx) throw new Error("useChatStoreState must be used inside ChatStoreProvider");
  return ctx;
};

/**
 * Subscription to the ChatStore action surface. Reference-stable —
 * the returned object identity does NOT change when state mutates,
 * so a component that only depends on actions will not re-render on
 * unrelated state changes.
 */
export const useChatStoreActions = (): ChatStoreActions => {
  const ctx = useContext(ChatStoreActionsContext);
  if (!ctx) throw new Error("useChatStoreActions must be used inside ChatStoreProvider");
  return ctx;
};
