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
    expect(chip).toHaveTextContent("2");
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

  describe("viewer-jump behavior (clickable-citations Phase 5)", () => {
    /**
     * Phase 5 retired the pre-UI-04 Popover fallback. Clicking a
     * CiteChip now dispatches `highlightCitation` to the orchestrator
     * (which routes to ChatStore.gotoDocViewer → doc-viewer ViewerStep)
     * and that's the only visible side effect. Hover tooltip is the
     * native `title=` attribute. The onActivate override still
     * suppresses the orchestrator dispatch when supplied.
     */
    it("the chip's hover tooltip names the source page + snippet (native title attr)", async () => {
      renderWithOnboardingProviders(
        <CiteChip citation={{ ...citation, snippet: "Total amount due: $234.56" }} index={2} />,
      );
      const chip = screen.getByTestId("cite-chip-2");
      expect(chip.getAttribute("title")).toMatch(/page 3/i);
      expect(chip.getAttribute("title")).toContain("Total amount due: $234.56");
    });

    it("no popover renders after click — the chip is silent on its own surface (viewer pane owns the response)", async () => {
      const user = userEvent.setup();
      renderWithOnboardingProviders(<CiteChip citation={citation} index={1} />);
      await user.click(screen.getByTestId("cite-chip-1"));
      // The retired Popover testid must not appear post-click.
      expect(screen.queryByTestId("cite-peek")).not.toBeInTheDocument();
    });

    it("onActivate override still suppresses the orchestrator dispatch", async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      renderWithOnboardingProviders(
        <CiteChip citation={citation} index={1} onActivate={onActivate} />,
      );
      await user.click(screen.getByTestId("cite-chip-1"));
      expect(onActivate).toHaveBeenCalledTimes(1);
    });
  });
});
