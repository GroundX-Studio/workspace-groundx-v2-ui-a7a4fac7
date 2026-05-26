import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// OB-02 — citation peek fires cite.peeked. Mock the wrapper to assert.
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  identify: vi.fn(),
  initAnalytics: vi.fn(() => false),
  resetAnalytics: vi.fn(),
}));
import { track } from "@/lib/analytics";

import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import type { CanvasAdapter } from "@/contexts/CanvasOrchestratorContext/types";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import type { Citation } from "@/types/onboarding";

import { CiteChip } from "./CiteChip";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(track).mockReset();
});

const citation: Citation = {
  documentId: "utility-bill-2026-04",
  page: 3,
  bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
};

describe("CiteChip", () => {
  it("renders stable citation metadata for cross-surface highlighting", () => {
    renderWithOnboardingProviders(<CiteChip citation={citation} index={2} />);

    const chip = screen.getByTestId("cite-chip-2");
    expect(chip).toHaveTextContent("[2]");
    expect(chip).toHaveAttribute("data-citation-doc", "utility-bill-2026-04");
    expect(chip).toHaveAttribute("data-citation-page", "3");
    expect(screen.getByLabelText(/Citation 2/)).toBeInTheDocument();
  });

  it("dispatches highlightCitation when activated without an override", async () => {
    const user = userEvent.setup();
    const applied: unknown[] = [];

    const Harness = () => {
      const { registerAdapter, lastAppliedIntentId } = useCanvasOrchestrator();
      useEffect(() => {
        const adapter: CanvasAdapter<"highlightCitation"> = {
          kind: "highlightCitation",
          apply: (intent) => {
            applied.push(intent);
          },
        };
        return registerAdapter(adapter);
      }, [registerAdapter]);

      return (
        <>
          <CiteChip citation={citation} index={1} />
          <span data-testid="last-intent-id">{lastAppliedIntentId ?? "none"}</span>
        </>
      );
    };

    renderWithOnboardingProviders(<Harness />);

    await user.click(screen.getByTestId("cite-chip-1"));

    await waitFor(() => {
      expect(applied).toEqual([
        {
          kind: "highlightCitation",
          documentId: "utility-bill-2026-04",
          page: 3,
          bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        },
      ]);
      expect(screen.getByTestId("last-intent-id")).toHaveTextContent("1");
    });
  });

  it("uses the explicit onActivate override instead of dispatching", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    renderWithOnboardingProviders(<CiteChip citation={citation} index={1} onActivate={onActivate} />);

    await user.click(screen.getByTestId("cite-chip-1"));

    expect(onActivate).toHaveBeenCalledWith(citation);
  });

  it("OB-02: click fires cite.peeked with documentId + page + index", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<CiteChip citation={citation} index={2} />);
    await user.click(screen.getByTestId("cite-chip-2"));
    expect(track).toHaveBeenCalledWith("cite.peeked", {
      documentId: "utility-bill-2026-04",
      page: 3,
      index: 2,
    });
  });

  it("OB-02: cite.peeked fires even when onActivate override is used (the chip was still peeked)", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <CiteChip citation={citation} index={1} onActivate={() => {}} />,
    );
    await user.click(screen.getByTestId("cite-chip-1"));
    expect(track).toHaveBeenCalledWith(
      "cite.peeked",
      expect.objectContaining({ documentId: "utility-bill-2026-04" }),
    );
  });

  describe("peek popover (pre-UI-04)", () => {
    /**
     * Until UI-04 lands the F5 side panel, clicking a CiteChip was
     * effectively silent — the dispatch went through but no adapter
     * is registered in production. The peek popover gives the click
     * a visible response: a small panel anchored to the chip showing
     * the source page + snippet, with a "coming soon" footer for the
     * full source viewer. When the explicit `onActivate` override is
     * supplied (e.g. by F5's eventual side-panel wiring) the popover
     * does NOT open — the override takes over the click.
     */
    it("opens a popover with the page number after a default click", async () => {
      const user = userEvent.setup();
      renderWithOnboardingProviders(<CiteChip citation={citation} index={2} />);
      await user.click(screen.getByTestId("cite-chip-2"));
      const peek = await screen.findByTestId("cite-peek");
      expect(peek).toBeInTheDocument();
      expect(peek).toHaveTextContent(/page 3/i);
    });

    it("renders the snippet text inside the popover when the citation has one", async () => {
      const user = userEvent.setup();
      const withSnippet: Citation = { ...citation, snippet: "Total amount due: $234.56" };
      renderWithOnboardingProviders(<CiteChip citation={withSnippet} index={2} />);
      await user.click(screen.getByTestId("cite-chip-2"));
      const peek = await screen.findByTestId("cite-peek");
      expect(peek).toHaveTextContent("Total amount due: $234.56");
    });

    it("does NOT open the popover when an onActivate override is provided", async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      renderWithOnboardingProviders(
        <CiteChip citation={citation} index={1} onActivate={onActivate} />,
      );
      await user.click(screen.getByTestId("cite-chip-1"));
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("cite-peek")).not.toBeInTheDocument();
    });
  });
});
