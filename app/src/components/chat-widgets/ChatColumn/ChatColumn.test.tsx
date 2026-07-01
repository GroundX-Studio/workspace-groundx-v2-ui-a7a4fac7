import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";

// jsdom has no matchMedia, so framer-motion's useReducedMotion() returns
// true there and short-circuits the streaming timer. Pin it to false so
// the timing tests actually exercise the stream.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

import { ChatApiError } from "@/api/chatErrors";

// WF-17: the onboarding pick-view pills read the live workflow schema via
// this hook. Mock it so tests are deterministic. Default null → the
// experience's `derivePickViews` falls back to the manifest.
vi.mock("@/hooks/useLiveExtractionSchema", () => ({
  useLiveExtractionSchema: vi.fn(() => null),
}));
import { useLiveExtractionSchema } from "@/hooks/useLiveExtractionSchema";

import type { WidgetRole } from "@groundx/shared";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useActiveStepDiagnostic, useResumeAnchorDiagnostic } from "@/test/activeStepDiagnostic";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ChatColumn } from "./ChatColumn";

/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the steady chat is the bare
 * conversation, selected by mounting ChatColumn on a NON-onboarding chat
 * session (`newSession` defaults `isOnboardingSession:false`, like SteadyShell's
 * SessionSwitcher). The onboarding harness seeds an onboarding-flagged session,
 * so steady tests flip to a fresh steady session first. There is NO `surface`
 * prop — ChatColumn reads the active session's `isOnboardingSession` flag (the
 * source of truth) to decide bare-chat vs onboarding experience.
 */
function SteadySessionMount(props: Parameters<typeof ChatColumn>[0]) {
  const { newSession } = useChatStore();
  useEffect(() => {
    newSession({ title: "Untitled" });
  }, [newSession]);
  return <ChatColumn {...props} />;
}

const sendChatMessage = vi.fn();
const listChatMessages = vi.fn();

type RenderOptions = Parameters<typeof renderWithOnboardingProviders>[1];

const renderWithChatColumnApi = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithOnboardingProviders(ui, {
    ...options,
    api: {
      ...options.api,
      chat: {
        ...options.api?.chat,
        sendChatMessage,
        listChatMessages,
      },
    },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendChatMessage.mockReset();
  listChatMessages.mockReset();
  // Default: no persisted thread (empty array). Individual tests
  // can override to assert RT-01 hydration behavior.
  listChatMessages.mockResolvedValue([]);
  // WF-17 — default to manifest fallback; the precedence test overrides.
  vi.mocked(useLiveExtractionSchema).mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatColumn", () => {
  // Replay-bug fix (2026-05-25) gates the thinking-stream behind
  // a sessionStorage key per scenario. Each test starts with a
  // clean slate so the stream always plays.
  beforeEach(() => {
    if (typeof window !== "undefined") window.sessionStorage.clear();
  });

  // Canvas↔chat coherence (2026-06-11). When the scripted Understand intro
  // is about to ANIMATE (fresh sessionStorage, empty thread), the canvas must
  // be on Understand — replaying the scan narration over a resumed later
  // frame (Interact/Integrate) is incoherent. With real turns in the thread,
  // a returning user is NOT yanked back.
  describe("scripted-intro replay snaps the canvas to Understand", () => {
    // standardized-viewer-control (D2) — renders the FRAME-FREE active viewer
    // step diagnostic (was the retired `currentFrame`); empty when no step.
    function StepProbe() {
      const step = useActiveStepDiagnostic();
      return <div data-testid="step-probe">{step ?? ""}</div>;
    }

    it("resuming a later step with an empty thread snaps back to the doc-viewer when the intro will play", async () => {
      renderWithChatColumnApi(
        <>
          <ChatColumn role="anonymous" scope={{ type: "none" }} />
          <StepProbe />
        </>,
        { initialFrame: "f5", initialScenario: "utility" },
      );
      await waitFor(() => expect(screen.getByTestId("step-probe")).toHaveTextContent("doc-viewer"));
    });

    it("does NOT snap when the intro is a replay-restore (doneness persisted)", async () => {
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(
        <>
          <ChatColumn role="anonymous" scope={{ type: "none" }} />
          <StepProbe />
        </>,
        { initialFrame: "f5", initialScenario: "utility" },
      );
      // The intro restores instantly (no animation) — the resumed step stands.
      await screen.findByTestId("onboarding-chat-bot-lead");
      expect(screen.getByTestId("step-probe")).toHaveTextContent("interact-chat");
    });

    it("does NOT snap when the thread has real turns (returning user keeps their step)", async () => {
      listChatMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "what is the total?", citations: [] },
        { id: "m2", role: "assistant", content: "$7,613.20.", citations: [] },
      ]);
      renderWithChatColumnApi(
        <>
          <ChatColumn role="anonymous" scope={{ type: "none" }} />
          <StepProbe />
        </>,
        { initialFrame: "f5", initialScenario: "utility" },
      );
      await screen.findByTestId("onboarding-chat-bot-lead");
      // Give the (wrong) snap a beat to fire if it were going to.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(screen.getByTestId("step-probe")).toHaveTextContent("interact-chat");
    });
  });

  // DBG-01 B (2026-05-28). The chat scroll container must reserve a
  // scrollbar gutter so the bar doesn't paint over the message bubbles.
  it("DBG-01 B: onboarding chat scroll container reserves a scrollbar gutter", () => {
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    const scroll = screen.getByTestId("chat-live-scroll");
    expect(scroll.style.scrollbarGutter).toBe("stable");
  });

  it("DBG-01 B: steady chat scroll container reserves a scrollbar gutter", async () => {
    renderWithChatColumnApi(<SteadySessionMount role="member" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    const scroll = await screen.findByTestId("chat-live-scroll");
    expect(scroll.style.scrollbarGutter).toBe("stable");
  });

  // 2026-05-30-widget-role-access Phase 2b — ChatColumn migrates from the
  // binary `mode: "onboarding" | "steady"` to the role+scope contract.
  // Matrix row (docs/agents/widget-access-matrix.md §1 + §1b):
  //   · availability: ✅ anonymous · ✅ member (all roles)
  //   · affordance locks: NONE today
  //   · scope: `{ type: "none" }` — chat is session-scoped, not document-scoped
  describe("role + scope contract (widget-access-matrix)", () => {
    const roles: WidgetRole[] = ["anonymous", "member"];

    for (const role of roles) {
      it(`mounts under role="${role}" with the all-roles onboarding surface`, () => {
        renderWithChatColumnApi(
          <ChatColumn role={role} scope={{ type: "none" }} />,
          { initialFrame: "f2", initialScenario: "utility" },
        );
        // All-roles: the onboarding conversation chrome renders for both
        // anonymous and member — no affordance is locked by role.
        expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
        expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
      });

      it(`mounts under role="${role}" with the steady (bare) chat`, async () => {
        renderWithChatColumnApi(
          <SteadySessionMount role={role} scope={{ type: "none" }} />,
          { initialFrame: "f2", initialScenario: "utility" },
        );
        // Steady chat available to both roles; same send affordance, no
        // onboarding chrome.
        expect(await screen.findByTestId("conversation-flow")).toBeInTheDocument();
        expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
        expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
      });
    }

    it("accepts the required scope: { type: 'none' } without changing behavior", () => {
      // Scope is session-scoped sentinel; it does not gate any rendering.
      renderWithChatColumnApi(
        <ChatColumn role="anonymous" scope={{ type: "none" }} />,
        { initialFrame: "f1", initialScenario: null },
      );
      expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    });
  });

  it("on F1 (no scenario picked), shows the idle placeholder", () => {
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f1", initialScenario: null });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
  });

  // REGRESSION (2026-06-12): the report BUILDER frame (f4a) was missing from
  // the `isInScenarioJourney` frame whitelist, so the chat fell through to the
  // static IdleChatPlaceholder on the builder — a viewer surface silently
  // disabling the production chat. f4a is part of the Analyze journey (like f4,
  // the render) and MUST keep the working conversation. Guards backsliding the
  // brittle frame-enumeration.
  it("on F4a (report builder), keeps the working conversation chat (not the idle placeholder)", () => {
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f4a", initialScenario: "utility" });
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
    expect(screen.queryByText(/Ask anything about the sample/i)).not.toBeInTheDocument();
  });

  // Sibling pin: the report RENDER frame (f4) already kept the chat; this pins
  // that BOTH report surfaces (render f4 + builder f4a) keep it, so a future
  // edit can't drop one.
  it("on F4 (report render), keeps the working conversation chat", () => {
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f4", initialScenario: "utility" });
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
  });

  // standardized-viewer-control T6 — the conversation-journey predicate reads
  // the ACTIVE VIEWER STEP (its journey stage). This discriminates the migration:
  // a raw `pushStep` moves the active step WITHOUT touching the resume anchor.
  // Pushing an `ingest-picker` step over a seeded journey step must drop the
  // conversation chrome to the idle placeholder (ingest is NOT in the journey
  // whitelist) — a resume-anchor-only read would still see the seeded
  // doc-viewer step and wrongly keep the chrome.
  it("follows the active viewer step (not the resume anchor) for the conversation-journey predicate", async () => {
    function StepPusher() {
      const { pushStep } = useChatStore();
      return (
        <button data-testid="push-ingest-step" onClick={() => pushStep({ kind: "ingest-picker" })}>
          push
        </button>
      );
    }
    renderWithChatColumnApi(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <StepPusher />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    // Seeded on the Understand step → onboarding conversation chrome shows.
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    // Move the ACTIVE STEP to ingest-picker (resume anchor unchanged).
    act(() => {
      screen.getByTestId("push-ingest-step").click();
    });
    // The predicate follows the step (ingest, not in the journey) → idle.
    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
  });

  it("on F2 with a scenario, renders the wireframe conversation chrome", () => {
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    // Wireframe markers: a header that shows the FILE NAME, the scenario
    // name as the first user bubble, a sample-switcher subline.
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    const header = screen.getByTestId("onboarding-chat-header");
    expect(header.textContent ?? "").not.toMatch(/^Conversation/i);
    expect(header.textContent ?? "").toMatch(/\.pdf|utility/i);
    expect(screen.getByTestId("onboarding-chat-sample-switch")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-user-bubble")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-bot-lead")).toHaveTextContent(/Reading/i);
  });

  it("the chat header is a button that navigates to /onboarding", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const { useLocation } = await import("react-router-dom");
    let pathname = "";
    const PathProbe = () => {
      pathname = useLocation().pathname;
      return null;
    };
    renderWithChatColumnApi(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <PathProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    const home = screen.getByTestId("onboarding-chat-home");
    expect(home).toBeInTheDocument();
    await user.click(home);
    expect(pathname).toBe("/onboarding");
  });

  it("streams thinking notes into the chat one at a time, then surfaces Done + Pick-a-view", () => {
    vi.useFakeTimers();
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });

    // First note is visible immediately.
    expect(screen.getAllByTestId(/thinking-note-/).length).toBe(1);
    // Done + Pick-a-view do NOT show before the stream finishes.
    expect(screen.queryByTestId("onboarding-chat-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();

    // Walk forward in 3000ms ticks so each setState → effect → next
    // setTimeout chain commits between fires.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    // Then the DONE_REVEAL_DELAY_MS pause + a margin.
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const notes = screen.getAllByTestId(/thinking-note-/);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("onboarding-chat-done")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-pick-a-view")).toBeInTheDocument();
  });

  it("Pick-a-view pills advance to the Extract step on click", () => {
    vi.useFakeTimers();
    let lastStep: string | null = null;
    function StepProbe() {
      lastStep = useActiveStepDiagnostic();
      return null;
    }
    renderWithChatColumnApi(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <StepProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }

    const pill = screen.getByTestId("onboarding-chat-pick-view-meters");
    act(() => {
      pill.click();
    });
    expect(lastStep).toBe("extract-workbench");
  });

  it("derives Pick-a-view pills from the active scenario's extraction schema (Loan != Utility)", () => {
    vi.useFakeTimers();
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "loan" });
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    // Loan schema categories are `applicant` and `risk` per the fixture.
    expect(screen.getByTestId("onboarding-chat-pick-view-applicant")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-view-meters")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-view-statement")).not.toBeInTheDocument();
    // Per realign-f3a-entry-point: F2's Pick-a-view bubble SHALL NOT
    // contain the Edit-schema pill.
    expect(screen.queryByTestId("onboarding-chat-pick-view-edit-schema")).not.toBeInTheDocument();
  });

  it("WF-17: pick-view pills derive from the LIVE workflow schema, overriding the manifest", () => {
    vi.useFakeTimers();
    vi.mocked(useLiveExtractionSchema).mockReturnValue({
      id: "wf-1",
      name: "Utility Bill",
      categories: [
        { id: "statement", type: "statement", name: "Statement", fields: [] },
        { id: "meters", type: "meters", name: "Meters", fields: [] },
        { id: "charges", type: "charges", name: "Charges", fields: [] },
      ],
    });
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    expect(screen.getByTestId("onboarding-chat-pick-view-charges")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-pick-view-statement")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-pick-view-meters")).toBeInTheDocument();
  });

  it("on a schemaless scenario (Solar), surfaces a single 'show me chat' pill that jumps to Interact", () => {
    vi.useFakeTimers();
    let lastStep: string | null = null;
    function StepProbe() {
      lastStep = useActiveStepDiagnostic();
      return null;
    }
    renderWithChatColumnApi(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <StepProbe />
      </>,
      { initialFrame: "f2", initialScenario: "solar" },
    );
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    const pill = screen.getByTestId("onboarding-chat-pick-view-interact");
    act(() => {
      pill.click();
    });
    expect(lastStep).toBe("interact-chat");
  });

  it("the sample switcher chip exposes the other scenarios as a menu", () => {
    renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    const trigger = screen.getByTestId("onboarding-chat-sample-switch-trigger");
    act(() => {
      trigger.click();
    });
    expect(screen.getByTestId("onboarding-chat-sample-switch-item-loan")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-sample-switch-item-solar")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-sample-switch-item-utility")).not.toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────
  // schema-agent-chat-affordances: schema-DESIGN-surface chrome — the
  // Schema-Agent header + earlier-turns summary above the conversation.
  //
  // standardized-viewer-control T6 — the header is now driven by the ACTIVE
  // VIEWER STEP `surface === "design"` (the dispatched `editSchema` step). So it
  // tracks the design surface in BOTH onboarding and steady. The design surface
  // is reached by DISPATCHING `editSchema` (the production path), mirroring
  // SchemaView's `openDesign` — a freshly seeded extract-workbench step opens on
  // the FIELDS surface (no design surface) until `editSchema` is dispatched.
  // ────────────────────────────────────────────────────────────────────
  describe("schema-agent-chat-affordances", () => {
    const DesignOpener = ({ schemaId }: { schemaId: string }) => {
      const orchestrator = useCanvasOrchestrator();
      return (
        <button
          data-testid="open-design"
          onClick={() => orchestrator.dispatch({ kind: "editSchema", schemaId }, "user")}
        >
          open design
        </button>
      );
    };

    it("renders the Schema Agent header + sample switcher chip on the design surface", async () => {
      const user = userEvent.setup();
      renderWithChatColumnApi(
        <>
          <ChatColumn role="anonymous" scope={{ type: "none" }} />
          <DesignOpener schemaId="utility" />
        </>,
        { initialFrame: "f3", initialScenario: "utility" },
      );
      // Fields surface (default) → no schema-agent header yet.
      expect(screen.queryByTestId("chat-schema-agent-header")).not.toBeInTheDocument();

      // Dispatch editSchema → the active extract-workbench step flips to
      // surface:"design"; the header appears.
      await user.click(screen.getByTestId("open-design"));

      const header = await screen.findByTestId("chat-schema-agent-header");
      expect(header).toHaveTextContent(/Schema Agent/);
      const chip = screen.getByTestId("chat-schema-agent-sample-switcher");
      expect(chip).toHaveTextContent(/sample:/);
      expect(chip).toHaveTextContent(/Utility Bill/);
      expect(chip).toHaveTextContent(/switch ▾/);
    });

    it("omits the Schema-Agent header on the FIELDS workbench (surface-conditional)", () => {
      // Seeded on f3 = extract-workbench FIELDS surface (no design flip).
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f3",
        initialScenario: "utility",
      });
      expect(screen.queryByTestId("chat-schema-agent-header")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-schema-agent-sample-switcher")).not.toBeInTheDocument();
    });

    it("omits the Schema-Agent header on Understand (surface-conditional)", () => {
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      expect(screen.queryByTestId("chat-schema-agent-header")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-schema-agent-sample-switcher")).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // CF-18: chat input wire-up. Real form that posts via sendChatMessage
  // and renders the assistant turn in the conversation body.
  // ────────────────────────────────────────────────────────────────────
  describe("chat input (CF-18)", () => {
    it("renders a real input + send button (not the visual stub copy)", () => {
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
      expect(screen.queryByText(/ready when you are/i)).not.toBeInTheDocument();
    });

    it("submitting a question posts via sendChatMessage and renders the assistant reply", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-1",
        assistantMessageId: "a-1",
        reply: {
          mode: "rag",
          answer: "The bill total is $214.07.",
          citations: [],
          suggestedActions: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      // Post-scan, chat-enabled state: the Understand scan beat locks the
      // composer, so drive the live composer from the chat-enabled Interact step.
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "What is the bill total?");
      await user.click(screen.getByTestId("chat-live-send"));

      expect(screen.getByTestId("chat-live-user")).toHaveTextContent("What is the bill total?");

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          "The bill total is $214.07.",
        );
      });

      expect(sendChatMessage).toHaveBeenCalledTimes(1);
      expect(sendChatMessage.mock.calls[0][0]).toMatchObject({
        newUserMessage: "What is the bill total?",
      });
    });

    it("on a network failure, renders the 'couldn't reach' copy", async () => {
      sendChatMessage.mockRejectedValueOnce(new Error("Failed to fetch"));

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "anything");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          /couldn't reach the chat service/i,
        );
      });
      expect(screen.queryByTestId("pin-to-report-action")).not.toBeInTheDocument();
    });

    // CF-08 — per-status copy in the catch site.
    it("504 → renders 'took too long' copy (CF-08)", async () => {
      sendChatMessage.mockRejectedValueOnce(new ChatApiError("timeout", 504, null));
      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(/took too long/i);
      });
    });

    it("401 → renders 'sign in to continue' copy (CF-08)", async () => {
      sendChatMessage.mockRejectedValueOnce(new ChatApiError("unauth", 401, null));
      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(/sign in/i);
      });
    });

    it("501 → renders 'can't answer that yet' copy (CF-08)", async () => {
      sendChatMessage.mockRejectedValueOnce(new ChatApiError("nyi", 501, null));
      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(/can't answer that yet/i);
      });
    });

    it("empty / whitespace input does not post", async () => {
      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "   ");
      await user.click(screen.getByTestId("chat-live-send"));
      expect(sendChatMessage).not.toHaveBeenCalled();
      expect(screen.queryByTestId("chat-live-user")).not.toBeInTheDocument();
    });
  });

  // RT-01 (round-trip contract). The chat handler persists every turn to
  // chat_messages; on-mount hydration replays them so a refresh survives.
  describe("RT-01 hydrate liveTurns from server on mount", () => {
    it("renders persisted turns on first mount (refresh survival)", async () => {
      listChatMessages.mockResolvedValueOnce([
        {
          id: "m1",
          chatSessionId: "rt-mount",
          turnIndex: 1,
          role: "user",
          content: "what is the bill total?",
          errorCode: null,
          citations: [],
        },
        {
          id: "m2",
          chatSessionId: "rt-mount",
          turnIndex: 2,
          role: "assistant",
          content: "The bill total is $7,613.20.",
          errorCode: null,
          citations: [],
        },
      ]);

      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-user")).toHaveTextContent("what is the bill total?");
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          "The bill total is $7,613.20.",
        );
      });
    });

    it("P3.c: assistant bubble renders markdown (bold/code), not literal `**`/backticks", async () => {
      listChatMessages.mockResolvedValueOnce([
        { id: "u1", chatSessionId: "md", turnIndex: 1, role: "user", content: "total?", errorCode: null, citations: [] },
        {
          id: "a1",
          chatSessionId: "md",
          turnIndex: 2,
          role: "assistant",
          content: "The total is **$7,613.20** in field `amount_due`.",
          errorCode: null,
          citations: [],
        },
      ]);

      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });

      const bubble = await screen.findByTestId("chat-live-assistant");
      expect(bubble.querySelector("strong")?.textContent).toBe("$7,613.20");
      expect(bubble.querySelector("code")?.textContent).toBe("amount_due");
      expect(bubble.textContent ?? "").not.toContain("**");
    });

    it("filters out system-role rows (UI only renders user + assistant)", async () => {
      listChatMessages.mockResolvedValueOnce([
        { id: "s1", chatSessionId: "rt-sys", turnIndex: 0, role: "system", content: "system bootstrap", errorCode: null, citations: [] },
        { id: "u1", chatSessionId: "rt-sys", turnIndex: 1, role: "user", content: "hi there", errorCode: null, citations: [] },
      ]);

      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-user")).toHaveTextContent("hi there");
      });
      expect(screen.queryByText(/system bootstrap/i)).not.toBeInTheDocument();
    });

    it("empty persisted thread leaves the UI in its pre-RT-01 state (no live bubbles)", async () => {
      listChatMessages.mockResolvedValueOnce([]);

      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByTestId("chat-live-user")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-live-assistant")).not.toBeInTheDocument();
    });

    it("hydration failure is non-fatal — the UI still mounts + accepts new sends", async () => {
      listChatMessages.mockRejectedValueOnce(
        new ChatApiError("/api/chat-sessions/rt-fail/messages failed: 500", 500, null),
      );

      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
      expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
    });

    it("does NOT clobber optimistic state — if the user types while hydrate is in flight, the optimistic turn wins", async () => {
      let resolveHydrate: (msgs: never[]) => void = () => {};
      listChatMessages.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveHydrate = resolve as (msgs: never[]) => void;
        }) as ReturnType<typeof listChatMessages>,
      );
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-new",
        assistantMessageId: "a-new",
        reply: {
          mode: "rag",
          answer: "fresh reply from server",
          citations: [],
          suggestedActions: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "live typed message");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          "fresh reply from server",
        );
      });

      await act(async () => {
        resolveHydrate([]);
        await Promise.resolve();
      });

      expect(screen.getByTestId("chat-live-user")).toHaveTextContent("live typed message");
      expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("fresh reply from server");
    });
  });

  // clickable-citations Phase 2 — assistant replies render [n] chips.
  describe("citation chips render on assistant bubbles (clickable-citations Phase 2)", () => {
    it("onboarding chat: assistant reply carrying citations renders [1] [2] chips with documentId + page data attrs", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-cite-1",
        assistantMessageId: "a-cite-1",
        reply: {
          mode: "rag",
          answer: "The total is $214.07.",
          citations: [
            { documentId: "doc-A", page: 7, snippet: "the total is $214.07" },
            { documentId: "doc-A", page: 12, snippet: "due date March 15" },
          ],
          suggestedActions: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "what is the total?");
      await user.click(screen.getByTestId("chat-live-send"));

      // inline-footnote-citations — a multi-citation reply collapses to an
      // "N sources" SourceList; expand it to reach the per-source chips.
      const toggle = await screen.findByRole("button", { name: /2 sources/i });
      await user.click(toggle);
      await waitFor(() => {
        expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
        expect(screen.getByTestId("cite-chip-2")).toBeInTheDocument();
      });
      const c1 = screen.getByTestId("cite-chip-1");
      const c2 = screen.getByTestId("cite-chip-2");
      expect(c1).toHaveAttribute("data-citation-doc", "doc-A");
      expect(c1).toHaveAttribute("data-citation-page", "7");
      expect(c2).toHaveAttribute("data-citation-doc", "doc-A");
      expect(c2).toHaveAttribute("data-citation-page", "12");
    });

    it("steady chat: assistant reply carrying citations renders [1] chip beneath the bubble", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-cite-s",
        assistantMessageId: "a-cite-s",
        reply: {
          mode: "rag",
          answer: "Tax is $42.",
          citations: [{ documentId: "doc-B", page: 3, snippet: "tax 42" }],
          suggestedActions: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithChatColumnApi(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "tax?");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
      });
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "doc-B");
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-page", "3");
    });

    it("RT-01 rehydrate: citations on persisted assistant turns survive a remount", async () => {
      listChatMessages.mockResolvedValueOnce([
        {
          id: "m1",
          chatSessionId: "rt-cite",
          turnIndex: 1,
          role: "user",
          content: "total?",
          errorCode: null,
          citations: [],
        },
        {
          id: "m2",
          chatSessionId: "rt-cite",
          turnIndex: 2,
          role: "assistant",
          content: "The total is $214.07.",
          errorCode: null,
          citations: [{ documentId: "doc-A", page: 7, snippet: "the total" }],
        },
      ]);

      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      await waitFor(() => {
        expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
      });
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "doc-A");
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-page", "7");
    });
  });

  it("keeps ConversationFlow mounted for sign-in instead of dispatching to GateChatPanel", async () => {
    function GateOpener() {
      const { openGate } = useOnboardingSession();
      return (
        <button data-testid="open-gate-byo" onClick={() => openGate("byo")}>
          open
        </button>
      );
    }
    renderWithChatColumnApi(
      <>
        <GateOpener />
        <ChatColumn role="anonymous" scope={{ type: "none" }} signInActive />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );
    act(() => {
      screen.getByTestId("open-gate-byo").click();
    });
    expect(await screen.findByTestId("conversation-flow")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-rail-preamble")).not.toBeInTheDocument();
  });

  // The steady chat (non-onboarding session) is the bare ConversationFlow:
  // no scripted decorations; RT-01 hydration + send path stay shared.
  describe("steady (bare) chat", () => {
    it("renders the bare conversation — no scripted decorations", async () => {
      renderWithChatColumnApi(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      expect(await screen.findByTestId("conversation-flow")).toBeInTheDocument();

      // No onboarding-only decorations.
      expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-sample-switch")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();
      expect(screen.queryByText(/Reading/i)).not.toBeInTheDocument();
    });

    it("send path posts a message and renders the reply (isOnboarding=false from the session)", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-steady",
        assistantMessageId: "a-steady",
        reply: {
          mode: "rag",
          answer: "Steady reply.",
          citations: [],
          suggestedActions: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithChatColumnApi(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "hello");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-user")).toHaveTextContent("hello");
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("Steady reply.");
      });
      // The active session is a steady (non-onboarding) one → isOnboarding=false.
      const sendCall = sendChatMessage.mock.calls[0][0];
      expect(sendCall.sessionMeta.isOnboarding).toBe(false);
    });
  });

  // 2026-05-30-unified-conversation-flow Phase 3 — REGRESSION GUARD for the
  // deleted mount-persistence hack.
  //
  // The old ChatColumn forked SteadyConversationFlow / F2ConversationFlow and
  // needed a "keep the flow mounted across F2→F5" routing hack (former
  // ChatColumnInner :172) so an auto-advance wouldn't unmount the flow and wipe
  // its local `liveTurns`. Phase 2 collapsed both forks into the SINGLE
  // always-mounted <ConversationFlow>, so persistence is now STRUCTURAL: across
  // the onboarding journey ChatColumn returns the same <ConversationFlow> at the
  // same position, React reconciles it, and `useConversation`'s `liveTurns`
  // state survives.
  //
  // This test would FAIL against a remount-on-frame-change implementation
  // (e.g. keying ConversationFlow by frame, or branching it onto a different
  // mount site per frame): the optimistic user turn is held in the engine's
  // local `liveTurns` state ONLY — `sendChatMessage` is called once and
  // `listChatMessages` returns [], so a remount would re-mount an empty thread
  // and the seeded turn would vanish. We seed the turn at the chat-enabled
  // Extract step (f3), let the first send auto-advance the journey f3→f5
  // (the Understand scan beat locks the composer, so we cannot send there),
  // and assert the SAME turn content is still present after the advance
  // (no remount/wipe).
  it("Phase 3: liveTurns persist across an onboarding frame advance f3→f5 (no remount/wipe)", async () => {
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-persist",
      assistantMessageId: "a-persist",
      reply: {
        mode: "rag",
        answer: "Totals reconciled.",
        citations: [],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    // Observe the live active step so the test can confirm the journey actually
    // advanced (the property is meaningless if the step never changed).
    const stepsSeen: string[] = [];
    let lastStep: string | null = null;
    function StepProbe() {
      const step = useActiveStepDiagnostic();
      lastStep = step;
      if (step && stepsSeen[stepsSeen.length - 1] !== step) {
        stepsSeen.push(step);
      }
      return null;
    }

    const user = userEvent.setup();
    // Seed at the chat-enabled Extract step (the Understand scan beat at f2
    // locks the composer); set the intro done-flag so the experience does not
    // re-snap to the scanning Understand step on an empty-thread mount.
    window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
    renderWithChatColumnApi(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <StepProbe />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    // The journey starts on the Extract workbench step.
    expect(lastStep).toBe("extract-workbench");

    // Seed a real round-trip turn at f3.
    const input = screen.getByTestId("chat-live-input").querySelector("input")!;
    await user.type(input, "Reconcile the totals.");
    await user.click(screen.getByTestId("chat-live-send"));
    expect(screen.getByTestId("chat-live-user")).toHaveTextContent("Reconcile the totals.");
    await waitFor(() => {
      expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("Totals reconciled.");
    });
    // The first send also fires the onboarding Choreography's onFirstUserSend,
    // dispatching showInteract, so the journey auto-advances extract-workbench →
    // interact-chat: a genuine onboarding journey advance happens as a
    // side-effect of the seeded turn.
    await waitFor(() => {
      expect(lastStep).toBe("interact-chat");
    });
    // The step REALLY changed (guards against a vacuous pass if the journey
    // never moved): we observed both extract-workbench and interact-chat.
    expect(stepsSeen).toContain("extract-workbench");
    expect(stepsSeen).toContain("interact-chat");

    // After that frame advance, the conversation must NOT have remounted: the
    // optimistic turn — held ONLY in the engine's local liveTurns — survives,
    // and the server was hit exactly once. Against a remount-on-frame-change
    // implementation (the deleted :172 forked-flow hack existed precisely
    // because the fork could unmount on advance), liveTurns would be wiped and
    // re-hydrated from the empty `listChatMessages` mock → both bubbles gone.
    expect(screen.getByTestId("chat-live-user")).toHaveTextContent("Reconcile the totals.");
    expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("Totals reconciled.");
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
  });

  // 2026-05-31-stable-experience-identity — REGRESSION GUARD for the inline
  // experience-construction bug.
  //
  // ChatColumn used to construct the onboarding ChatExperience INLINE on every
  // render: `chatExperienceRegistry.byId("onboarding")?.create({...})`.
  // `makeOnboardingExperience` returns a NEW `Choreography` FC on every call, so
  // every ChatColumn re-render handed <ConversationFlow> an `experience` object
  // with a NEW component IDENTITY → React unmounted + remounted the
  // Choreography, resetting its internal `firstSendFiredRef`.
  //
  // Consequence: after the first user send auto-advances Understand→Interact, any
  // later re-render that lands while still in the scenario journey re-mounted the
  // Choreography and re-fired the first-send showInteract — so the journey was
  // un-holdable against the choreography. Drive an explicit advance back to
  // Extract and the spurious re-fire bounces it straight back to Interact.
  //
  // This test seeds a first send (auto Understand→Interact), then drives an
  // explicit Extract reach and asserts the resume anchor STAYS extract-workbench
  // (the choreography must not bounce it back to Interact). Against the
  // inline-construction implementation the remounted Choreography re-fires and the
  // resume anchor flips back to interact-chat → FAIL.
  it("stable-experience-identity: an explicit Extract reach STAYS at Extract (choreography does not re-fire to Interact)", async () => {
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-id",
      assistantMessageId: "a-id",
      reply: {
        mode: "rag",
        answer: "Done.",
        citations: [],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    let resumeAnchor: string | null = null;
    let driveAdvance: () => void = () => {};
    function StepProbe() {
      const { state, markStageReached } = useOnboardingSession();
      resumeAnchor = useResumeAnchorDiagnostic();
      // standardized-viewer-control — drive the Extract reach via the frame-free
      // `markStageReached` (it moves the resume anchor to the extract-workbench
      // step without pushing a new active viewer step).
      driveAdvance = () => markStageReached({ kind: "extract-workbench", scenarioId: state.scenario ?? "utility" });
      return null;
    }

    const user = userEvent.setup();
    // Start at the chat-enabled Extract step (the Understand scan beat at f2
    // locks the composer); set the intro done-flag so the experience does not
    // re-snap to the scanning Understand step on an empty-thread mount.
    window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
    renderWithChatColumnApi(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <StepProbe />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    expect(resumeAnchor).toBe("extract-workbench");

    // First real send → onboarding Choreography auto-advances → Interact.
    const input = screen.getByTestId("chat-live-input").querySelector("input")!;
    await user.type(input, "Reconcile the totals.");
    await user.click(screen.getByTestId("chat-live-send"));
    await waitFor(() => {
      expect(resumeAnchor).toBe("interact-chat");
    });

    // Now drive an explicit Extract reach (still inside the scenario journey, so
    // ChatColumn keeps mounting the onboarding experience). The choreography's
    // first-send side-effect already fired once and must NOT fire again — the
    // resume anchor must HOLD at extract-workbench.
    act(() => {
      driveAdvance();
    });

    // Give any spurious remount-driven effect a chance to fire, then assert the
    // resume anchor did NOT bounce back to interact-chat.
    await act(async () => {
      await Promise.resolve();
    });
    expect(resumeAnchor).toBe("extract-workbench");
  });

  // widget-llm-integration Phase 1 — render `suggestedActions[]` as a chip
  // row beneath each assistant bubble, and dispatch chip clicks.
  describe("SuggestedActionChips integration (widget-llm-integration Phase 1)", () => {
    it("onboarding: assistant reply carrying suggestedActions renders one chip per action under the bubble", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-sa-1",
        assistantMessageId: "a-sa-1",
        reply: {
          mode: "rag",
          answer: "Sure — here's what I found.",
          citations: [],
          suggestedActions: [
            { key: "show-source", label: "Show source" },
            { key: "open-samples", label: "Open samples" },
          ],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "find anything?");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
        expect(screen.getByTestId("suggested-action-chip-open-samples")).toBeInTheDocument();
      });
      expect(screen.getByTestId("suggested-action-chip-show-source")).toHaveTextContent(/Show source/i);
    });

    it("steady: assistant reply carrying suggestedActions renders chips under the bubble", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-sa-s",
        assistantMessageId: "a-sa-s",
        reply: {
          mode: "rag",
          answer: "Steady reply with suggestions.",
          citations: [],
          suggestedActions: [{ key: "show-source", label: "Show source" }],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithChatColumnApi(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "anything?");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
      });
    });

    it("Phase 8 — clicking a tool:<name> chip dispatches detail.intent via the orchestrator", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-t8",
        assistantMessageId: "a-t8",
        reply: {
          mode: "rag",
          answer: "Mutate-tool chip arrived.",
          citations: [],
          suggestedActions: [
            { key: "show-source", label: "Show source" },
            {
              key: "tool:accept_proposal",
              label: "Accept the proposed field",
              detail: {
                name: "accept_proposal",
                arguments: { fieldId: "f-1" },
                // standardized-viewer-control T7 — the chip carries the
                // server-validated CanvasIntent on detail.intent; this test
                // exercises the generic tool:<name> dispatch mechanism with a
                // surviving navigation kind (switchFrame was retired this phase).
                intent: { kind: "showInteract", scope: { type: "documents", documentIds: ["d1"] } },
              },
            },
          ],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const dispatched: Array<Record<string, unknown>> = [];
      const Harness = () => {
        const { registerAdapter } = useCanvasOrchestrator();
        useEffect(() => {
          return registerAdapter({
            kind: "showInteract",
            apply: (intent) => {
              dispatched.push(intent);
            },
          });
        }, [registerAdapter]);
        return <ChatColumn role="anonymous" scope={{ type: "none" }} />;
      };

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<Harness />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "accept that field");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-tool:accept_proposal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("suggested-action-chip-tool:accept_proposal"));

      await waitFor(() => {
        expect(dispatched.length).toBeGreaterThan(0);
      });
      expect(dispatched[0]).toMatchObject({ kind: "showInteract" });
    });

    // standardized-viewer-control T7 — an OFFERED navigation chip (a navigation
    // tool call carrying `offerAs`) arrives as a `tool:<name>` entry with its
    // built CanvasIntent on detail.intent, and clicking it dispatches that
    // intent through the orchestrator. This is the successor to the retired
    // legacy `suggested-intent` string-label chip.
    it("clicking an offered tool: navigation chip dispatches its detail.intent via the orchestrator", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-si",
        assistantMessageId: "a-si",
        reply: {
          mode: "rag",
          answer: "Take a look at the extract.",
          citations: [],
          suggestedActions: [
            { key: "show-source", label: "Show source" },
            {
              key: "tool:show_extraction",
              label: "Open the extract to compare line items",
              detail: {
                name: "show_extraction",
                arguments: { scope: { type: "documents", documentIds: ["d1"] }, schema_id: "draft" },
                intent: {
                  kind: "showExtract",
                  scope: { type: "documents", documentIds: ["d1"] },
                  schemaId: "draft",
                },
              },
            },
          ],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const dispatched: Array<Record<string, unknown>> = [];
      const Harness = () => {
        const { registerAdapter } = useCanvasOrchestrator();
        useEffect(() => {
          return registerAdapter({
            kind: "showExtract",
            apply: (intent) => {
              dispatched.push(intent);
            },
          });
        }, [registerAdapter]);
        return <ChatColumn role="anonymous" scope={{ type: "none" }} />;
      };

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<Harness />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "explain the totals");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-tool:show_extraction")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("suggested-action-chip-tool:show_extraction"));

      await waitFor(() => {
        expect(dispatched.length).toBeGreaterThan(0);
      });
      expect(dispatched[0]).toMatchObject({ kind: "showExtract", schemaId: "draft" });
    });

    // Empty-bubble guard (2026-05-28). An empty answer with chips must
    // suppress the bot bubble but keep the chip.
    it("onboarding: empty answer with chips suppresses the bot bubble but keeps the chip", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-empty",
        assistantMessageId: "a-empty",
        reply: {
          mode: "rag",
          answer: "",
          citations: [],
          suggestedActions: [
            {
              key: "tool:book_call",
              label: "Open the Calendly booking surface",
              detail: { name: "book_call", arguments: {}, intent: { kind: "openBookCall" } },
            },
          ],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
      renderWithChatColumnApi(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f5",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "book me a call");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-tool:book_call")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("chat-live-assistant")).not.toBeInTheDocument();
    });

    it("steady: empty answer with chips suppresses the bot bubble but keeps the chip", async () => {
      sendChatMessage.mockResolvedValueOnce({
        userMessageId: "u-empty-s",
        assistantMessageId: "a-empty-s",
        reply: {
          mode: "rag",
          answer: "",
          citations: [],
          suggestedActions: [{ key: "show-source", label: "Show source" }],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithChatColumnApi(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "look at it");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("chat-live-assistant")).not.toBeInTheDocument();
    });
  });
});
