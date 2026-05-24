import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import type { CanvasAdapter } from "@/contexts/CanvasOrchestratorContext/types";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import type { Citation } from "@/types/onboarding";

import { CiteChip } from "./CiteChip";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
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
});
