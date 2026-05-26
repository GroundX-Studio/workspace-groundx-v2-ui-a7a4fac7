import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// OB-08: adapter errors route to the Sentry wrapper. Mock the module
// so we can assert the call without shipping events.
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));
// UI-10b: mock the intent-log POST helper so we can assert it fires
// on dispatch without hitting the network.
vi.mock("@/api/intentLog", () => ({
  recordIntent: vi.fn(async () => {}),
}));
import { captureException } from "@/lib/sentry";
import { recordIntent } from "@/api/intentLog";
import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";

import { CanvasOrchestratorProvider, useCanvasOrchestrator } from "./CanvasOrchestratorContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
);

describe("CanvasOrchestratorContext", () => {
  it("dispatches and stamps intents with monotonic id + source", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    let first;
    let second;
    act(() => {
      first = result.current.dispatch({ kind: "openDocument", documentId: "d1" });
      second = result.current.dispatch({ kind: "openDocument", documentId: "d2" }, "agent");
    });
    expect(first!.intentId).toBe(1);
    expect(first!.source).toBe("user");
    expect(first!.ts).toBe(1700000000000);
    expect(second!.intentId).toBe(2);
    expect(second!.source).toBe("agent");
    expect(result.current.lastAppliedIntentId).toBe(2);
  });

  it("routes intent to registered adapter (typed by kind)", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    const apply = vi.fn();
    act(() => {
      result.current.registerAdapter({ kind: "openDocument", apply });
    });
    act(() => {
      result.current.dispatch({ kind: "openDocument", documentId: "d1", page: 3 });
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ kind: "openDocument", documentId: "d1", page: 3 });
  });

  it("intent with no registered adapter still stamps + advances lastAppliedIntentId", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    act(() => {
      result.current.dispatch({ kind: "showReport", templateId: "tpl", scope: { type: "bucket", bucketId: 1 } });
    });
    expect(result.current.lastAppliedIntentId).toBe(1);
  });

  it("registerAdapter returns an unsubscribe that removes only the same adapter", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    const apply1 = vi.fn();
    const apply2 = vi.fn();
    let unsubscribe1: (() => void) | undefined;
    act(() => {
      unsubscribe1 = result.current.registerAdapter({ kind: "openDocument", apply: apply1 });
      result.current.registerAdapter({ kind: "openDocument", apply: apply2 });
    });
    // Last registration wins.
    act(() => {
      result.current.dispatch({ kind: "openDocument", documentId: "d" });
    });
    expect(apply2).toHaveBeenCalledTimes(1);
    expect(apply1).not.toHaveBeenCalled();
    // Unsubscribing the *first* adapter must not remove apply2.
    act(() => {
      unsubscribe1!();
      result.current.dispatch({ kind: "openDocument", documentId: "d2" });
    });
    expect(apply2).toHaveBeenCalledTimes(2);
  });

  it("swallows synchronous adapter errors, captures to Sentry, and still stamps (OB-08)", () => {
    vi.mocked(captureException).mockReset();
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    const boom = new Error("boom");
    act(() => {
      result.current.registerAdapter({
        kind: "showSample",
        apply: () => {
          throw boom;
        },
      });
    });
    act(() => {
      result.current.dispatch({ kind: "showSample", scenario: "utility" });
    });
    expect(result.current.lastAppliedIntentId).toBe(1);
    expect(captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        context: "CanvasOrchestrator.adapter",
        phase: "sync-throw",
        intentKind: "showSample",
      }),
    );
  });

  it("captures async adapter rejections to Sentry (OB-08)", async () => {
    vi.mocked(captureException).mockReset();
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    const rejection = new Error("async boom");
    act(() => {
      result.current.registerAdapter({
        kind: "showSample",
        apply: () => Promise.reject(rejection),
      });
    });
    act(() => {
      result.current.dispatch({ kind: "showSample", scenario: "utility" });
    });
    // Promise rejections settle in a microtask — flush.
    await Promise.resolve();
    expect(captureException).toHaveBeenCalledWith(
      rejection,
      expect.objectContaining({
        context: "CanvasOrchestrator.adapter",
        phase: "async-rejection",
        intentKind: "showSample",
      }),
    );
  });

  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useCanvasOrchestrator())).toThrow(/CanvasOrchestratorProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });

  // ────────────────────────────────────────────────────────────────
  // UI-10 — dispatchIntent triple-write
  //
  // When CanvasOrchestrator is mounted INSIDE ChatStoreProvider,
  // every dispatch performs the side effects defined in
  // `project_chat_session_model.md`:
  //   (a) flips the active ChatSession's `currentIntent`
  //   (b) appends a `viewer_events` entry with action="intent-dispatched"
  //   (c) lets adapters mutate the entity registry as before
  //
  // Server-side `intent_log` row persistence is split out as UI-10b —
  // no BFF endpoint exists yet, and the in-memory triple-write is the
  // honest scope of the user-visible behavior on the frontend.
  // ────────────────────────────────────────────────────────────────
  describe("UI-10 dispatchIntent → ChatStore triple-write", () => {
    const wiredWrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatStoreProvider autoSeedDefaultSession>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>
    );

    function useBoth() {
      return {
        orchestrator: useCanvasOrchestrator(),
        chatStore: useChatStore(),
      };
    }

    it("dispatch flips active ChatSession.currentIntent to the dispatched intent", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      const before =
        result.current.chatStore.state.sessions.get(
          result.current.chatStore.state.activeSessionId!,
        )?.currentIntent ?? null;
      expect(before).toBeNull();

      act(() => {
        result.current.orchestrator.dispatch({ kind: "openDocument", documentId: "d-99" }, "agent");
      });

      const after = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!.currentIntent;
      expect(after).toEqual({ kind: "openDocument", documentId: "d-99" });
    });

    it("dispatch appends a viewer event with action='intent-dispatched' + source", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "openDocument", documentId: "d-7", page: 3 },
          "agent",
        );
      });
      const active = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      const lastEvent = active.viewerHistory[active.viewerHistory.length - 1];
      expect(lastEvent).toMatchObject({
        action: "intent-dispatched",
        source: "agent",
      });
      // The detail carries the intent so downstream consumers (intent_log
      // writer, telemetry hooks) can replay it.
      expect(lastEvent.detail).toMatchObject({ kind: "openDocument", documentId: "d-7", page: 3 });
    });

    it("default source defaults to 'user' when not specified", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch({ kind: "openDocument", documentId: "d-1" });
      });
      const active = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      const lastEvent = active.viewerHistory[active.viewerHistory.length - 1];
      expect(lastEvent.source).toBe("user");
    });

    it("entity registry side: adapter can update the active entity (preserves existing pattern)", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      // Seed an active entity so updateActiveEntity has something to mutate.
      act(() => {
        result.current.chatStore.upsertEntityAndActivate("sample", "utility", { lastFrame: "f1" });
      });
      // Register an adapter that fires updateActiveEntity on showSample.
      act(() => {
        result.current.orchestrator.registerAdapter({
          kind: "showSample",
          apply: () => {
            result.current.chatStore.updateActiveEntity((e) => ({ ...e, lastFrame: "f3" }));
          },
        });
      });
      act(() => {
        result.current.orchestrator.dispatch({ kind: "showSample", scenario: "utility" }, "agent");
      });
      const active = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      const entity = active.entities.get(active.activeEntityKey!);
      expect(entity?.lastFrame).toBe("f3");
    });

    it("UI-10b: dispatch POSTs to /api/intent with chatSessionId + source + intent", () => {
      vi.mocked(recordIntent).mockReset();
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "openDocument", documentId: "d-42", page: 7 },
          "agent",
        );
      });
      expect(recordIntent).toHaveBeenCalledTimes(1);
      const call = vi.mocked(recordIntent).mock.calls[0][0];
      expect(call.source).toBe("agent");
      expect(call.intent).toEqual({ kind: "openDocument", documentId: "d-42", page: 7 });
      expect(typeof call.chatSessionId).toBe("string");
      expect(call.chatSessionId.length).toBeGreaterThan(0);
    });

    it("UI-10b: dispatch does NOT POST when no ChatStoreProvider is mounted (back-compat)", () => {
      vi.mocked(recordIntent).mockReset();
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      act(() => {
        result.current.dispatch({ kind: "openDocument", documentId: "d-1" }, "agent");
      });
      expect(recordIntent).not.toHaveBeenCalled();
    });

    it("when no ChatStoreProvider is mounted, dispatch still works (back-compat)", () => {
      // Plain CanvasOrchestratorProvider without ChatStore in the tree —
      // dispatch should NOT throw. Side effects are silently skipped.
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      expect(() => {
        act(() => {
          result.current.dispatch({ kind: "openDocument", documentId: "d-1" }, "agent");
        });
      }).not.toThrow();
      expect(result.current.lastAppliedIntentId).toBe(1);
    });
  });
});
