import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { LiveTurnList } from "./chatPrimitives";
import type { LiveTurn } from "./useConversation";

/**
 * agentic-tool-loop (T5b) — the assistant bubble shows a muted "what the agent
 * consulted" annotation from `turn.toolActivity[]`, and shows nothing when the
 * field is empty/absent (the common, non-looped case).
 */
function assistantTurn(extra: Partial<LiveTurn>): LiveTurn {
  return {
    id: "a-1",
    role: "assistant",
    content: "X-Ray breaks documents into semantic objects.",
    // Not pinnable (opt-in) → skips the pin affordance branch, which needs
    // ChatStore context the bare render doesn't provide and isn't under test here.
    ...extra,
  };
}

describe("LiveTurnList — tool-activity annotation", () => {
  it("renders the activity label when a server tool ran this turn", () => {
    render(
      <LiveTurnList
        liveTurns={[assistantTurn({ toolActivity: [{ name: "lookup_groundx_docs", label: "Checked GroundX docs" }] })]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.getByTestId("chat-tool-activity")).toHaveTextContent("Checked GroundX docs");
  });

  it("collapses repeated labels (same tool consulted twice → shown once)", () => {
    render(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            toolActivity: [
              { name: "lookup_groundx_docs", label: "Checked GroundX docs" },
              { name: "lookup_groundx_docs", label: "Checked GroundX docs" },
            ],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.getByTestId("chat-tool-activity").textContent).toBe("Checked GroundX docs");
  });

  it("renders nothing when toolActivity is empty or absent", () => {
    render(
      <LiveTurnList
        liveTurns={[assistantTurn({ toolActivity: [] })]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.queryByTestId("chat-tool-activity")).toBeNull();
  });
});

// report-pin-affordance T1 — the pin affordance is OPT-IN and COMPACT.
// (Uses the full providers because the pin control reads ChatStore.)
describe("report-pin-affordance — opt-in compact pin (T1)", () => {
  const turn = (extra: Partial<LiveTurn>): LiveTurn => ({
    id: "a-1",
    role: "assistant",
    content: "The total amount due is $7,613.20.",
    ...extra,
  });

  it("a genuine answer turn (pinnable) shows the COMPACT AnswerActions control", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[turn({ pinnable: true })]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.getByTestId("answer-actions")).toBeInTheDocument();
  });

  it("a narration / scripted turn (NOT pinnable) shows NO pin affordance at all", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[turn({})]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.queryByTestId("answer-actions")).not.toBeInTheDocument();
    // and NOT the old full-width pill either.
    expect(screen.queryByTestId("pin-to-report-action")).not.toBeInTheDocument();
  });

  it("the pin control is a real <button> with an aria-label (keyboard/touch operable, not hover-only)", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[turn({ pinnable: true })]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    const actions = screen.getByTestId("answer-actions");
    const btn = within(actions).getByRole("button", { name: /pin/i });
    expect(btn.tagName).toBe("BUTTON");
  });
});
