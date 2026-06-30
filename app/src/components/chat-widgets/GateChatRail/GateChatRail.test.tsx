/**
 * ARCH-05A (2026-05-26): GateChatRail was the chat-slot half of the
 * retired sign-up surface. The live route now uses `SignUpWidget` in the
 * viewer and keeps `ConversationFlow` mounted in chat.
 *
 * What this widget owns:
 *   - The eyebrow + preamble that explains WHY the gate appeared
 *     (varies by trigger: save / export / byo / threshold).
 *   - The "← keep exploring" dismiss link.
 *   - The "Book a call with an engineer" CTA (sets ?bookCall=1).
 *   - The committed-state success card + "Continue to Integrate" CTA.
 *
 * What it does NOT own:
 *   - The form fields, the password validation, the register call.
 *     Those live in `SignUpWidget` in the viewer slot.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

const dismissGate = vi.fn();
const commitGate = vi.fn();
let mockGate: { status: "open" | "committed" | "dismissed" | "idle"; trigger?: string; method?: string } = {
  status: "open",
  trigger: "byo",
};

vi.mock("@/contexts/OnboardingSessionContext", () => ({
  useOnboardingSession: () => ({
    state: { gate: mockGate },
    commitGate,
    dismissGate,
  }),
}));

// standardized-viewer-control T6 — the committed "Continue to Integrate" CTA
// now DISPATCHES `showIntegrate` through the orchestrator (the single
// viewer-mutation seam) instead of calling `advanceFrame("f7")`. The test
// captures the dispatched intent via a spy orchestrator.
const dispatch = vi.fn();
vi.mock("@/contexts/CanvasOrchestratorContext", () => ({
  useCanvasOrchestratorOptional: () => ({ dispatch }),
}));

// standardized-viewer-control T6 — the pre-Integrate gate (was
// `PRE_INTEGRATE_FRAMES.has(currentFrame)`) is now the step/stage-based
// `useIsPreIntegrateStage()`. Controlled per-test by `mockPreIntegrate`.
let mockPreIntegrate = true;
vi.mock("@/components/layout/StepStrip/useJourneyStage", () => ({
  useIsPreIntegrateStage: () => mockPreIntegrate,
}));

import { GateChatRail } from "./GateChatRail";

const NONE_SCOPE: WidgetScope = { type: "none" };

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
};

const renderWidget = (ui: ReactNode = <GateChatRail role="anonymous" scope={NONE_SCOPE} />, initialUrl = "/onboarding/signup") =>
  render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="*" element={<><div>{ui}</div><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );

describe("GateChatRail", () => {
  beforeEach(() => {
    dismissGate.mockReset();
    dispatch.mockReset();
    commitGate.mockReset();
    mockGate = { status: "open", trigger: "byo" };
    mockPreIntegrate = true;
  });

  // P1 — the gate's three doors live in the chat rail (wireframe Flow_Gate):
  // email "send magic link", SSO, and book-a-call.
  it("renders the magic-link email door and SSO door", () => {
    renderWidget();
    expect(screen.getByTestId("gate-rail-email")).toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-send-magic-link")).toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-sso")).toBeInTheDocument();
  });

  it("gives the magic-link email field a stable label and submit identity", () => {
    renderWidget();
    const email = screen.getByLabelText("Email for magic link");
    expect(email).toHaveAttribute("id", "gate-rail-email-input");
    expect(email).toHaveAttribute("name", "gateRailEmail");
  });

  it("SSO door commits the gate via the sso method", () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("gate-rail-sso"));
    expect(commitGate).toHaveBeenCalledWith("sso");
  });

  it("send-magic-link with an email commits via register (demo magic-link)", () => {
    renderWidget();
    const email = screen.getByTestId("gate-rail-email").querySelector("input")!;
    fireEvent.change(email, { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByTestId("gate-rail-send-magic-link"));
    expect(commitGate).toHaveBeenCalledWith("register");
  });

  it("send-magic-link with no email does NOT commit (guards empty input)", () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("gate-rail-send-magic-link"));
    expect(commitGate).not.toHaveBeenCalled();
  });

  it("renders the BYO preamble when triggered by BYO", () => {
    renderWidget();
    expect(screen.getByTestId("gate-rail-preamble")).toHaveTextContent(/bring your own/i);
  });

  it("renders the save preamble when triggered by save", () => {
    mockGate = { status: "open", trigger: "save" };
    renderWidget();
    expect(screen.getByTestId("gate-rail-preamble")).toHaveTextContent(/save your work/i);
  });

  it("renders the export preamble when triggered by export", () => {
    mockGate = { status: "open", trigger: "export" };
    renderWidget();
    expect(screen.getByTestId("gate-rail-preamble")).toHaveTextContent(/export/i);
  });

  it("renders the threshold preamble when triggered by threshold", () => {
    mockGate = { status: "open", trigger: "threshold" };
    renderWidget();
    expect(screen.getByTestId("gate-rail-preamble")).toHaveTextContent(/free-tier/i);
  });

  it("dismiss link calls dismissGate", () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("gate-rail-dismiss"));
    expect(dismissGate).toHaveBeenCalledTimes(1);
  });

  it("book-a-call CTA sets ?bookCall=1 in the URL", () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("gate-rail-book-call"));
    expect(screen.getByTestId("location")).toHaveTextContent("/onboarding/signup?bookCall=1");
  });

  it("renders the register-committed success card with Continue-to-Integrate CTA", () => {
    mockGate = { status: "committed", method: "register" };
    renderWidget();
    expect(screen.getByTestId("gate-rail-committed")).toHaveTextContent(/welcome/i);
    expect(screen.getByTestId("gate-rail-continue-integrate")).toBeInTheDocument();
  });

  it("Continue-to-Integrate dispatches showIntegrate through the orchestrator", () => {
    mockGate = { status: "committed", method: "register" };
    renderWidget();
    fireEvent.click(screen.getByTestId("gate-rail-continue-integrate"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [intent, source] = dispatch.mock.calls[0]!;
    expect(intent).toMatchObject({ kind: "showIntegrate" });
    expect(source).toBe("user");
  });

  it("still offers Continue-to-Integrate while the journey is pre-Integrate (gate committed from Extract)", () => {
    mockGate = { status: "committed", method: "register" };
    mockPreIntegrate = true;
    renderWidget();
    expect(screen.getByTestId("gate-rail-continue-integrate")).toBeInTheDocument();
  });

  it("renders the engineer-call-committed thanks card", () => {
    mockGate = { status: "committed", method: "engineer-call" };
    renderWidget();
    expect(screen.getByTestId("gate-rail-committed")).toHaveTextContent(/call requested/i);
  });

  it("returns null when gate is idle (not open and not committed)", () => {
    mockGate = { status: "idle" };
    const { container } = renderWidget();
    expect(container.querySelector('[data-widget="gate-chat-rail"]')).toBeNull();
  });

  it("returns null when gate is dismissed", () => {
    mockGate = { status: "dismissed" };
    const { container } = renderWidget();
    expect(container.querySelector('[data-widget="gate-chat-rail"]')).toBeNull();
  });

  // RE-SOURCE (standardized-viewer-control T6): the committed-state
  // "Continue to Integrate" nav CTA is onboarding-FLOW chrome, not a
  // role affordance. It is driven by the step/stage-based journey signal
  // (`useIsPreIntegrateStage()`), NOT a frame read or a widget prop. Once the
  // user is already ON the Integrate stage the CTA is redundant and hides.
  it("does not render the Continue-to-Integrate CTA once the journey is already on Integrate, even when committed", () => {
    mockGate = { status: "committed", method: "register" };
    mockPreIntegrate = false; // already on the Integrate stage / steady re-encounter
    renderWidget();
    expect(screen.queryByTestId("gate-rail-continue-integrate")).not.toBeInTheDocument();
  });

  // ── Role + scope contract (2026-05-30-widget-role-access) ─────────────
  // Matrix row: availability anonymous ✅ / member ❌ (enforced at the
  // MOUNT SITE, not inside the widget); scope `{ type: "none" }`; NO
  // affordance is locked by role today, so the rendered widget is identical
  // for both roles when mounted.
  describe("role + scope contract", () => {
    it.each<WidgetRole>(["anonymous", "member"])(
      "mounts under role=%s with a none scope and renders the open gate identically",
      (role) => {
        renderWidget(<GateChatRail role={role} scope={NONE_SCOPE} />);
        // No role-locked affordance: every door + CTA renders for both roles.
        expect(screen.getByTestId("gate-rail-preamble")).toBeInTheDocument();
        expect(screen.getByTestId("gate-rail-send-magic-link")).toBeInTheDocument();
        expect(screen.getByTestId("gate-rail-sso")).toBeInTheDocument();
        expect(screen.getByTestId("gate-rail-dismiss")).toBeInTheDocument();
      },
    );

    it.each<WidgetRole>(["anonymous", "member"])(
      "commit + dismiss affordances work under role=%s (no role lock)",
      (role) => {
        renderWidget(<GateChatRail role={role} scope={NONE_SCOPE} />);
        fireEvent.click(screen.getByTestId("gate-rail-sso"));
        expect(commitGate).toHaveBeenCalledWith("sso");
        fireEvent.click(screen.getByTestId("gate-rail-dismiss"));
        expect(dismissGate).toHaveBeenCalledTimes(1);
      },
    );
  });
});
