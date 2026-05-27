import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from "react";

import { ensureServerChatSession } from "@/api/chatSessions";
import { upsertChatSessionEntity } from "@/api/chatSessionEntities";
import { patchChatSession } from "@/api/chatSessionPatch";
import { recordViewerEvent } from "@/api/viewerEvents";
import { makeEntityKey, type EntityKey, type EntityKind, type EntitySession } from "@/contexts/EntityRegistryContext";
import type { FFrame } from "@/types/onboarding";

import { EMPTY_PENDING_SCHEMA_OVERLAY, EMPTY_VIEWER_SESSION } from "./types";
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
 * The actions slice — `newSession`, `appendMessage`, etc. — is stable
 * across state changes. Consumers that ONLY need to dispatch (e.g.
 * the F5 chat input on submit) can subscribe to this context alone
 * and skip re-renders when unrelated state mutates.
 *
 * Concrete shape: every field in ChatStoreApi EXCEPT `state`.
 */
type ChatStoreActions = Omit<ChatStoreApi, "state">;
const ChatStoreStateContext = createContext<ChatStoreState | null>(null);
const ChatStoreActionsContext = createContext<ChatStoreActions | null>(null);

const STORAGE_KEY = "groundx-onboarding.chat-store.v1";
const STORAGE_VERSION = 1;
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

interface SerializedEntitySession {
  kind: EntityKind;
  id: string;
  lastFrame: FFrame;
  completedFrames: FFrame[];
  createdAt: number;
  lastVisitedAt: number;
}

interface SerializedSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  entities: Array<[EntityKey, SerializedEntitySession]>;
  activeEntityKey: EntityKey | null;
  isOnboardingSession: boolean;
  signupOpen: boolean;
  // gate, summaries, viewerHistory, currentIntent left out of v1
  // serialization; they're either ephemeral (currentIntent, signupOpen,
  // viewerHistory cached from intent_log) or not yet populated
  // (summaries arrive in Phase I). They'll be added to vNext as those
  // features land.
}

interface SerializedSnapshot {
  version: number;
  ownerKey: string;
  activeSessionId: string | null;
  sessions: SerializedSession[];
}

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

// Frame ordering for the rehydrate watermark below. f3a is "edit
// schema" which is a side branch of f3 in the design; treat it as
// equivalent to f3 for "highest reached" purposes.
const FRAME_ORDER: Record<FFrame, number> = {
  f1: 1,
  f2: 2,
  f3: 3,
  f3a: 3,
  f4: 4,
  f5: 5,
  f6: 6,
  f7: 7,
};

function highestFrame(frames: ReadonlySet<FFrame>, fallback: FFrame): FFrame {
  let best = fallback;
  let bestRank = FRAME_ORDER[fallback];
  for (const f of frames) {
    const r = FRAME_ORDER[f] ?? 0;
    if (r > bestRank) {
      best = f;
      bestRank = r;
    }
  }
  return best;
}

function deserialize(raw: string): ChatStoreState | null {
  try {
    const parsed = JSON.parse(raw) as SerializedSnapshot;
    if (parsed.version !== STORAGE_VERSION) return null;
    const sessions = new Map<string, ChatSession>();
    for (const s of parsed.sessions) {
      const entities = new Map<EntityKey, EntitySession>();
      for (const [key, entity] of s.entities) {
        // Restore lastFrame to the HIGHEST frame ever reached
        // (max of lastFrame ∪ completedFrames). Without this, a
        // Pick-a-view pill click that downgrades from f5 → f3
        // mid-session ends up restored as f3 on reload, even
        // though the user actually progressed further. "Continue
        // where I left off" requires the watermark, not the
        // last-touched value.
        const completedSet = new Set<FFrame>(entity.completedFrames);
        const restoredLastFrame = highestFrame(completedSet, entity.lastFrame);
        entities.set(key, {
          kind: entity.kind,
          id: entity.id,
          lastFrame: restoredLastFrame,
          completedFrames: completedSet,
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
        viewer: EMPTY_VIEWER_SESSION,
        gate: { status: "idle" },
        signupOpen: s.signupOpen,
        isOnboardingSession: s.isOnboardingSession,
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
   * always have an active session to operate on. EntityRegistryProvider
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
      // EntityRegistryProvider; off for ChatStore-only tests.
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
    void ensureServerChatSession({
      id: sid,
      onboardingSessionId: sid,
      title: session.title,
      isOnboarding: session.isOnboardingSession,
      activeEntityKey: session.activeEntityKey,
    });
  }, [state.activeSessionId, state.sessions, ephemeral]);

  // ----- session-level actions ---------------------------------------

  const newSession = useCallback(
    (options?: { isOnboardingSession?: boolean; title?: string }): string => {
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
          viewer: EMPTY_VIEWER_SESSION,
          gate: { status: "idle" },
          signupOpen: false,
          isOnboardingSession: Boolean(options?.isOnboardingSession),
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
  // legacy `useEntityRegistry()` hook is now a derived facade over
  // these (see EntityRegistryContext.tsx).

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
      void patchChatSession(patchPayload);
    }
  }, []);

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
        void upsertChatSessionEntity(putPayload);
        // RT-04 — also update the chat_sessions row's
        // active_entity_key column so chatHandler.ts:204's
        // getChatSession read sees the live value, not a stale one
        // from the session-create moment.
        void patchChatSession({ chatSessionId: putPayload.chatSessionId, activeEntityKey: key });
      }
      return key;
    },
    [],
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
      void recordViewerEvent(postPayload);
    }
  }, []);

  const setCurrentIntent = useCallback((intent: CanvasIntent) => {
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
      void patchChatSession(patchPayload);
    }
  }, []);

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
      void upsertChatSessionEntity(putPayload);
    }
  }, []);

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
        // `master-viewer-session` Phase 1 — viewer slots come back
        // null when never touched; null hydrates to EMPTY_VIEWER_SESSION
        // so render-time consumers don't need to undefined-check.
        viewerHistory?: unknown[] | null;
        viewerOverlays?: unknown[] | null;
        viewerWorkspace?: Record<string, unknown> | null;
        createdAt: string;
        updatedAt: string;
      }>,
    ) => {
      if (serverSessions.length === 0) return;
      // Build a ViewerSession from the three nullable JSON slots. Null
      // = empty for hydration. Workspace round-trips via a structural
      // copy; ViewerStep / ViewerOverlay shapes are opaque to the
      // server so we trust the payload (validation lives client-side
      // in the consumers that act on the entries).
      const hydrateViewer = (
        history?: unknown[] | null,
        overlays?: unknown[] | null,
        workspace?: Record<string, unknown> | null,
      ): import("./types").ViewerSession => {
        if (!history && !overlays && !workspace) return EMPTY_VIEWER_SESSION;
        const baseWorkspace = workspace as
          | { schemaOverlay?: unknown }
          | null
          | undefined;
        return {
          history: (history as import("./types").ViewerStep[] | null | undefined) ?? [],
          currentStep: { stepIndex: (history?.length ?? 0) - 1 },
          overlays: (overlays as import("./types").ViewerOverlay[] | null | undefined) ?? [],
          workspace: {
            schemaOverlay: (baseWorkspace?.schemaOverlay as
              | import("./types").PendingSchemaOverlay
              | undefined) ?? EMPTY_PENDING_SCHEMA_OVERLAY,
          },
        };
      };
      // `master-viewer-session` Phase 4 — the legacy `pendingSchemaOverlay`
      // slot must mirror `viewer.workspace.schemaOverlay` on the
      // hydrated session so the Phase-4 projection (pending → workspace)
      // doesn't clobber the server-authoritative value. Pick the
      // server's workspace.schemaOverlay if present, else fall through
      // to the legacy default.
      const pickSchemaOverlay = (
        viewer: import("./types").ViewerSession,
      ): import("./types").PendingSchemaOverlay => viewer.workspace.schemaOverlay;
      setState((prev) => {
        const nextSessions = new Map(prev.sessions);
        for (const remote of serverSessions) {
          const local = nextSessions.get(remote.id);
          const hydratedViewer = hydrateViewer(
            remote.viewerHistory,
            remote.viewerOverlays,
            remote.viewerWorkspace,
          );
          const hydratedOverlay = pickSchemaOverlay(hydratedViewer);
          const merged: ChatSession = local
            ? {
                ...local,
                // Server wins on fields it owns.
                title: remote.title,
                activeEntityKey: (remote.activeEntityKey as EntityKey | null) ?? null,
                currentIntent: (remote.currentIntent as CanvasIntent) ?? null,
                viewer: hydratedViewer,
                // Phase 4 sync: pendingSchemaOverlay mirrors workspace.
                pendingSchemaOverlay: hydratedOverlay,
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
                currentIntent: (remote.currentIntent as CanvasIntent) ?? null,
                pendingSchemaOverlay: hydratedOverlay,
                viewer: hydratedViewer,
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
      bbox?: { x: number; y: number; w: number; h: number };
      sourceCitationIndex?: number;
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
          nextHistory[cur] = { ...top, page: input.page, highlight };
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
        const same =
          existing.extraction &&
          existing.extraction.status === result.status &&
          existing.extraction.value === result.value &&
          existing.extraction.confidence === result.confidence;
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
      appendAgentMessage,
      pushOverlay,
      mutateOverlay,
      popOverlay,
      pushStep,
      gotoDocViewer,
    }),
    [
      newSession,
      switchTo,
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
      appendAgentMessage,
      pushOverlay,
      mutateOverlay,
      popOverlay,
      pushStep,
      gotoDocViewer,
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
