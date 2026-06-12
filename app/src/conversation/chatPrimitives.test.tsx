import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
    // Skip the PinToReportAction branch — it needs ChatStore context the bare
    // render doesn't provide, and isn't the unit under test here.
    pinToReport: false,
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
