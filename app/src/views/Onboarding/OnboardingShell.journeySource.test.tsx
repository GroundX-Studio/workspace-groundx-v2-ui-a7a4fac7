import { act, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import type { CanvasIntent } from "@groundx/shared";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingShell } from "./OnboardingShell";

/**
 * T3 (standardized-viewer-control) — the onboarding StepStrip's CURRENT STAGE
 * is sourced off the active ViewerStep kind via `VIEWER_STEP_TO_JOURNEY`, with
 * NO frame fallback. The reached-set (checkmarks + the `analyzeReached`
 * jump-ahead guard) is a SET of reached stages added on first reach, not a
 * frame-derived monotonic watermark.
 *
 * These tests assert the user-visible strip state as the active viewer step
 * changes through dispatch — never through a frame value. They also cover the
 * citation-jump-no-relock invariant (R3/T3 gate): a `doc-viewer` step maps
 * `currentStep` back to Understand but MUST NOT re-lock an already-reached
 * Analyze bracket.
 */

/** Captures the orchestrator dispatch so a test can drive intents directly. */
const DispatchProbe = ({
  onReady,
}: {
  onReady: (dispatch: (intent: CanvasIntent) => void) => void;
}) => {
  const { dispatch } = useCanvasOrchestrator();
  onReady((intent) => dispatch(intent));
  return null;
};

const strip = () => within(screen.getByTestId("step-strip-wrapper"));

/**
 * The active sub-pill within the Analyze bracket. SubPills deliberately do NOT
 * set `aria-current` (an existing test asserts that asymmetry), so the active
 * state is read off the a11y-neutral `data-state` attribute the strip exposes.
 */
const activeSubstepLabel = (): string | null => {
  const wrap = screen.getByTestId("step-strip-wrapper");
  for (const label of ["Extract", "Interact", "Report"]) {
    const pill = within(wrap).queryByText(label)?.closest('[role="button"]');
    if (pill?.getAttribute("data-state") === "active") return label;
  }
  return null;
};

describe("OnboardingShell — frame-free journey-progress source (T3)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds a viewer step for the initial frame so the strip's current stage reads the step (no frame fallback)", () => {
    // Render seeded on the Extract workbench frame. The harness must seed a
    // matching ChatStore step so `latestViewerStep` is non-null and the strip's
    // current stage resolves WITHOUT the (now-removed) frame fallback.
    renderWithOnboardingProviders(<OnboardingShell />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    // Extract is the active sub-pill, sourced from the seeded extract-workbench
    // step (VIEWER_STEP_TO_JOURNEY["extract-workbench"].substep === "extract").
    expect(activeSubstepLabel()).toBe("Extract");
  });

  it("moves the active stage to follow the active viewer step kind, not any frame", () => {
    let dispatch: (intent: CanvasIntent) => void = () => undefined;
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <DispatchProbe onReady={(d) => (dispatch = d)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    expect(activeSubstepLabel()).toBe("Extract");

    // Dispatch showInteract → pushes an `interact-chat` step. The strip's active
    // sub-pill must follow the step to Interact (frame-free re-source).
    act(() => {
      dispatch({ kind: "showInteract", scope: { type: "documents", documentIds: ["doc-1"] } });
    });
    expect(activeSubstepLabel()).toBe("Interact");
  });

  it("reached-set is a non-contiguous SET: a citation jump back to Understand keeps Integrate's checkmark (R3)", () => {
    let dispatch: (intent: CanvasIntent) => void = () => undefined;
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <DispatchProbe onReady={(d) => (dispatch = d)} />
      </>,
      // Signed-in so Integrate (auth-gated, reachable from anywhere) is real.
      { initialFrame: "f3", initialScenario: "utility", initialAuthState: "signed-in" },
    );

    // Reach Integrate (pushes the `integrate` step → stage `integrate`).
    act(() => {
      dispatch({ kind: "showIntegrate", scope: { type: "documents", documentIds: ["doc-1"] } });
    });
    expect(
      strip().getByText("Integrate").closest('[role="button"]'),
    ).toHaveAttribute("data-state", "active");

    // A citation jump moves the CURRENT stage back to Understand (non-contiguous:
    // Integrate is no longer current). The reached-SET retains `integrate`, so it
    // reads as done-traversed (checkmark) — a monotonic high-water value could
    // not reproduce this.
    act(() => {
      dispatch({ kind: "openDocument", documentId: "scenario:utility", page: 1 });
    });
    expect(
      strip().getByText("Understand").closest('[role="button"]'),
    ).toHaveAttribute("data-state", "active");
    expect(
      strip().getByText("Integrate").closest('[role="button"]'),
      "Integrate must stay done-traversed after a non-contiguous jump back to Understand",
    ).toHaveAttribute("data-state", "done-traversed");
  });

  it("REGRESSION (citation-jump-no-relock): a doc-viewer citation step does NOT re-lock the already-reached Analyze bracket", () => {
    let dispatch: (intent: CanvasIntent) => void = () => undefined;
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <DispatchProbe onReady={(d) => (dispatch = d)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    // Analyze is reached; its substeps are reachable.
    for (const label of ["Extract", "Interact", "Report"]) {
      expect(strip().getByText(label).closest('[role="button"]')).not.toHaveAttribute(
        "aria-disabled",
      );
    }

    // A citation click pushes a `doc-viewer` step → currentStep maps back to
    // Understand. The Analyze bracket must NOT re-lock (analyzeReached survives
    // because the reached-SET already contains `analyze`).
    act(() => {
      dispatch({ kind: "openDocument", documentId: "scenario:utility", page: 2 });
    });
    for (const label of ["Extract", "Interact", "Report"]) {
      expect(
        strip().getByText(label).closest('[role="button"]'),
        `${label} sub-pill must stay reachable after a citation jump`,
      ).not.toHaveAttribute("aria-disabled");
    }
  });
});
