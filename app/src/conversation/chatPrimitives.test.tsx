import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    timestamp: 1_782_000_000_000,
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

describe("LiveTurnList — inline footnote citations (Phase E)", () => {
  it("renders an inline [N] marker in the answer prose + a SourceList, not a flat chip row", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            content: "The total is $7,613.20 [1].",
            citations: [{ documentId: "doc-A", page: 2, fileName: "utility-bill.pdf" }],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    // The same citation appears twice by design: an inline footnote marker in the
    // prose AND a pill in the source list — distinguished by data-variant.
    const chips = screen.getAllByTestId("cite-chip-1");
    expect(chips.some((c) => c.getAttribute("data-variant") === "footnote")).toBe(true); // inline marker
    expect(chips.some((c) => c.getAttribute("data-variant") === "pill")).toBe(true); // source list
    // the single-citation SourceList names the document (no UUID)
    expect(screen.getByTestId("source-list")).toHaveTextContent("utility-bill.pdf");
  });
});

// standardized-viewer-control T8 — an OFFERED navigation action that carries an
// `anchor` renders as inline clickable prose (when its phrase is found) instead
// of a pill; a not-found anchor falls back to a pill; a no-anchor action is a
// pill. One `suggestedActions` list; clicking either surface goes through the
// host's `onSuggestedAction` (→ orchestrator dispatch, `source: "user"`).
describe("LiveTurnList — offered affordances (inline anchor vs. pill)", () => {
  const navOffer = (anchor?: string): NonNullable<LiveTurn["suggestedActions"]>[number] => ({
    key: "tool:show_smart_report_render",
    label: "Open the report",
    detail: { name: "show_smart_report_render", intent: { kind: "showReport" } },
    ...(anchor ? { anchor } : {}),
  });

  it("renders an inline anchor (NOT a pill) when the anchor phrase is found in the prose", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            content: "Take a look at the report to compare line items.",
            suggestedActions: [navOffer("the report")],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    // inline anchor present in the prose
    expect(screen.getByTestId("affordance-anchor-tool:show_smart_report_render")).toBeInTheDocument();
    // and NOT also rendered as a follow-up pill (one list, one surface)
    expect(
      screen.queryByTestId("suggested-action-chip-tool:show_smart_report_render"),
    ).not.toBeInTheDocument();
  });

  it("clicking the inline anchor calls onSuggestedAction with the action (→ orchestrator dispatch)", () => {
    const onAction = vi.fn();
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            content: "Open the report to compare.",
            citations: [{ documentId: "doc-A", page: 2 }],
            suggestedActions: [navOffer("the report")],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={onAction}
      />,
    );
    fireEvent.click(screen.getByTestId("affordance-anchor-tool:show_smart_report_render"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ key: "tool:show_smart_report_render" });
  });

  it("falls back to a PILL when the anchor phrase is NOT found in the prose (never lost)", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            content: "This answer has no matching phrase.",
            suggestedActions: [navOffer("the report")],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("affordance-anchor-tool:show_smart_report_render"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("suggested-action-chip-tool:show_smart_report_render"),
    ).toBeInTheDocument();
  });

  it("renders a no-anchor offered action as a pill", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            content: "Open the report whenever you like.",
            suggestedActions: [navOffer()],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(
      screen.getByTestId("suggested-action-chip-tool:show_smart_report_render"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("affordance-anchor-tool:show_smart_report_render"),
    ).not.toBeInTheDocument();
  });

  it("keeps a UI-driven action (show-source) as a pill even if it coincidentally matches prose", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[
          assistantTurn({
            content: "Open the report and show source if needed.",
            citations: [{ documentId: "doc-A", page: 2 }],
            // `show-source` is UI-driven, has no `tool:` key + no anchor → always a pill.
            suggestedActions: [{ key: "show-source", label: "Show source" }, navOffer("the report")],
          }),
        ]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
    // the navigation offer with a found anchor still inlines
    expect(screen.getByTestId("affordance-anchor-tool:show_smart_report_render")).toBeInTheDocument();
  });
});

// report-pin-affordance T1 — the pin affordance is OPT-IN and COMPACT.
// (Uses the full providers because the pin control reads ChatStore.)
describe("report-pin-affordance — opt-in compact pin (T1)", () => {
  const turn = (extra: Partial<LiveTurn>): LiveTurn => ({
    id: "a-1",
    role: "assistant",
    content: "The total amount due is $7,613.20.",
    timestamp: 1_782_000_000_000,
    ...extra,
  });

  it("a genuine answer turn (pinnable) shows the compact pin in the message footer", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[turn({ pinnable: true })]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    const footer = screen.getByTestId("message-actions");
    expect(within(footer).getByRole("button", { name: /pin/i })).toBeInTheDocument();
  });

  it("a narration / scripted turn (NOT pinnable) shows the footer but NO pin", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[turn({})]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    // The footer (copy + timestamp) still renders for an assistant turn with
    // content, but a non-pinnable turn carries NO pin control.
    const footer = screen.getByTestId("message-actions");
    expect(within(footer).queryByRole("button", { name: /pin/i })).toBeNull();
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
    const footer = screen.getByTestId("message-actions");
    const btn = within(footer).getByRole("button", { name: /pin/i });
    expect(btn.tagName).toBe("BUTTON");
  });
});

describe("per-message footer (chat-message-actions-timestamps)", () => {
  const TIME_RE = /\d{1,2}:\d{2}\s?(AM|PM)/i;

  it("a user turn renders a right-aligned footer with copy + timestamp", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[{ id: "u-1", role: "user", content: "what is the total?", timestamp: Date.now() }]}
        sending={false}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    const footer = screen.getByTestId("message-actions");
    expect(footer).toHaveAttribute("data-role", "user");
    expect(within(footer).getByTestId("copy-message-button")).toBeInTheDocument();
    expect(footer.textContent).toMatch(TIME_RE);
  });

  it("an empty (still-streaming) assistant placeholder renders NO footer", () => {
    renderWithOnboardingProviders(
      <LiveTurnList
        liveTurns={[{ id: "a-1", role: "assistant", content: "", timestamp: Date.now() }]}
        sending={true}
        role="anonymous"
        onSuggestedAction={() => {}}
      />,
    );
    expect(screen.queryByTestId("message-actions")).not.toBeInTheDocument();
  });
});
