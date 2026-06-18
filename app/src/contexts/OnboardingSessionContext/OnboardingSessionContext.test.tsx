import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// OB-02: mock the analytics wrapper so we can assert track() fires at
// each funnel boundary without making real PostHog calls.
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  identify: vi.fn(),
  initAnalytics: vi.fn(() => false),
  resetAnalytics: vi.fn(),
}));
import { track } from "@/lib/analytics";
// OB-03: mock the GA wrapper too — onboarding bootstraps + pickScenario
// now call gaSetDefaults to wire the sticky dimensions.
vi.mock("@/lib/ga", () => ({
  gaSetDefaults: vi.fn(),
  initGa: vi.fn(() => false),
  gaTrack: vi.fn(),
}));
import { gaSetDefaults } from "@/lib/ga";

import { ApiProvider } from "@/contexts/ApiContext";
import { selectActiveStep, useChatStore } from "@/contexts/ChatStoreContext";
import { makeFakeApi } from "@/test/makeFakeApi";
import { useActiveStepDiagnostic, useResumeAnchorDiagnostic } from "@/test/activeStepDiagnostic";
import { OnboardingSessionProvider, useOnboardingSession } from "./OnboardingSessionContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ApiProvider value={makeFakeApi()}>
    <OnboardingSessionProvider>{children}</OnboardingSessionProvider>
  </ApiProvider>
);

describe("OnboardingSessionContext", () => {
  it("starts on the ingest picker (no active viewer step), no scenario, idle gate, no session id", () => {
    const { result } = renderHook(
      () => ({ session: useOnboardingSession(), stepDiagnostic: useActiveStepDiagnostic() }),
      { wrapper },
    );
    // No scenario picked → no active viewer step yet (the frame-free successor
    // to the old `currentFrame === "f1"` picker default).
    expect(result.current.stepDiagnostic).toBeNull();
    expect(result.current.session.state.scenario).toBeNull();
    expect(result.current.session.state.gate.status).toBe("idle");
    expect(result.current.session.state.sessionId).toBeNull();
  });

  it("bootstrapSession sets server-issued id", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.bootstrapSession("sess_abc"));
    expect(result.current.state.sessionId).toBe("sess_abc");
  });

  it("exposes the durable reachedStages set on session state (seeded by pickScenario, grown by markStageReached)", () => {
    // standardized-viewer-control T6b — the persisted, server-twinned reached-set
    // (`EntitySession.reachedStages`) is now PROJECTED onto the session state so
    // the StepStrip reads ONE source of truth (no strip-local re-accumulation).
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    // Pre-scenario: no active entity → empty set (stable identity).
    expect([...result.current.state.reachedStages]).toEqual([]);
    const emptyA = result.current.state.reachedStages;
    const emptyB = result.current.state.reachedStages;
    expect(emptyA).toBe(emptyB); // stable empty-set const keeps the memo stable

    // pickScenario seeds the journey-origin stages.
    act(() => result.current.pickScenario("utility"));
    expect([...result.current.state.reachedStages].sort()).toEqual(["ingest", "understand"]);

    // markStageReached(Extract) adds `analyze` to the durable set.
    act(() =>
      result.current.markStageReached({ kind: "extract-workbench", scenarioId: "utility" }),
    );
    expect([...result.current.state.reachedStages].sort()).toEqual([
      "analyze",
      "ingest",
      "understand",
    ]);
  });

  it("markStageReached advances the resume anchor + records the reached stage (inside an active sample)", () => {
    // standardized-viewer-control — `markStageReached` operates on the active
    // entity (frame-free successor to `advanceFrame`). From the picker with
    // no entity active it's a no-op — the user must pickScenario first. Picking
    // a sample lands the user on the Understand doc-viewer step; reaching Extract
    // moves the resume anchor to the extract-workbench step and records the
    // `analyze` stage in the reached-set. `markStageReached` (unlike the
    // orchestrator's full canvas outcome) mutates only the resume anchor
    // (`lastStep`), so this isolated test reads the anchor's step kind directly.
    const { result } = renderHook(
      () => ({ session: useOnboardingSession(), resumeAnchor: useResumeAnchorDiagnostic() }),
      { wrapper },
    );
    act(() => result.current.session.pickScenario("utility"));
    expect(result.current.resumeAnchor).toBe("doc-viewer");
    act(() =>
      result.current.session.markStageReached({ kind: "extract-workbench", scenarioId: "utility" }),
    );
    expect(result.current.resumeAnchor).toBe("extract-workbench");
  });

  it("openGate sets open status with trigger", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    expect(result.current.state.gate.status).toBe("open");
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("save");
    }
  });

  it("dismissGate after open → dismissed", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("export"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("dismissed");
  });

  it("dismissGate from idle is a no-op", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("idle");
  });

  it("once committed, openGate is a no-op (single commit per session)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("register"));
    act(() => result.current.openGate("threshold"));
    expect(result.current.state.gate.status).toBe("committed");
  });

  it("pickScenario sets active scenario", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.pickScenario("solar"));
    expect(result.current.state.scenario).toBe("solar");
  });

  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useOnboardingSession())).toThrow(/OnboardingSessionProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });

  // OB-02 — PostHog event-firing at each funnel boundary. The wrapper
  // is mocked at the top of this file; each test asserts the right
  // (event, props) reached `track()`. Event names come from the
  // `observability` capability spec at `openspec/specs/observability/spec.md`.
  describe("OB-02 PostHog telemetry boundaries", () => {
    function findTrack(event: string): unknown[] | undefined {
      return vi.mocked(track).mock.calls.find((c) => c[0] === event);
    }

    it("bootstrapSession → fires session.started with sessionId + mode", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.bootstrapSession("sess-99"));
      const call = findTrack("session.started");
      expect(call).toBeDefined();
      expect(call?.[1]).toMatchObject({ sessionId: "sess-99", mode: "onboarding" });
    });

    it("OB-03: bootstrapSession → calls gaSetDefaults with sessionId", () => {
      vi.mocked(gaSetDefaults).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.bootstrapSession("sess-99"));
      expect(gaSetDefaults).toHaveBeenCalledWith({ sessionId: "sess-99" });
    });

    it("OB-03: pickScenario → calls gaSetDefaults with currentSample", () => {
      vi.mocked(gaSetDefaults).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("loan"));
      expect(gaSetDefaults).toHaveBeenCalledWith({ currentSample: "loan" });
    });

    it("pickScenario → fires sample.picked AND understand.started", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      expect(findTrack("sample.picked")?.[1]).toMatchObject({ scenario: "utility" });
      expect(findTrack("understand.started")?.[1]).toMatchObject({ scenario: "utility" });
    });

    // standardized-viewer-control T5 (R1) — `understand.completed` re-homed
    // OFF the journey-advance edge and ONTO the Extract first-reach signal
    // (`notifyExtractReached`), which the orchestrator's `showExtract` handler
    // fires. Bare journey advances no longer emit it: extract/interact/report
    // all map to the single `analyze` stage, so binding the event to a stage
    // edge mis-fired.
    it("markStageReached(extract-workbench) → does NOT fire understand.completed (re-homed onto notifyExtractReached, T5/R1)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      vi.mocked(track).mockReset(); // ignore the pick-scenario events
      act(() => result.current.markStageReached({ kind: "extract-workbench", scenarioId: "utility" }));
      expect(findTrack("understand.completed")).toBeUndefined();
    });

    it("markStageReached(interact-chat) → does NOT fire understand.completed (interact is also analyze stage)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      vi.mocked(track).mockReset();
      act(() => result.current.markStageReached({ kind: "interact-chat" }));
      expect(findTrack("understand.completed")).toBeUndefined();
    });

    // standardized-viewer-control T5 (R1/R6) — the Extract first-reach signal.
    // Fires `understand.completed` EXACTLY ONCE per session (ref-gated, the
    // openGate synced-ref pattern — never a flag mutated inside a setState
    // updater), with a frame-free payload (stage/step, NOT fromFrame/toFrame).
    it("notifyExtractReached → fires understand.completed once, frame-free payload (T5/R1)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      vi.mocked(track).mockReset();
      act(() => result.current.notifyExtractReached());
      const call = findTrack("understand.completed");
      expect(call).toBeDefined();
      // Frame keys are gone — the payload names the journey stage + step.
      expect(call?.[1]).toMatchObject({ stage: "analyze", step: "extract-workbench" });
      expect(call?.[1]).not.toHaveProperty("fromFrame");
      expect(call?.[1]).not.toHaveProperty("toFrame");
    });

    it("notifyExtractReached fires ONLY on the first reach (idempotent thereafter)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      vi.mocked(track).mockReset();
      act(() => result.current.notifyExtractReached());
      act(() => result.current.notifyExtractReached());
      act(() => result.current.notifyExtractReached());
      const completedCalls = vi
        .mocked(track)
        .mock.calls.filter((c) => c[0] === "understand.completed");
      expect(completedCalls).toHaveLength(1);
    });

    it("openGate → fires gate.shown with trigger", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      expect(findTrack("gate.shown")?.[1]).toMatchObject({ trigger: "save" });
    });

    it("openGate while already-open(sameTrigger) → does NOT re-fire gate.shown", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      vi.mocked(track).mockReset();
      act(() => result.current.openGate("save"));
      expect(findTrack("gate.shown")).toBeUndefined();
    });

    it("commitGate(register) → fires signup.completed with method", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      act(() => result.current.commitGate("register"));
      expect(findTrack("signup.completed")?.[1]).toMatchObject({ method: "register" });
    });

    it("commitGate(engineer-call) → also fires signup.completed (funnel parity)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      act(() => result.current.commitGate("engineer-call"));
      expect(findTrack("signup.completed")?.[1]).toMatchObject({ method: "engineer-call" });
    });
  });

  // WF-01 C5 — the F2 "GroundX is reading the doc" scanner. The F2
  // doc-viewer step is the reading beat (ThinkingStream's onDone
  // auto-advances to F3), so the step that frames it carries an explicit
  // `scanning: true` flag. <ScopedCanvas> forwards it to the PdfViewer's
  // `showScanAnimation`. Citation-jump doc-viewer steps (pushed by the
  // cite-click sink, NOT this projection) carry no flag and never scan.
  describe("WF-01 C5 — reading-scan flag on the freshly-opened sample's doc-viewer step", () => {
    // standardized-viewer-control (D2) — the frame projection is gone; the
    // scanning beat is seeded directly by `pickScenario` (the sole production
    // caller). Assert the LIVE active viewer step rather than a deleted helper.
    const renderWithStep = () =>
      renderHook(
        () => {
          const session = useOnboardingSession();
          const store = useChatStore();
          const active = store.state.activeSessionId
            ? store.state.sessions.get(store.state.activeSessionId)
            : null;
          return { session, pushStep: store.pushStep, step: selectActiveStep(active) };
        },
        { wrapper },
      );

    it("pickScenario → active step is a doc-viewer with scanning:true on the scenario doc", () => {
      const { result } = renderWithStep();
      act(() => result.current.session.pickScenario("utility"));
      expect(result.current.step).toMatchObject({
        kind: "doc-viewer",
        documentId: "scenario:utility",
        scanning: true,
      });
    });

    it("advancing past Understand does not leave a scanning doc-viewer step active", () => {
      const { result } = renderWithStep();
      act(() => result.current.session.pickScenario("utility"));
      act(() => {
        // The orchestrator pushes the destination step in production; mirror that
        // by reaching Extract (a different kind entirely — no scan).
        result.current.pushStep({ kind: "extract-workbench", scenarioId: "utility" });
      });
      expect(result.current.step).not.toMatchObject({ scanning: true });
    });
  });
});
