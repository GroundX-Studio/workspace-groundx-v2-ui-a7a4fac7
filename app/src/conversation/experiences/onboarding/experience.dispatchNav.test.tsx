import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import type { ConversationApi } from "@/conversation/useConversation";
import { makeOnboardingExperience } from "./experience";

/**
 * standardized-viewer-control T6 / T9 — the onboarding `experience` moves the
 * canvas ONLY by DISPATCHING the destination intent through the orchestrator,
 * never by calling `advanceFrame` directly:
 *   - the ThinkingStream auto-advance (Understand "Done.") → `showExtract` (T9).
 *   - the "Show me chat" interact pill → `showInteract`.
 *   - the first user send → `showInteract` (the pre-Interact guard preserved).
 *   - the intro-snap (resumed-frame, empty thread) → re-snap to Understand.
 * And the f3a schema-agent header reads the ACTIVE STEP `surface === "design"`,
 * not `currentFrame === "f3a"`.
 *
 * Discriminator: a dispatched intent records an `intent-dispatched` ViewerEvent
 * carrying `detail.kind`. Asserting it proves the path routed through `dispatch`
 * (a bare `advanceFrame` would record `frame-advanced` instead).
 */

const IntentEventsProbe = ({
  onSnapshot,
}: {
  onSnapshot: (events: Array<{ action: string; detail?: Record<string, unknown> }>) => void;
}) => {
  const { state } = useChatStore();
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  onSnapshot(active ? active.viewerHistory.map((e) => ({ action: e.action, detail: e.detail })) : []);
  return null;
};

const dispatchedKinds = (
  events: Array<{ action: string; detail?: Record<string, unknown> }>,
): string[] =>
  events
    .filter((e) => e.action === "intent-dispatched")
    .map((e) => (e.detail?.kind as string | undefined) ?? "")
    .filter(Boolean);

const dispatchedIntents = (
  events: Array<{ action: string; detail?: Record<string, unknown> }>,
): Array<Record<string, unknown>> =>
  events.filter((e) => e.action === "intent-dispatched").map((e) => e.detail ?? {});

/** A minimal ConversationApi stub — the Intro/Choreography read only a few fields. */
function stubConversation(overrides: Partial<ConversationApi> = {}): ConversationApi {
  return {
    hydrated: true,
    liveTurns: [],
    firstUserMessageSent: false,
    ...overrides,
  } as unknown as ConversationApi;
}

describe("onboarding experience — canvas navigation dispatches intents (T6/T9)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    if (typeof window !== "undefined") window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("the ThinkingStream auto-advance (Done) dispatches showExtract — NOT advanceFrame (T9)", async () => {
    vi.useFakeTimers();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    const exp = makeOnboardingExperience({
      scenarioId: "utility",
      thinkingScript: ["scanning the bill", "mapping fields"],
    });
    const Intro = exp.Intro!;
    renderWithOnboardingProviders(
      <>
        <Intro conversation={stubConversation()} />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    // Drive the scripted ThinkingStream to completion → onDone auto-advance.
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }

    // The auto-advance routed through dispatch(showExtract), not advanceFrame.
    expect(dispatchedKinds(events)).toContain("showExtract");
    // It auto-advances to the FIRST category (no focusedCategoryId steer).
    const showExtract = dispatchedIntents(events).find((i) => i.kind === "showExtract");
    expect(showExtract?.focusedCategoryId).toBeUndefined();
  });

  it("the interact pill (Solar 'Show me chat') dispatches showInteract — NOT advanceFrame", async () => {
    vi.useFakeTimers();
    let events: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    // Solar has no schema → derivePickViews yields a single "Show me chat" pill.
    const exp = makeOnboardingExperience({ scenarioId: "solar", thinkingScript: ["reading"] });
    const Intro = exp.Intro!;
    renderWithOnboardingProviders(
      <>
        <Intro conversation={stubConversation()} />
        <IntentEventsProbe onSnapshot={(e) => (events = e)} />
      </>,
      { initialFrame: "f2", initialScenario: "solar" },
    );
    for (let i = 0; i < 8; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    const pill = screen.getByTestId("onboarding-chat-pick-view-interact");
    act(() => {
      pill.click();
    });
    expect(dispatchedKinds(events)).toContain("showInteract");
  });

  it("the first user send dispatches showInteract when pre-Interact, and is GUARDED past Interact", async () => {
    // Pre-Interact (seeded on f2 = Understand): a first send should dispatch showInteract.
    let preEvents: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    const exp = makeOnboardingExperience({ scenarioId: "utility", thinkingScript: [] });
    const Choreography = exp.Choreography!;
    renderWithOnboardingProviders(
      <>
        <Choreography conversation={stubConversation({ firstUserMessageSent: true })} />
        <IntentEventsProbe onSnapshot={(e) => (preEvents = e)} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    await waitFor(() => {
      expect(dispatchedKinds(preEvents)).toContain("showInteract");
    });
  });

  it("the first user send does NOT dispatch showInteract when already AT Interact (guard)", async () => {
    let atInteractEvents: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    const exp = makeOnboardingExperience({ scenarioId: "utility", thinkingScript: [] });
    const Choreography = exp.Choreography!;
    renderWithOnboardingProviders(
      <>
        <Choreography conversation={stubConversation({ firstUserMessageSent: true })} />
        <IntentEventsProbe onSnapshot={(e) => (atInteractEvents = e)} />
      </>,
      // Seeded on f5 (interact-chat) — the user is already AT Interact.
      { initialFrame: "f5", initialScenario: "utility" },
    );
    // Give any (wrong) dispatch a beat to land.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(dispatchedKinds(atInteractEvents)).not.toContain("showInteract");
  });

  it("the f3a schema-agent header reads the active step surface (design), not the frame", async () => {
    // Mount the Intro; the design surface is reached by DISPATCHING editSchema
    // (the production path), NOT by seeding initialFrame:'f3a'. A bare f3
    // (fields surface) must NOT show the schema-agent header.
    const exp = makeOnboardingExperience({ scenarioId: "utility", thinkingScript: [] });
    const Intro = exp.Intro!;
    const DesignOpener = () => {
      const orchestrator = useCanvasOrchestrator();
      return (
        <button
          data-testid="open-design"
          onClick={() => orchestrator.dispatch({ kind: "editSchema", schemaId: "utility" }, "user")}
        >
          open
        </button>
      );
    };
    renderWithOnboardingProviders(
      <>
        <Intro conversation={stubConversation()} />
        <DesignOpener />
      </>,
      // Seeded on f3 (extract-workbench, fields surface).
      { initialFrame: "f3", initialScenario: "utility" },
    );

    // Default (fields) — no schema-agent header.
    expect(screen.queryByTestId("chat-schema-agent-header")).not.toBeInTheDocument();

    // Flip to the DESIGN surface via the dispatched intent.
    await userEvent.click(screen.getByTestId("open-design"));

    await waitFor(() => {
      expect(screen.getByTestId("chat-schema-agent-header")).toBeInTheDocument();
    });
  });
});
