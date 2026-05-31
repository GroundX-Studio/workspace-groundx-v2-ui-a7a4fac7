import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type FC } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { SmartReportRender } from "./SmartReportRender";

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("SmartReportRender — 2026-05-29-smart-report-screen Phase 3", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    (role) => {
      renderWithOnboardingProviders(<SmartReportRender role={role} scope={UTILITY_SCOPE} />);
      const root = screen.getByTestId("smart-report-render");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
    },
  );

  it("renders the Utility fixture's four IC-brief sections over a bucket+project scope", () => {
    renderWithOnboardingProviders(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    const surface = within(screen.getByTestId("smart-report-render"));
    expect(surface.getByText(/billing summary/i)).toBeInTheDocument();
    expect(surface.getByText(/charge breakdown/i)).toBeInTheDocument();
    expect(surface.getByText(/anomalies/i)).toBeInTheDocument();
    expect(surface.getByText(/recommendation/i)).toBeInTheDocument();
  });

  it("renders a CiteChip in a section footer (reuses the shipped clickable-citation path)", () => {
    renderWithOnboardingProviders(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    const chip = screen.getByTestId("cite-chip-1");
    expect(chip).toHaveAttribute("data-citation-doc", "utility-bill-2026-04");
  });

  it("locks export/Save for an anonymous viewer (preview-only sample)", () => {
    renderWithOnboardingProviders(<SmartReportRender role="anonymous" scope={UTILITY_SCOPE} />);
    expect(screen.getByTestId("smart-report-preview-badge")).toBeInTheDocument();
    const exportControl = screen.getByTestId("smart-report-export");
    expect(exportControl).toHaveAttribute("aria-disabled", "true");
    expect(exportControl).toHaveTextContent("🔒");
  });

  it("fires onEditSection when the per-heading edit affordance is clicked", async () => {
    const user = userEvent.setup();
    const onEditSection = vi.fn();
    renderWithOnboardingProviders(
      <SmartReportRender role="member" scope={UTILITY_SCOPE} onEditSection={onEditSection} />,
    );
    await user.click(screen.getByTestId("report-section-edit-billing_summary"));
    expect(onEditSection).toHaveBeenCalledWith("billing_summary");
  });

  it("shows the empty state when the scope has no fixture", () => {
    const noFixture: ContentScope = { type: "documents", documentIds: ["nope"] };
    renderWithOnboardingProviders(<SmartReportRender role="member" scope={noFixture} />);
    expect(screen.getByTestId("smart-report-empty")).toBeInTheDocument();
  });

  it("re-resolves the report when the scope IDENTITY changes (useScopeAdapter is load-bearing)", async () => {
    const user = userEvent.setup();
    const noFixture: ContentScope = { type: "documents", documentIds: ["nope"] };
    // A controllable harness that flips the scope prop WITHOUT remounting the
    // providers (rerender from the helper would tear down CanvasOrchestrator).
    const Harness: FC = () => {
      const [scope, setScope] = useState<ContentScope>(noFixture);
      return (
        <>
          <button data-testid="flip-scope" onClick={() => setScope(UTILITY_SCOPE)}>
            flip
          </button>
          <SmartReportRender role="member" scope={scope} />
        </>
      );
    };
    renderWithOnboardingProviders(<Harness />);
    expect(screen.getByTestId("smart-report-empty")).toBeInTheDocument();

    // Re-scope to the Utility bucket+project — the adapter must re-resolve to
    // the Utility fixture (not stay on the initial empty state).
    await user.click(screen.getByTestId("flip-scope"));
    expect(screen.queryByTestId("smart-report-empty")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("smart-report-render")).getByText(/billing summary/i),
    ).toBeInTheDocument();
  });
});
