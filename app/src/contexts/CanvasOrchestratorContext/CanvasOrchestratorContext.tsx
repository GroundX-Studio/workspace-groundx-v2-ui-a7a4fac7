import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { recordIntent } from "@/api/intentLog";
import { useChatStoreOptional } from "@/contexts/ChatStoreContext";
import { captureException } from "@/lib/sentry";

import type { CanvasAdapter, CanvasIntent, CanvasOrchestratorApi, IntentSource, StampedIntent } from "./types";

const CanvasOrchestratorContext = createContext<CanvasOrchestratorApi | null>(null);

interface CanvasOrchestratorProviderProps {
  children: ReactNode;
  /** Override the clock for deterministic testing. */
  now?: () => number;
}

export const CanvasOrchestratorProvider: FC<CanvasOrchestratorProviderProps> = ({ children, now = Date.now }) => {
  const adaptersRef = useRef(new Map<CanvasIntent["kind"], CanvasAdapter>());
  const intentCounterRef = useRef(0);
  const [lastAppliedIntentId, setLastAppliedIntentId] = useState<number | null>(null);
  // UI-10 — opt-in ChatStore wiring. When a `ChatStoreProvider` sits
  // above us in the tree, every dispatch flips currentIntent + appends
  // a viewer event. When no ChatStore is mounted (some standalone
  // tests, embedded canvases outside the session shell) dispatch just
  // works without the side effects — silent fallback.
  const chatStore = useChatStoreOptional();

  const registerAdapter = useCallback(<K extends CanvasIntent["kind"]>(adapter: CanvasAdapter<K>) => {
    // The map's value type is the union-narrowed CanvasAdapter; a specific
    // CanvasAdapter<K> is structurally narrower in its `apply` parameter, so
    // TypeScript can't directly upcast. The `unknown` hop lets us store any
    // kind-specific adapter and recover the right narrowing at dispatch time.
    const erased = adapter as unknown as CanvasAdapter;
    adaptersRef.current.set(adapter.kind, erased);
    return () => {
      const current = adaptersRef.current.get(adapter.kind);
      if (current === erased) {
        adaptersRef.current.delete(adapter.kind);
      }
    };
  }, []);

  const dispatch = useCallback(
    (intent: CanvasIntent, source: IntentSource = "user"): StampedIntent => {
      intentCounterRef.current += 1;
      const stamped: StampedIntent = { intentId: intentCounterRef.current, source, ts: now(), intent };

      // UI-10 — ChatStore side effects, fired BEFORE the adapter so
      // the active session sees the intent as "current" while the
      // adapter is still running (matters for adapters that re-read
      // ChatStore state mid-apply). Both writes are no-ops when no
      // ChatStore is mounted.
      if (chatStore) {
        chatStore.setCurrentIntent(intent as unknown as Record<string, unknown>);
        // entityKey on the viewer_events row reflects what the user
        // was looking at when the intent dispatched — read it from
        // the active ChatSession. The intent payload may name a
        // document/project, but converting that to a branded
        // EntityKey is the consumer's job, not the orchestrator's.
        const activeSession = chatStore.state.activeSessionId
          ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
          : null;
        chatStore.appendViewerEvent({
          action: "intent-dispatched",
          source,
          entityKey: activeSession?.activeEntityKey ?? null,
          detail: intent as unknown as Record<string, unknown>,
        });
        // UI-10b — durable row in the server-side `intent_log` table.
        // Fire-and-forget: failure routes to Sentry inside recordIntent;
        // never blocks the dispatch path.
        if (chatStore.state.activeSessionId) {
          void recordIntent({
            chatSessionId: chatStore.state.activeSessionId,
            source,
            intent: intent as unknown as Record<string, unknown>,
          });
        }
      }

      const adapter = adaptersRef.current.get(intent.kind);
      if (adapter) {
        // Fire-and-forget. Adapters that need async behavior return a Promise;
        // the caller can subscribe via telemetry channels (Phase 1+). Errors are
        // logged but do not block the dispatcher — server is source of truth.
        try {
          const maybe = adapter.apply(intent as never);
          if (maybe && typeof (maybe as Promise<void>).catch === "function") {
            (maybe as Promise<void>).catch((error) => {
              captureException(error, {
                context: "CanvasOrchestrator.adapter",
                phase: "async-rejection",
                intentKind: intent.kind,
              });
            });
          }
        } catch (error) {
          captureException(error, {
            context: "CanvasOrchestrator.adapter",
            phase: "sync-throw",
            intentKind: intent.kind,
          });
        }
      }
      setLastAppliedIntentId(stamped.intentId);
      return stamped;
    },
    [now, chatStore]
  );

  const value = useMemo<CanvasOrchestratorApi>(
    () => ({ lastAppliedIntentId, dispatch, registerAdapter }),
    [lastAppliedIntentId, dispatch, registerAdapter]
  );

  return <CanvasOrchestratorContext.Provider value={value}>{children}</CanvasOrchestratorContext.Provider>;
};

export const useCanvasOrchestrator = (): CanvasOrchestratorApi => {
  const value = useContext(CanvasOrchestratorContext);
  if (!value) throw new Error("useCanvasOrchestrator must be used inside CanvasOrchestratorProvider");
  return value;
};
