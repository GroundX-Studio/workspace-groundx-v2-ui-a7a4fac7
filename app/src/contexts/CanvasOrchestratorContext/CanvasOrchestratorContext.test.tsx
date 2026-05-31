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
import { OnboardingSessionProvider, useOnboardingSession } from "@/contexts/OnboardingSessionContext";

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

  // ── post-mvs-cleanup Phase A — chat↔viewer bus ────────────────────
  describe("chat↔viewer bus", () => {
    const busWrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatStoreProvider ephemeral>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>
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
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
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
      <ChatStoreProvider ephemeral>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>
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
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
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
      <ChatStoreProvider autoSeedDefaultSession>
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      </ChatStoreProvider>
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
      <ChatStoreProvider autoSeedDefaultSession>
        <OnboardingSessionProvider initialFrame="f3" initialScenario="utility">
          <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ChatStoreProvider>
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

    it("showIntegrate is a no-op (no throw) without an OnboardingSessionProvider", () => {
      const plainWrapper2 = ({ children }: { children: React.ReactNode }) => (
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper2 });
      expect(() => {
        act(() => {
          result.current.dispatch({ kind: "showIntegrate", scope: { type: "bucket", bucketId: 1 } });
        });
      }).not.toThrow();
    });

    it("showReport / editTemplate are no-ops (no throw) without an OnboardingSessionProvider", () => {
      const plainWrapper = ({ children }: { children: React.ReactNode }) => (
        <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
      );
      const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper: plainWrapper });
      expect(() => {
        act(() => {
          result.current.dispatch({ kind: "showReport", templateId: "draft", scope: { type: "bucket", bucketId: 1 } });
          result.current.dispatch({ kind: "editTemplate", templateId: "draft" });
        });
      }).not.toThrow();
    });
  });
});
