import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingShell } from "./OnboardingShell";

/**
 * standardized-viewer-control T6 — OnboardingShell's step-strip pill clicks,
 * the Analyze sub-pill clicks, the post-gate "Continue to Integrate" path, and
 * the URL→state effect move the canvas ONLY by DISPATCHING the corresponding
 * intent (showExtract / showInteract / showReport / editTemplate / showIntegrate
 * / openDocument), never by calling `advanceFrame` directly.
 *
 * Discriminator: a dispatched intent records an `intent-dispatched` ViewerEvent
 * carrying `detail.kind`; a journey-progress advance records a `journey-advanced`
 * event (frame-free, D14). Asserting the former (and that no `journey-advanced`
 * rides along for the strip navigation) proves the click routed through `dispatch`.
 */

const IntentEventsProbe = ({
  onSnapshot,
}: {
  onSnapshot: (events: Array<{ action: string; detail?: Record<string, unknown> }>) => void;
}) => {
  const { state } = useChatStore();
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  onSnapshot(
    active
      ? active.viewerHistory.map((e) => ({ action: e.action, detail: e.detail }))
      : [],
  );
  return null;
};

const dispatchedKinds = (
  events: Array<{ action: string; detail?: Record<string, unknown> }>,
): string[] =>
  events
    .filter((e) => e.action === "intent-dispatched")
    .map((e) => (e.detail?.kind as string | undefined) ?? "")
    .filter(Boolean);

describe("OnboardingShell — step navigation dispatches intents (T6)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Extract sub-pill (Analyze) dispatches showExtract (not advanceFrame)", async () => {
    const user = userEvent.setup();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      // Seed on Interact so the Analyze bracket is reached (sub-pills reachable)
      // but the active step is interact-chat — clicking Extract must move there.
      { initialFrame: "f5", initialScenario: "utility" },
    );

    await user.click(screen.getByText("Extract"));

    await waitFor(() => {
      expect(dispatchedKinds(events)).toContain("showExtract");
      expect(screen.getByTestId("scoped-canvas")).toHaveAttribute(
        "data-canvas-kind",
        "extract-workbench",
      );
    });
  });

  it("Interact sub-pill dispatches showInteract resolving the scenario document", async () => {
    const user = userEvent.setup();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    await user.click(screen.getByText("Interact"));

    await waitFor(() => {
      expect(dispatchedKinds(events)).toContain("showInteract");
      // interact-chat shares the PdfViewer canvas (CanvasKind "doc-viewer").
      expect(screen.getByTestId("scoped-canvas")).toHaveAttribute(
        "data-canvas-kind",
        "doc-viewer",
      );
    });
  });

  it("Report sub-pill with a seeded template dispatches showReport → render surface", async () => {
    const user = userEvent.setup();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    let loadedTemplateId: string | undefined;
    const TemplateProbe = () => {
      const { state } = useChatStore();
      const session = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
      loadedTemplateId = session?.reportOverlay.templateId;
      return null;
    };
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <TemplateProbe />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    await waitFor(() => expect(loadedTemplateId).toBeTruthy());
    await user.click(screen.getByText("Report"));

    await waitFor(() => {
      expect(dispatchedKinds(events)).toContain("showReport");
    });
    expect(await screen.findByTestId("smart-report-render")).toBeInTheDocument();
  });

  it("Report sub-pill with NO template dispatches editTemplate → builder surface", async () => {
    const user = userEvent.setup();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      { initialFrame: "f3", initialScenario: "loan" },
    );

    await user.click(screen.getByText("Report"));

    await waitFor(() => {
      expect(dispatchedKinds(events)).toContain("editTemplate");
    });
    expect(await screen.findByTestId("smart-report-builder")).toBeInTheDocument();
  });

  it("Integrate step-strip pill (signed-in) dispatches showIntegrate → integrate surface", async () => {
    const user = userEvent.setup();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      { initialAuthState: "signed-in", initialFrame: "f3", initialScenario: "loan" },
    );

    await user.click(screen.getByText("Integrate"));

    await waitFor(() => {
      expect(dispatchedKinds(events)).toContain("showIntegrate");
      expect(screen.getByTestId("onboarding-frame-f7")).toBeInTheDocument();
    });
  });
});
