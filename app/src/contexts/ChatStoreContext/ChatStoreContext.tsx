import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { makeEntityKey, type EntityKey, type EntityKind, type EntitySession } from "@/contexts/EntityRegistryContext";
import type { FFrame } from "@/types/onboarding";

import type {
  ChatMessage,
  ChatSession,
  ChatStoreApi,
  ChatStoreState,
  NewMessageInput,
  NewViewerEventInput,
  ViewerEvent,
} from "./types";

const ChatStoreContext = createContext<ChatStoreApi | null>(null);

const STORAGE_KEY = "groundx-onboarding.chat-store.v1";
const STORAGE_VERSION = 1;
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
    sessions.push({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
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

function deserialize(raw: string): ChatStoreState | null {
  try {
    const parsed = JSON.parse(raw) as SerializedSnapshot;
    if (parsed.version !== STORAGE_VERSION) return null;
    const sessions = new Map<string, ChatSession>();
    for (const s of parsed.sessions) {
      const entities = new Map<EntityKey, EntitySession>();
      for (const [key, entity] of s.entities) {
        entities.set(key, {
          kind: entity.kind,
          id: entity.id,
          lastFrame: entity.lastFrame,
          completedFrames: new Set(entity.completedFrames),
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
      return { ...prev, sessions };
    });
  }, []);

  const upsertEntityAndActivate = useCallback(
    (kind: EntityKind, id: string, defaults: Partial<EntitySession>): EntityKey => {
      const key = makeEntityKey(kind, id);
      setState((prev) => {
        if (!prev.activeSessionId) return prev;
        const current = prev.sessions.get(prev.activeSessionId);
        if (!current) return prev;
        const existing = current.entities.get(key);
        // Idempotent: entity already exists AND already active → no-op.
        if (existing && current.activeEntityKey === key) return prev;
        const now = Date.now();
        const entities = new Map(current.entities);
        if (existing) {
          entities.set(key, { ...existing, lastVisitedAt: now });
        } else {
          const entity: EntitySession = {
            kind,
            id,
            lastFrame: "f1",
            completedFrames: new Set(),
            createdAt: now,
            lastVisitedAt: now,
            ...defaults,
          };
          entities.set(key, entity);
        }
        const sessions = new Map(prev.sessions);
        sessions.set(prev.activeSessionId, {
          ...current,
          entities,
          activeEntityKey: key,
          updatedAt: now,
        });
        return { ...prev, sessions };
      });
      return key;
    },
    [],
  );

  const appendViewerEvent = useCallback((input: NewViewerEventInput) => {
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
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, {
        ...current,
        viewerHistory: [...current.viewerHistory, event],
        updatedAt: event.timestamp,
      });
      return { ...prev, sessions };
    });
  }, []);

  const updateActiveEntity = useCallback((updater: (session: EntitySession) => EntitySession) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      const current = prev.sessions.get(prev.activeSessionId);
      if (!current || !current.activeEntityKey) return prev;
      const entity = current.entities.get(current.activeEntityKey);
      if (!entity) return prev;
      const next = updater(entity);
      if (next === entity) return prev;
      const entities = new Map(current.entities);
      entities.set(current.activeEntityKey, { ...next, lastVisitedAt: Date.now() });
      const sessions = new Map(prev.sessions);
      sessions.set(prev.activeSessionId, { ...current, entities, updatedAt: Date.now() });
      return { ...prev, sessions };
    });
  }, []);

  const value = useMemo<ChatStoreApi>(
    () => ({
      state,
      newSession,
      switchTo,
      appendMessage,
      activateEntity,
      upsertEntityAndActivate,
      updateActiveEntity,
      appendViewerEvent,
    }),
    [state, newSession, switchTo, appendMessage, activateEntity, upsertEntityAndActivate, updateActiveEntity, appendViewerEvent],
  );

  return <ChatStoreContext.Provider value={value}>{children}</ChatStoreContext.Provider>;
};

export const useChatStore = (): ChatStoreApi => {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) throw new Error("useChatStore must be used inside ChatStoreProvider");
  return ctx;
};
