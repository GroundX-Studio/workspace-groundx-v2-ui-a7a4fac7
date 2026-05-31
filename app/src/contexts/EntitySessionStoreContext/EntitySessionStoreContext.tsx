import { useMemo, type FC, type ReactNode } from "react";

import { ChatStoreProvider, EMPTY_PENDING_REPORT_OVERLAY, EMPTY_PENDING_SCHEMA_OVERLAY, EMPTY_VIEWER_SESSION, useChatStore, type ChatSession } from "@/contexts/ChatStoreContext";
import { ChatStoreServerHydrator } from "@/contexts/ChatStoreContext/ChatStoreServerHydrator";

import type { EntityKey, EntitySessionStoreApi, EntitySessionStoreState, EntitySession } from "./types";
import { makeEntityKey } from "./types";

/**
 * EntitySessionStore — historically the source of truth for
 * per-entity onboarding state (formerly named "EntityRegistry"). As
 * of the chat-session-model refactor (2026-05-23), entities live
 * INSIDE the active chat session (`ChatStore.activeSession.entities`).
 * This module is now a thin compatibility layer:
 *
 *   - `EntitySessionStoreProvider` mounts a `ChatStoreProvider` and
 *     seeds it with a single "onboarding" session containing the
 *     initial entities (if provided). This keeps existing call
 *     sites — including OnboardingSessionProvider's
 *     `initialFrame`/`initialScenario` seeding — working without
 *     reshaping.
 *   - `useEntitySessionStore()` reads from the active chat session and
 *     returns the same API shape (state + activate +
 *     upsertAndActivate + updateActive). All mutations delegate to
 *     ChatStore.
 *
 * F2–F7 view code is unchanged. The chat-session-model phases (B,
 * C, D) all converge here.
 *
 * This is mutable per-entity session state, NOT a read catalog —
 * the "Store" name (vs. the old "Registry") is deliberate so the
 * "registry/catalog = read lookup" convention stays reliable.
 */

interface EntitySessionStoreProviderProps {
  children: ReactNode;
  /**
   * Seed entities. When provided, this mounts a fresh ChatStore
   * with one onboarding session containing those entities.
   *
   * Tests use this to drop the store into a known state, and
   * OnboardingSessionProvider uses it to translate
   * initialFrame/initialScenario props into seed entities.
   */
  initialEntities?: ReadonlyMap<EntityKey, EntitySession>;
  initialActiveKey?: EntityKey | null;
}

export const EntitySessionStoreProvider: FC<EntitySessionStoreProviderProps> = ({
  children,
  initialEntities,
  initialActiveKey = null,
}) => {
  /**
   * Two paths:
   *   1. Explicit `initialEntities`/`initialActiveKey` (tests + the
   *      legacy OnboardingSessionProvider seed) → mount ChatStore
   *      with a single seeded onboarding session containing those
   *      entities. Takes priority over any localStorage payload.
   *   2. No explicit seeds → mount ChatStore with `autoSeedDefaultSession`
   *      enabled. ChatStore tries to rehydrate from its own key OR
   *      migrate from the legacy EntityRegistry key. If neither is
   *      available, ChatStore creates a fresh empty onboarding
   *      session so consumers always have an active session.
   */
  const explicitlySeeded = initialEntities !== undefined || initialActiveKey !== null;

  const initialSessions = useMemo<ReadonlyMap<string, ChatSession> | undefined>(() => {
    if (!explicitlySeeded) return undefined;
    const now = Date.now();
    const sessionId = `c-onboarding-seed-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const session: ChatSession = {
      id: sessionId,
      title: "Onboarding",
      createdAt: now,
      updatedAt: now,
      messages: [],
      summaries: [],
      entities: initialEntities ?? new Map(),
      activeEntityKey: initialActiveKey,
      viewerHistory: [],
      currentIntent: null,
      pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
      reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
      viewer: EMPTY_VIEWER_SESSION,
      gate: { status: "idle" },
      signupOpen: false,
      isOnboardingSession: true,
    };
    const map = new Map<string, ChatSession>();
    map.set(sessionId, session);
    return map;
  }, [explicitlySeeded, initialEntities, initialActiveKey]);

  const initialActiveSessionId = useMemo(
    () => (initialSessions ? Array.from(initialSessions.keys())[0] ?? null : undefined),
    [initialSessions],
  );

  return (
    <ChatStoreProvider
      initialSessions={initialSessions}
      initialActiveSessionId={initialActiveSessionId}
      autoSeedDefaultSession={!explicitlySeeded}
    >
      {/* RT-05 — on auth-resolved, fetch the user's persisted chat
          sessions and merge into ChatStore. Renders nothing. */}
      <ChatStoreServerHydrator />
      {children}
    </ChatStoreProvider>
  );
};

/**
 * Derived facade. Reads from the active chat session in ChatStore
 * and exposes the legacy EntitySessionStoreApi shape so F2-F7 views
 * and OnboardingSessionContext don't need to change. All mutations
 * delegate to ChatStore's entity actions.
 */
export const useEntitySessionStore = (): EntitySessionStoreApi => {
  const chatStore = useChatStore();

  const state = useMemo<EntitySessionStoreState>(() => {
    const active = chatStore.state.activeSessionId
      ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
      : null;
    return {
      entities: active?.entities ?? new Map(),
      activeKey: active?.activeEntityKey ?? null,
    };
  }, [chatStore.state]);

  return useMemo<EntitySessionStoreApi>(
    () => ({
      state,
      activate: chatStore.activateEntity,
      upsertAndActivate: chatStore.upsertEntityAndActivate,
      updateActive: chatStore.updateActiveEntity,
    }),
    [state, chatStore.activateEntity, chatStore.upsertEntityAndActivate, chatStore.updateActiveEntity],
  );
};

// Re-export for callers that import makeEntityKey from this module
export { makeEntityKey };
