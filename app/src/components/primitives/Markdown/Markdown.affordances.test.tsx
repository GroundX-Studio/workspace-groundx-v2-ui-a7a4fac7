import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Citation, SuggestedAction } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { Markdown } from "./Markdown";

/**
 * standardized-viewer-control T8 — an offered navigation affordance with an
 * `anchor` renders as inline clickable prose (first occurrence) that activates
 * the action on click. When the phrase is not found the action is NOT rendered
 * inline (the host falls back to a pill). Citations and an anchor coexist in one
 * Markdown render. The render mechanism reuses the SAME remark walk as the `[N]`
 * citation markers (parameterized), not a copy.
 */
const cite = (over: Partial<Citation> = {}): Citation => ({ documentId: "doc-1", page: 1, ...over });

const offer = (over: Partial<SuggestedAction> = {}): SuggestedAction => ({
  key: "tool:show_smart_report_render",
  label: "Open the report",
  detail: { name: "show_smart_report_render", intent: { kind: "showReport" } },
  ...over,
});

describe("Markdown offered affordances (inline anchors)", () => {
  it("wraps the anchor phrase as an inline clickable that activates the action's key", () => {
    const onActivate = vi.fn();
    renderWithOnboardingProviders(
      <Markdown
        offeredActions={[offer({ anchor: "the report" })]}
        onAffordanceActivate={onActivate}
      >
        {"Take a look at the report to compare line items."}
      </Markdown>,
    );
    const anchor = screen.getByTestId("affordance-anchor-tool:show_smart_report_render");
    expect(anchor).toHaveTextContent("the report");
    fireEvent.click(anchor);
    expect(onActivate).toHaveBeenCalledWith("tool:show_smart_report_render");
  });

  it("does NOT render an inline anchor when the phrase is absent (host falls back to a pill)", () => {
    const onActivate = vi.fn();
    renderWithOnboardingProviders(
      <Markdown
        offeredActions={[offer({ anchor: "the dashboard" })]}
        onAffordanceActivate={onActivate}
      >
        {"There is no matching phrase in this answer."}
      </Markdown>,
    );
    expect(
      screen.queryByTestId("affordance-anchor-tool:show_smart_report_render"),
    ).not.toBeInTheDocument();
  });

  it("does NOT inline an offered action that has NO anchor (it renders as a pill, not here)", () => {
    renderWithOnboardingProviders(
      <Markdown offeredActions={[offer({ anchor: undefined })]} onAffordanceActivate={vi.fn()}>
        {"Open the report when ready."}
      </Markdown>,
    );
    expect(
      screen.queryByTestId("affordance-anchor-tool:show_smart_report_render"),
    ).not.toBeInTheDocument();
  });

  it("renders citation markers AND an inline anchor in ONE Markdown render (coexistence)", () => {
    const onActivate = vi.fn();
    renderWithOnboardingProviders(
      <Markdown
        citations={[cite({ page: 3 })]}
        offeredActions={[offer({ anchor: "the report" })]}
        onAffordanceActivate={onActivate}
      >
        {"The total is $7,613.20 [1]. Open the report to compare."}
      </Markdown>,
    );
    // the [1] citation marker is still a footnote CiteChip
    expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-variant", "footnote");
    // the anchor is an inline clickable
    const anchor = screen.getByTestId("affordance-anchor-tool:show_smart_report_render");
    fireEvent.click(anchor);
    expect(onActivate).toHaveBeenCalledWith("tool:show_smart_report_render");
    // the surrounding prose is intact
    expect(within(screen.getByTestId("markdown")).getByText(/Open/)).toBeInTheDocument();
  });

  it("is byte-identical when no offeredActions are given (citation-only path unchanged)", () => {
    renderWithOnboardingProviders(
      <Markdown citations={[cite()]}>{"The total is $7,613.20 [1]."}</Markdown>,
    );
    expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("The total is $7,613.20");
  });
});
