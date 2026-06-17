import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Api } from "@/api/client";
import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { OnboardingSessionProvider, useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { withApiProvider } from "@/test/withApiProvider";

import { CanvasOrchestratorProvider, useCanvasOrchestrator } from "./CanvasOrchestratorContext";

const recordIntentMock = vi.fn<
  Parameters<Api["intent"]["recordIntent"]>,
  ReturnType<Api["intent"]["recordIntent"]>
>(async () => {});
const captureExceptionMock = vi.fn();
const withCanvasApi = (children: React.ReactNode) =>
  withApiProvider(children, {
    intent: { recordIntent: recordIntentMock },
    telemetry: { captureException: captureExceptionMock },
  });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
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
      result.current.dispatch({ kind: "openDocument", documentId: "d-no-adapter" });
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
    captureExceptionMock.mockReset();
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
    expect(captureExceptionMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        context: "CanvasOrchestrator.adapter",
        phase: "sync-throw",
        intentKind: "showSample",
      }),
    );
  });

  it("captures async adapter rejections to Sentry (OB-08)", async () => {
    captureExceptionMock.mockReset();
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
    expect(captureExceptionMock).toHaveBeenCalledWith(
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
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>)
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
      recordIntentMock.mockReset();
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "openDocument", documentId: "d-42", page: 7 },
          "agent",
        );
      });
      expect(recordIntentMock).toHaveBeenCalledTimes(1);
      const call = recordIntentMock.mock.calls[0][0];
      expect(call.source).toBe("agent");
      expect(call.intent).toEqual({ kind: "openDocument", documentId: "d-42", page: 7 });
      expect(typeof call.chatSessionId).toBe("string");
      expect(call.chatSessionId.length).toBeGreaterThan(0);
    });

    it("UI-10b: dispatch does NOT POST when no ChatStoreProvider is mounted (back-compat)", () => {
      recordIntentMock.mockReset();
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      act(() => {
        result.current.dispatch({ kind: "openDocument", documentId: "d-1" }, "agent");
      });
      expect(recordIntentMock).not.toHaveBeenCalled();
    });

    it("when no ChatStoreProvider is mounted, dispatch still works (back-compat)", () => {
      // Plain CanvasOrchestratorProvider without ChatStore in the tree —
      // dispatch should NOT throw. Side effects are silently skipped.
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
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

  // ── post-mvs-cleanup Phase A — chat↔viewer bus ────────────────────
  describe("chat↔viewer bus", () => {
    const busWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider ephemeral>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>)
    );

    it("openCitation pushes a citation-peek overlay onto the active session's viewer", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => result.current.bus.openCitation("util-1", 3, { x: 0, y: 0, w: 100, h: 50 }));
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const peek = session?.viewer.overlays.find((o) => o.kind === "citation-peek");
      expect(peek).toBeDefined();
      if (peek && peek.kind === "citation-peek") {
        expect(peek.documentId).toBe("util-1");
        expect(peek.page).toBe(3);
      }
    });

    it("docOpened appends an assistant chat message announcing the open", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => result.current.bus.docOpened({ documentId: "util-1", fileName: "utility-bill.pdf" }));
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const lastMessage = session?.messages[session.messages.length - 1];
      expect(lastMessage?.role).toBe("assistant");
      expect(lastMessage?.content).toMatch(/utility-bill\.pdf/);
      // The message uses the `agent-` id prefix so ChatColumn projects it
      // into liveTurns the same way Schema-Agent narration does.
      expect(lastMessage?.id.startsWith("agent-")).toBe(true);
    });

    it("openCitation and docOpened are no-ops without ChatStoreProvider in the tree (back-compat)", () => {
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      expect(() => {
        act(() => result.current.openCitation("d-1", 1));
        act(() => result.current.docOpened({ documentId: "d-1", fileName: "doc.pdf" }));
      }).not.toThrow();
    });
  });

  // ── clickable-citations Phase 3 — highlightCitation routes to a
  //    doc-viewer step transition + highlight slot, not a transient
  //    overlay. The user-visible contract: clicking a chip jumps the
  //    viewer pane to the cited doc + page with the bbox highlighted.
  describe("highlightCitation → doc-viewer step transition (clickable-citations Phase 3)", () => {
    const busWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider ephemeral>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>)
    );

    it("dispatching highlightCitation while no doc-viewer step exists PUSHES a new doc-viewer step with page + highlight", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => {
        result.current.bus.dispatch({
          kind: "highlightCitation",
          documentId: "doc-A",
          page: 7,
          bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
        }, "user");
      });
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      expect(session?.viewer.history.length).toBeGreaterThan(0);
      const current = session?.viewer.history[session.viewer.currentStep.stepIndex];
      expect(current?.kind).toBe("doc-viewer");
      if (current?.kind === "doc-viewer") {
        expect(current.documentId).toBe("doc-A");
        expect(current.highlight?.page).toBe(7);
        expect(current.highlight?.bbox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.05 });
      }
    });

    // "Show all sources" — the showCitations intent writes every citation
    // region onto the doc-viewer step's litRegions (and clears the single
    // highlight), so the viewer can light them all up at once.
    it("writes all citation regions onto the doc-viewer step for showCitations", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => {
        result.current.bus.dispatch(
          {
            kind: "showCitations",
            documentId: "doc-A",
            page: 1,
            regions: [
              { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.05, color: "green" },
              { page: 2, x: 0.2, y: 0.3, w: 0.4, h: 0.06, color: "coral" },
            ],
          },
          "user",
        );
      });
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const current = session?.viewer.history[session.viewer.currentStep.stepIndex];
      expect(current?.kind).toBe("doc-viewer");
      if (current?.kind === "doc-viewer") {
        expect(current.documentId).toBe("doc-A");
        expect(current.litRegions).toHaveLength(2);
        expect(current.litRegions?.[0]).toMatchObject({ color: "green", page: 1 });
        expect(current.highlight).toBeUndefined();
      }
    });

    // add-citation-toggle — a USER click on the citation already shown clears
    // it (toggle off). Agent auto-highlight never toggles.
    it("toggles the highlight off when the active citation is re-clicked by the user", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      const cite = {
        kind: "highlightCitation" as const,
        documentId: "doc-A",
        page: 3,
        bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
      };
      const topStep = () => {
        const s = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
        return s ? s.viewer.history[s.viewer.currentStep.stepIndex] : null;
      };

      act(() => result.current.bus.dispatch(cite, "user"));
      let top = topStep();
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") expect(top.highlight?.page).toBe(3);

      // Same citation, same user → cleared (toggle off).
      act(() => result.current.bus.dispatch(cite, "user"));
      top = topStep();
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") expect(top.highlight).toBeUndefined();

      // Click again → re-applied.
      act(() => result.current.bus.dispatch(cite, "user"));
      top = topStep();
      if (top?.kind === "doc-viewer") expect(top.highlight?.page).toBe(3);
    });

    // multi-region-citations regression — clicking a DIFFERENT citation that
    // happens to share the active citation's FIRST region box must SWITCH to it
    // (show its regions), not be misread as a re-click of the active one and
    // cleared. Many citations on a tabular/list answer legitimately share the
    // same first region (the container chunk dozens of values fall inside), so
    // the toggle must compare the WHOLE region set, not just the first box.
    it("switches to a different citation sharing the first box but with different regions (does NOT toggle off)", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      const sharedFirst = { x: 0.095, y: 0.029, w: 0.851, h: 0.17 };
      const citeA = {
        kind: "highlightCitation" as const,
        documentId: "doc-A",
        page: 2,
        bbox: sharedFirst,
        tier: "paraphrase" as const,
        regions: [
          { page: 2, bbox: sharedFirst, tier: "paraphrase" as const },
          { page: 2, bbox: { x: 0.21, y: 0.27, w: 0.72, h: 0.65 }, tier: "paraphrase" as const },
        ],
      };
      const citeB = {
        kind: "highlightCitation" as const,
        documentId: "doc-A",
        page: 2,
        bbox: sharedFirst, // SAME first-region box as citeA…
        tier: "paraphrase" as const,
        regions: [
          { page: 2, bbox: sharedFirst, tier: "paraphrase" as const },
          // …but a DIFFERENT second region (on page 3) — this is a different citation.
          { page: 3, bbox: { x: 0.088, y: 0.088, w: 0.406, h: 0.604 }, tier: "paraphrase" as const },
        ],
      };
      const topStep = () => {
        const s = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
        return s ? s.viewer.history[s.viewer.currentStep.stepIndex] : null;
      };

      act(() => result.current.bus.dispatch(citeA, "user"));
      let top = topStep();
      if (top?.kind === "doc-viewer") expect(top.highlight?.regions?.length).toBe(2);

      // Click citeB — a DIFFERENT citation that shares citeA's first box.
      act(() => result.current.bus.dispatch(citeB, "user"));
      top = topStep();
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") {
        // Must have SWITCHED to citeB, not cleared.
        expect(top.highlight).toBeDefined();
        expect(top.highlight?.regions?.length).toBe(2);
        expect(top.highlight?.regions?.[1]?.page).toBe(3); // citeB's distinct region
      }

      // Re-click the SAME citation (citeB) → toggles off (dismiss), unchanged.
      act(() => result.current.bus.dispatch(citeB, "user"));
      top = topStep();
      if (top?.kind === "doc-viewer") expect(top.highlight).toBeUndefined();
    });

    it("agent auto-highlight does NOT toggle off on an identical repeat", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      const cite = {
        kind: "highlightCitation" as const,
        documentId: "doc-A",
        page: 2,
        bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
      };
      act(() => result.current.bus.dispatch(cite, "agent"));
      act(() => result.current.bus.dispatch(cite, "agent")); // repeat
      const s = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const top = s?.viewer.history[s.viewer.currentStep.stepIndex];
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") expect(top.highlight?.page).toBe(2); // still set
    });

    // show-all-sources toggle (2026-06-11) — a USER re-click of "Show all
    // sources" while those same regions are lit clears them (toggle off),
    // mirroring the single-citation toggle above.
    it("toggles the lit regions off when 'show all sources' is re-clicked by the user", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      const showAll = {
        kind: "showCitations" as const,
        documentId: "doc-A",
        page: 1,
        regions: [
          { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.02, color: "green" as const },
          { page: 2, x: 0.2, y: 0.3, w: 0.4, h: 0.02, color: "coral" as const },
        ],
      };
      const topStep = () => {
        const s = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
        return s ? s.viewer.history[s.viewer.currentStep.stepIndex] : null;
      };

      act(() => result.current.bus.dispatch(showAll, "user"));
      let top = topStep();
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") expect(top.litRegions?.length).toBe(2);

      // Same regions, same user → cleared (toggle off); the page stays shown.
      act(() => result.current.bus.dispatch(showAll, "user"));
      top = topStep();
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") expect(top.litRegions ?? []).toHaveLength(0);

      // Click again → re-applied.
      act(() => result.current.bus.dispatch(showAll, "user"));
      top = topStep();
      if (top?.kind === "doc-viewer") expect(top.litRegions?.length).toBe(2);
    });

    it("agent-sourced showCitations does NOT toggle off on an identical repeat", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      const showAll = {
        kind: "showCitations" as const,
        documentId: "doc-A",
        page: 1,
        regions: [{ page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.02, color: "green" as const }],
      };
      act(() => result.current.bus.dispatch(showAll, "agent"));
      act(() => result.current.bus.dispatch(showAll, "agent")); // repeat
      const s = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const top = s?.viewer.history[s.viewer.currentStep.stepIndex];
      expect(top?.kind).toBe("doc-viewer");
      if (top?.kind === "doc-viewer") expect(top.litRegions?.length).toBe(1); // still lit
    });

    // WF-06b — the citation tier rides the intent into the step's
    // highlight slot so the viewer pane can render at the right precision.
    it("threads the citation tier onto the doc-viewer step highlight slot", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => {
        result.current.bus.dispatch({
          kind: "highlightCitation",
          documentId: "doc-A",
          page: 4,
          bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
          tier: "paraphrase",
        }, "user");
      });
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const current = session?.viewer.history[session.viewer.currentStep.stepIndex];
      expect(current?.kind).toBe("doc-viewer");
      if (current?.kind === "doc-viewer") {
        expect(current.highlight?.tier).toBe("paraphrase");
      }
    });

    it("dispatching highlightCitation while a doc-viewer step for the SAME documentId is active MUTATES the highlight in place (no new step)", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      // First click — push.
      act(() => {
        result.current.bus.dispatch(
          { kind: "highlightCitation", documentId: "doc-A", page: 1 },
          "user",
        );
      });
      const after1 = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const lenAfter1 = after1?.viewer.history.length ?? 0;
      // Second click — mutate, same document.
      act(() => {
        result.current.bus.dispatch(
          { kind: "highlightCitation", documentId: "doc-A", page: 7, bbox: { x: 0, y: 0, w: 1, h: 0.1 } },
          "user",
        );
      });
      const after2 = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      // History length unchanged — step was mutated, not pushed.
      expect(after2?.viewer.history.length).toBe(lenAfter1);
      const current = after2?.viewer.history[after2.viewer.currentStep.stepIndex];
      expect(current?.kind).toBe("doc-viewer");
      if (current?.kind === "doc-viewer") {
        expect(current.documentId).toBe("doc-A");
        expect(current.highlight?.page).toBe(7);
        expect(current.highlight?.bbox).toEqual({ x: 0, y: 0, w: 1, h: 0.1 });
      }
    });

    it("dispatching highlightCitation for a DIFFERENT documentId PUSHES a new step (doesn't mutate the prior one)", () => {
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => {
        result.current.bus.dispatch({ kind: "highlightCitation", documentId: "doc-A", page: 3 }, "user");
      });
      act(() => {
        result.current.bus.dispatch({ kind: "highlightCitation", documentId: "doc-B", page: 5 }, "user");
      });
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      // Two doc-viewer steps now — different docs ≠ in-place mutation.
      const docViewerSteps = (session?.viewer.history ?? []).filter((s) => s.kind === "doc-viewer");
      expect(docViewerSteps.length).toBe(2);
      const last = session?.viewer.history[session.viewer.currentStep.stepIndex];
      expect(last?.kind).toBe("doc-viewer");
      if (last?.kind === "doc-viewer") {
        expect(last.documentId).toBe("doc-B");
        expect(last.highlight?.page).toBe(5);
      }
    });

    it("dispatching highlightCitation without a ChatStoreProvider is a no-op (back-compat)", () => {
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      expect(() => {
        act(() => {
          result.current.dispatch({ kind: "highlightCitation", documentId: "d-1", page: 1 }, "user");
        });
      }).not.toThrow();
    });
  });

  // ── 2026-05-29-smart-report-screen Phase 5 — report pin + section
  //    proposal intents route to the SAME ChatStore actions the on-screen
  //    controls call (the interim AgentToolBus bridge). This is the
  //    "each tool performs the same mutation as its UI control" guarantee.
  describe("smart-report Phase 5 — pin + section proposal routing", () => {
    const wiredWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>)
    );
    function useBoth() {
      return { orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() };
    }

    it("pinToReport intent lands a section carrying the literal turn text", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "pinToReport", turnId: "m-9", text: "Total due is $142.18." },
          "agent",
        );
      });
      const session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.reportOverlay.addedFields).toHaveLength(1);
      expect(session.reportOverlay.addedFields[0]).toMatchObject({
        question: "Total due is $142.18.",
        pinnedFromTurnId: "m-9",
      });
    });

    it("proposeReportSection enqueues a proposal; acceptReportSection lands it", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "proposeReportSection", name: "anomalies", renderAs: "BULLETS", question: "List anomalies." },
          "agent",
        );
      });
      let session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.reportOverlay.pendingFieldProposals).toHaveLength(1);
      const proposalId = session.reportOverlay.pendingFieldProposals[0].id;
      act(() => {
        result.current.orchestrator.dispatch({ kind: "acceptReportSection", proposalId }, "agent");
      });
      session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.reportOverlay.pendingFieldProposals).toHaveLength(0);
      expect(session.reportOverlay.addedFields).toHaveLength(1);
      expect(session.reportOverlay.addedFields[0]).toMatchObject({ name: "anomalies", renderAs: "BULLETS" });
    });

    it("rejectReportSection drops the proposal without adding a section", () => {
      const { result } = renderHook(useBoth, { wrapper: wiredWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "proposeReportSection", name: "anomalies", renderAs: "BULLETS", question: "List anomalies." },
          "agent",
        );
      });
      let session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      const proposalId = session.reportOverlay.pendingFieldProposals[0].id;
      act(() => {
        result.current.orchestrator.dispatch({ kind: "rejectReportSection", proposalId }, "agent");
      });
      session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.reportOverlay.pendingFieldProposals).toHaveLength(0);
      expect(session.reportOverlay.addedFields).toHaveLength(0);
    });
  });

  // ── 2026-05-29-smart-report-screen Phase 5 (step-17 gate fix) — the
  //    canvas-dispatch `show_*` tools must actually MOVE the canvas. The
  //    `show_smart_report_render` tool emits `showReport` and
  //    `show_smart_report_edit` emits `editTemplate`; both are routed
  //    through a built-in orchestrator handler (mirroring commitGate/
  //    dismissGate) to `OnboardingSession.advanceFrame`. Without this the
  //    tools are no-op telemetry. These tests dispatch the intent and
  //    assert the frame advances + the builder section pre-selects.
  describe("smart-report Phase 5 — showReport / editTemplate advance the canvas frame", () => {
    // The orchestrator routes these through the OPTIONAL OnboardingSession,
    // so the wrapper mounts it with an active scenario entity (advanceFrame
    // only flips non-f1 frames when an entity is active). The scenario seeds
    // at f3 so an advance to f4/f4a is an observable transition.
    const onboardingWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <OnboardingSessionProvider initialFrame="f3" initialScenario="utility">
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ChatStoreProvider>)
    );
    function useBoth() {
      return { orchestrator: useCanvasOrchestrator(), session: useOnboardingSession() };
    }

    it("showReport advances the canvas to the render frame (f4)", () => {
      const { result } = renderHook(useBoth, { wrapper: onboardingWrapper });
      expect(result.current.session.state.currentFrame).toBe("f3");
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showReport", templateId: "draft", scope: { type: "bucket", bucketId: 28454 } },
          "agent",
        );
      });
      expect(result.current.session.state.currentFrame).toBe("f4");
    });

    it("editTemplate advances the canvas to the builder frame (f4a) and pre-selects the section", () => {
      const { result } = renderHook(useBoth, { wrapper: onboardingWrapper });
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "editTemplate", templateId: "draft", selectedSectionId: "anomalies" },
          "agent",
        );
      });
      expect(result.current.session.state.currentFrame).toBe("f4a");
      expect(result.current.session.state.selectedReportSectionId).toBe("anomalies");
    });

    it("editTemplate without a selectedSectionId advances to f4a with no pre-selected section", () => {
      const { result } = renderHook(useBoth, { wrapper: onboardingWrapper });
      act(() => {
        result.current.orchestrator.dispatch({ kind: "editTemplate", templateId: "draft" }, "agent");
      });
      expect(result.current.session.state.currentFrame).toBe("f4a");
      expect(result.current.session.state.selectedReportSectionId).toBeNull();
    });

    // 2026-05-30-onboarding-shell-shared-view Phase 3b — the
    // `show_integrate` canvas-dispatch tool emits `showIntegrate`, routed
    // (mirroring showExtract → f3 / showReport → f4) through the built-in
    // orchestrator handler to `OnboardingSession.advanceFrame("f7")`.
    it("showIntegrate advances the canvas to the Integrate frame (f7)", () => {
      const { result } = renderHook(useBoth, { wrapper: onboardingWrapper });
      expect(result.current.session.state.currentFrame).toBe("f3");
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showIntegrate", scope: { type: "bucket", bucketId: 28454 } },
          "agent",
        );
      });
      expect(result.current.session.state.currentFrame).toBe("f7");
    });

    it("showExtract / showIntegrate push product viewer steps without an OnboardingSessionProvider", () => {
      const productWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );

      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showExtract", scope: { type: "bucket", bucketId: 1 }, schemaId: "schema-1" },
          "agent",
        );
      });
      let session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      // standardized-viewer-control T5 (D6) — `showExtract` honors `schemaId`
      // (no hardcoded "utility"); the workbench step's scenarioId is the dispatched schema.
      expect(session.viewer.history[session.viewer.currentStep.stepIndex]).toEqual({
        kind: "extract-workbench",
        scenarioId: "schema-1",
      });

      act(() => {
        result.current.orchestrator.dispatch({ kind: "showIntegrate", scope: { type: "bucket", bucketId: 1 } });
      });
      session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.viewer.history[session.viewer.currentStep.stepIndex]).toEqual({ kind: "integrate" });
    });

    // standardized-viewer-control T4 — a focus sub-position change is an
    // IN-PLACE mutation of the active extract-workbench step (not a new push),
    // so re-focusing the live workbench doesn't grow viewer history (and, in
    // onboarding, doesn't re-fire the first-entry side effects). The first
    // showExtract enters the workbench (push); a second showExtract carrying a
    // different focusedCategoryId re-focuses the SAME step in place.
    it("a second showExtract re-focuses the active extract-workbench step IN PLACE (history length unchanged)", () => {
      const productWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );
      const scope = { type: "documents" as const, documentIds: ["doc-A"] };
      // First showExtract — enters the workbench (push).
      act(() => {
        result.current.orchestrator.dispatch({ kind: "showExtract", scope, schemaId: "utility" }, "user");
      });
      const after1 = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      const lenAfter1 = after1.viewer.history.length;
      expect(after1.viewer.history[after1.viewer.currentStep.stepIndex].kind).toBe("extract-workbench");
      // Second showExtract with a focus — re-focuses the SAME step in place.
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showExtract", scope, schemaId: "utility", focusedCategoryId: "meters" },
          "user",
        );
      });
      const after2 = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      // History length unchanged — the step was mutated, not pushed.
      expect(after2.viewer.history.length).toBe(lenAfter1);
      const current = after2.viewer.history[after2.viewer.currentStep.stepIndex];
      expect(current.kind).toBe("extract-workbench");
      if (current.kind === "extract-workbench") {
        expect(current.focusedCategoryId).toBe("meters");
      }
    });

    it("showReport / editTemplate push render and builder report steps without an OnboardingSessionProvider", () => {
      const productWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );

      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showReport", templateId: "draft", scope: { type: "bucket", bucketId: 1 } },
          "agent",
        );
      });
      let session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.viewer.history[session.viewer.currentStep.stepIndex]).toEqual({
        kind: "report",
        surface: "render",
      });

      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "editTemplate", templateId: "draft", selectedSectionId: "anomalies" },
          "agent",
        );
      });
      session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      expect(session.viewer.history[session.viewer.currentStep.stepIndex]).toEqual({
        kind: "report",
        surface: "builder",
        selectedSectionId: "anomalies",
      });
    });
  });

  // 2026-05-31-shared-canvas-affordance-restoration — the previously-DORMANT
  // `openGate` intent is now routed through the OPTIONAL OnboardingSession to
  // `openGate(trigger)`. This is the single mechanism the chat-driven
  // `save_to_account` tool (the chat successor to the retired F5 Interact Save
  // button) uses to open the sign-in gate on the live canvas — no parallel path.
  describe("openGate intent routes to OnboardingSession.openGate", () => {
    const onboardingWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <OnboardingSessionProvider initialFrame="f5" initialScenario="utility">
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ChatStoreProvider>)
    );
    function useBoth() {
      return { orchestrator: useCanvasOrchestrator(), session: useOnboardingSession() };
    }

    it("openGate opens the sign-in gate with the dispatched trigger", () => {
      const { result } = renderHook(useBoth, { wrapper: onboardingWrapper });
      expect(result.current.session.state.gate.status).not.toBe("open");
      act(() => {
        result.current.orchestrator.dispatch({ kind: "openGate", trigger: "save" }, "agent");
      });
      const gate = result.current.session.state.gate;
      expect(gate.status).toBe("open");
      // Narrow the GateStatus union — `trigger` lives on the open/dismissed arms.
      expect(gate.status === "open" ? gate.trigger : undefined).toBe("save");
    });

    it("openGate is a no-op (no throw) without an OnboardingSessionProvider", () => {
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      expect(() => {
        act(() => {
          result.current.dispatch({ kind: "openGate", trigger: "save" });
        });
      }).not.toThrow();
    });
  });

  // ── standardized-viewer-control T5 — one outcome, payload honored,
  //    side effects re-homed ──────────────────────────────────────────
  //
  // The `show*` / `editTemplate` / `editSchema` handlers no longer FORK on
  // experience: each pushes/mutates its viewer step honoring the intent payload,
  // identically in onboarding and steady (onboarding layers journey-progress +
  // the first-reach analytic on top). `showInteract` resolves a document from
  // its scope so the interact canvas isn't a doc-less PdfViewer.
  describe("T5 — de-forked show* outcome + showInteract document bridge", () => {
    const onboardingWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <OnboardingSessionProvider initialFrame="f3" initialScenario="utility">
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ChatStoreProvider>)
    );
    const productWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>)
    );
    // standardized-viewer-control T3 — the onboarding seed now PRIMES the viewer
    // with the step for `initialFrame` (so the frame-free StepStrip resolves on
    // first render). To exercise the FRESH-PUSH branch of `showExtract` (the
    // "honors schemaId, no hardcoded utility" assertion), seed at f2/Understand
    // — a `doc-viewer` step — so the dispatch pushes a NEW workbench step rather
    // than re-entering an already-active one (re-entry mutates focus/surface in
    // place and intentionally does NOT change scenarioId — see the showExtract
    // handler's T4/T5 in-place rules).
    const onboardingWrapperAtUnderstand = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <OnboardingSessionProvider initialFrame="f2" initialScenario="utility">
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ChatStoreProvider>)
    );

    function topStep(chatStore: ReturnType<typeof useChatStore>) {
      const s = chatStore.state.sessions.get(chatStore.state.activeSessionId!);
      return s ? s.viewer.history[s.viewer.currentStep.stepIndex] : null;
    }

    it("showExtract PUSHES the workbench step in ONBOARDING too (de-forked — not only steady)", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: onboardingWrapperAtUnderstand },
      );
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showExtract", scope: { type: "documents", documentIds: ["doc-A"] }, schemaId: "loan" },
          "user",
        );
      });
      const current = topStep(result.current.chatStore);
      expect(current?.kind).toBe("extract-workbench");
      // Honors schemaId in onboarding too (no hardcoded "utility").
      if (current?.kind === "extract-workbench") expect(current.scenarioId).toBe("loan");
    });

    it("showExtract advances onboarding journey progress (currentFrame → analyze/f3) while pushing the step", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore(), session: useOnboardingSession() }),
        { wrapper: onboardingWrapper },
      );
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showExtract", scope: { type: "documents", documentIds: ["doc-A"] }, schemaId: "utility" },
          "user",
        );
      });
      // The workbench journey stage is reached (f3 = analyze/Extract).
      expect(result.current.session.state.currentFrame).toBe("f3");
    });

    it("showInteract resolves a document from scope onto the interact-chat step (steady — not doc-less)", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showInteract", scope: { type: "documents", documentIds: ["doc-INT"] } },
          "user",
        );
      });
      const current = topStep(result.current.chatStore);
      expect(current?.kind).toBe("interact-chat");
      // The handler resolves the scope's primary document onto the step so the
      // canvas (the shared PdfViewer) mounts a real document, not a doc-less view.
      if (current?.kind === "interact-chat") expect(current.documentId).toBe("doc-INT");
    });

    it("showInteract with a non-document scope pushes interact-chat without a documentId (graceful)", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showInteract", scope: { type: "bucket", bucketId: 28454 } },
          "user",
        );
      });
      const current = topStep(result.current.chatStore);
      expect(current?.kind).toBe("interact-chat");
      if (current?.kind === "interact-chat") expect(current.documentId).toBeUndefined();
    });

    it("showInteract advances onboarding journey progress to Interact (f5) while pushing the step", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore(), session: useOnboardingSession() }),
        { wrapper: onboardingWrapper },
      );
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showInteract", scope: { type: "documents", documentIds: ["doc-INT"] } },
          "user",
        );
      });
      expect(result.current.session.state.currentFrame).toBe("f5");
      const current = topStep(result.current.chatStore);
      expect(current?.kind).toBe("interact-chat");
    });

    it("editSchema is reachable in STEADY (no OnboardingSessionProvider) — pushes a design surface step", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );
      // Enter the workbench, then open the design surface.
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showExtract", scope: { type: "documents", documentIds: ["doc-A"] }, schemaId: "utility" },
          "user",
        );
      });
      act(() => {
        result.current.orchestrator.dispatch({ kind: "editSchema", schemaId: "utility" }, "user");
      });
      const current = topStep(result.current.chatStore);
      expect(current?.kind).toBe("extract-workbench");
      if (current?.kind === "extract-workbench") expect(current.surface).toBe("design");
    });

    it("editSchema with no active workbench step PUSHES a design-surface workbench step", () => {
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore() }),
        { wrapper: productWrapper },
      );
      act(() => {
        result.current.orchestrator.dispatch({ kind: "editSchema", schemaId: "utility" }, "user");
      });
      const current = topStep(result.current.chatStore);
      expect(current?.kind).toBe("extract-workbench");
      if (current?.kind === "extract-workbench") {
        expect(current.surface).toBe("design");
        expect(current.scenarioId).toBe("utility");
      }
    });
  });

  // 2026-06-10 — the previously adapter-registry-only kinds gained built-in
  // handlers after a live-canvas audit found them dispatching (POST /api/intent
  // logged) with NO registered adapter anywhere in the production tree — silent
  // no-ops. Each routes to the SAME mutator the on-screen control calls (no
  // parallel path):
  //   showSample    → OnboardingSession.pickScenario(intent.scenario)
  //   editSchema    → push/mutate extract-workbench step → surface:"design"
  //                   (T5/R7 — experience-agnostic schema design surface; was
  //                    `advanceFrame("f3a")`, an onboarding-only no-op-in-steady)
  //   openDocument  → ChatStore.gotoDocViewer (mirrors jumpToPage)
  // (standardized-viewer-control T7 retired the `switchFrame` kind + its
  // `suggest_intent` source — per-destination navigation intents replace it.)
  describe("formerly-silent kinds get built-in handlers (showSample / editSchema / openDocument)", () => {
    const onboardingWrapper = ({ children }: { children: React.ReactNode }) => (
      withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
        <OnboardingSessionProvider initialFrame="f3" initialScenario="utility">
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ChatStoreProvider>)
    );
    function useBoth() {
      return { orchestrator: useCanvasOrchestrator(), session: useOnboardingSession() };
    }

    it("showSample activates the dispatched scenario", () => {
      const { result } = renderHook(useBoth, { wrapper: onboardingWrapper });
      act(() => {
        result.current.orchestrator.dispatch({ kind: "showSample", scenario: "loan" }, "user");
      });
      expect(result.current.session.state.scenario).toBe("loan");
    });

    // standardized-viewer-control T5 (R7) — `editSchema` is now an
    // experience-AGNOSTIC outcome: it pushes/mutates the extract-workbench step
    // into `surface: "design"` (the schema DESIGN surface), mirroring how
    // `editTemplate` pushes `report` `surface: "builder"`. No `advanceFrame("f3a")`,
    // no experience fork. The journey stage stays `analyze` (Extract); design is a
    // sub-position, NOT a new frame — so `currentFrame` stays put (f3), not f3a.
    it("editSchema mutates the active extract-workbench step into surface='design' (onboarding)", () => {
      const onboardingWithChat = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<ChatStoreProvider autoSeedDefaultSession>
          <OnboardingSessionProvider initialFrame="f3" initialScenario="utility">
            <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
          </OnboardingSessionProvider>
        </ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ orchestrator: useCanvasOrchestrator(), chatStore: useChatStore(), session: useOnboardingSession() }),
        { wrapper: onboardingWithChat },
      );
      // Enter the workbench first (so editSchema mutates in place).
      act(() => {
        result.current.orchestrator.dispatch(
          { kind: "showExtract", scope: { type: "documents", documentIds: ["doc-A"] }, schemaId: "utility" },
          "user",
        );
      });
      const lenBefore = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!.viewer.history.length;
      act(() => {
        result.current.orchestrator.dispatch({ kind: "editSchema", schemaId: "utility" }, "user");
      });
      const session = result.current.chatStore.state.sessions.get(
        result.current.chatStore.state.activeSessionId!,
      )!;
      // Mutated in place — history length unchanged.
      expect(session.viewer.history.length).toBe(lenBefore);
      const current = session.viewer.history[session.viewer.currentStep.stepIndex];
      expect(current.kind).toBe("extract-workbench");
      if (current.kind === "extract-workbench") expect(current.surface).toBe("design");
      // The journey stage is unchanged — design is a sub-position of Extract.
      expect(result.current.session.state.currentFrame).toBe("f3");
    });

    it("openDocument pushes a doc-viewer step (defaults to page 1)", () => {
      const busWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<ChatStoreProvider ephemeral>
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => {
        result.current.bus.dispatch({ kind: "openDocument", documentId: "doc-A" }, "user");
      });
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const current = session?.viewer.history[session.viewer.currentStep.stepIndex];
      expect(current?.kind).toBe("doc-viewer");
      if (current?.kind === "doc-viewer") {
        expect(current.documentId).toBe("doc-A");
        expect(current.page).toBe(1);
      }
    });

    it("openDocument honors an explicit page", () => {
      const busWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<ChatStoreProvider ephemeral>
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ bus: useCanvasOrchestrator(), store: useChatStore() }),
        { wrapper: busWrapper },
      );
      act(() => result.current.store.newSession({ isOnboardingSession: true }));
      act(() => {
        result.current.bus.dispatch({ kind: "openDocument", documentId: "doc-B", page: 4 }, "user");
      });
      const session = result.current.store.state.sessions.get(result.current.store.state.activeSessionId!);
      const current = session?.viewer.history[session.viewer.currentStep.stepIndex];
      expect(current?.kind).toBe("doc-viewer");
      if (current?.kind === "doc-viewer") {
        expect(current.documentId).toBe("doc-B");
        expect(current.page).toBe(4);
      }
    });

    it("showSample / editSchema are no-ops (no throw) without an OnboardingSessionProvider", () => {
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        withCanvasApi(<CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>)
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      expect(() => {
        act(() => {
          result.current.dispatch({ kind: "showSample", scenario: "utility" });
          result.current.dispatch({ kind: "editSchema", schemaId: "s1" });
        });
      }).not.toThrow();
    });
  });
});
