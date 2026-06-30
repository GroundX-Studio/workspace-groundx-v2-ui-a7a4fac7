/**
 * 2026-05-31-shared-canvas-affordance-restoration — the F5 Interact "Save" →
 * sign-in-gate path, restored as chat-driven, verified END-TO-END on the live
 * canvas.
 *
 * The retired `InteractView` rendered a "💾 Save 🔒" button that called
 * `openGate("save")`. The f5 canvas is now the shared `PdfViewer` via
 * `<ScopedCanvas>`, which must NOT grow an onboarding-only Save button
 * (`no-onboarding-duplicates`). The successor is the `save_to_account` chat
 * tool: it surfaces as a `tool:save_to_account` suggested-action chip whose
 * `detail.intent` is `{ kind: "openGate", trigger: "save" }`. Clicking it
 * dispatches through the canvas orchestrator, which routes `openGate` to
 * `OnboardingSession.openGate("save")` — opening the gate on the live canvas.
 *
 * This drives a real chat reply carrying the chip, clicks it, and asserts the
 * sign-in viewer overlay opens while the chat remains mounted — proving the
 * path is reachable on the live f5 surface with no per-frame view wiring.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { OnboardingShell } from "./OnboardingShell";

import type { SendChatMessageResult } from "@/api/chatSessions";

const ensureAnonSession = vi.fn();
const listChatMessages = vi.fn();
const sendChatMessage = vi.fn();

/** A reply that offers the "save to account" chip beneath the assistant turn. */
const SAVE_CHIP_REPLY: SendChatMessageResult = {
  userMessageId: "um-1",
  assistantMessageId: "am-1",
  compressionRan: false,
  reply: {
    mode: "rag",
    answer: "The April 2026 statement totals $18,742.16.",
    citations: [],
    // The chip carries the server-constructed CanvasIntent on `detail.intent`
    // (the Phase-8 `tool:<name>` chip contract). `intents: []` so the gate is
    // opened by the CLICK, not an auto-dispatched agent intent.
    suggestedActions: [
      {
        key: "tool:save_to_account",
        label: "💾 Save to account",
        detail: { intent: { kind: "openGate", trigger: "save" } },
      },
    ],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  ensureAnonSession.mockReset();
  ensureAnonSession.mockResolvedValue({ sessionId: "anon-session-1", anonymous: true });
  listChatMessages.mockReset();
  listChatMessages.mockResolvedValue([]);
  sendChatMessage.mockReset();
  sendChatMessage.mockResolvedValue(SAVE_CHIP_REPLY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OnboardingShell — save_to_account chip opens sign-in on the live f5 canvas", () => {
  it("clicking the tool:save_to_account chip opens sign-in as a viewer overlay", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OnboardingShell />, {
      initialFrame: "f5",
      initialScenario: "utility",
      api: {
        session: { ensureAnonSession },
        chat: { listChatMessages, sendChatMessage },
      },
    });

    // Pre-condition: the gate is NOT open on the live Interact canvas.
    expect(screen.queryByTestId("sign-up-viewer-surface")).not.toBeInTheDocument();

    // Send a chat message → the mocked reply carries the save chip.
    const input = (await screen.findByTestId("chat-live-input")).querySelector("input")!;
    await user.type(input, "save this analysis");
    await user.click(screen.getByTestId("chat-live-send"));

    // The save chip surfaces beneath the assistant turn…
    const chip = await screen.findByTestId("suggested-action-chip-tool:save_to_account");
    // …and clicking it opens sign-in on the live viewer while chat stays mounted.
    await user.click(chip);
    expect(await screen.findByTestId("sign-up-viewer-surface")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-flow")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-rail-preamble")).not.toBeInTheDocument();
  });
});
