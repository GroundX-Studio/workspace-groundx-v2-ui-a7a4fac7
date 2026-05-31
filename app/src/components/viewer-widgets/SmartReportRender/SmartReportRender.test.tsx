import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type FC } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

// FIX #2: the re-render control closes the client↔server round-trip — it must
// call the render endpoint client (`renderReport`) and display the RESPONSE,
// not read a bare fixture. Mock the client so the test can assert it is called
// and that its response renders.
vi.mock("@/api/smartReport", () => ({
  renderReport: vi.fn(),
  SmartReportApiError: class SmartReportApiError extends Error {},
}));
import { renderReport } from "@/api/smartReport";
import type { RenderReportResult } from "@/api/smartReport";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { SmartReportRender } from "./SmartReportRender";

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(renderReport).mockReset();
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

  // ── FIX #2: re-render routes through the render endpoint client ──────
  it("the ↻ re-render control calls the render endpoint client and displays the RESPONSE", async () => {
    const user = userEvent.setup();
    const responseReport: RenderReportResult = {
      gated: false,
      report: {
        reportId: "rr-rt-utility-ic-brief",
        templateId: "rt-utility-ic-brief",
        scope: UTILITY_SCOPE,
        status: "complete",
        resolvedVariables: {},
        exportFormats: ["pdf", "md", "link"],
        previewOnly: true,
        sections: [
          {
            sectionId: "fresh_section",
            name: "fresh_section",
            renderAs: "PARAGRAPH",
            result: {
              sectionId: "fresh_section",
              body: "Freshly re-rendered from the endpoint.",
              citations: [{ documentId: "utility-bill-2026-04", page: 1, tier: "exact" }],
            },
          },
        ],
      },
    };
    vi.mocked(renderReport).mockResolvedValueOnce(responseReport);

    renderWithOnboardingProviders(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // First paint is the synchronous fixture (the four IC-brief sections).
    expect(screen.getByText(/billing summary/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("smart-report-rerender"));
    // The endpoint client is the production caller (round-trip closed).
    await waitFor(() => expect(renderReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(renderReport).mock.calls[0][0]).toMatchObject({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
    });
    // The surface now shows the ENDPOINT RESPONSE, not the bare fixture.
    await waitFor(() =>
      expect(screen.getByText(/freshly re-rendered from the endpoint/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/billing summary/i)).not.toBeInTheDocument();
  });

  it("surfaces an error state when the re-render endpoint call rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(renderReport).mockRejectedValueOnce(new Error("boom"));
    renderWithOnboardingProviders(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    await user.click(screen.getByTestId("smart-report-rerender"));
    await waitFor(() =>
      expect(screen.getByTestId("smart-report-rerender-error")).toBeInTheDocument(),
    );
  });
});
