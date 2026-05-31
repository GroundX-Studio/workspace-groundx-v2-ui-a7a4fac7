import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

// 2026-05-31-smart-report-followups: SmartReportRender's FIRST paint now routes
// through the render endpoint client (`renderReport`); the render→builder
// `✎ edit §N` hand-off test mounts that surface, so we drive it through this
// mock (MOCK_MODE returns the same fixtures server-side).
vi.mock("@/api/smartReport", async () => {
  const { getReportFixture } = await import("@/widgets/reportFixtures");
  return {
    renderReport: vi.fn(async (input: { scope: import("@groundx/shared").ContentScope }) => ({
      gated: false as const,
      report: getReportFixture(input.scope) ?? {
        reportId: "rr-empty",
        templateId: "rt-empty",
        scope: input.scope,
        status: "complete" as const,
        resolvedVariables: {},
        exportFormats: [],
        previewOnly: false,
        sections: [],
      },
    })),
    SmartReportApiError: class SmartReportApiError extends Error {},
  };
});

import { ReportBuilderView } from "./ReportBuilderView";
import { ReportRenderView } from "./ReportRenderView";

/**
 * Render-or-builder switch — mirrors how OnboardingShell picks the f4 vs f4a
 * view by frame. Lets a single test exercise the live render→builder
 * `✎ edit §N` hand-off (the production caller of the builder's
 * `selectedSectionId` prop).
 */
const ReportFlow: React.FC = () => {
  const { state } = useOnboardingSession();
  return state.currentFrame === "f4a" ? <ReportBuilderView /> : <ReportRenderView />;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.localStorage.clear();
});

describe("ReportBuilderView — f4a thin wrapper (2026-05-29-smart-report-screen Phase 4)", () => {
  it("mounts the production SmartReportBuilder widget (NOT a standalone placeholder)", () => {
    renderWithOnboardingProviders(<ReportBuilderView />, {
      initialScenario: "utility",
      initialFrame: "f4a",
    });
    // The wrapper mounts the real widget — proven by the widget's testid +
    // the fixture section rows it renders (the old placeholder rendered none).
    expect(screen.getByTestId("smart-report-builder")).toBeInTheDocument();
    expect(screen.getByTestId("report-builder-row-billing_summary")).toBeInTheDocument();
  });

  it("derives the widget role from auth state (anonymous by default)", () => {
    renderWithOnboardingProviders(<ReportBuilderView />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "anonymous",
    });
    expect(screen.getByTestId("smart-report-builder")).toHaveAttribute("data-role", "anonymous");
  });

  it("passes a member role when signed in", () => {
    renderWithOnboardingProviders(<ReportBuilderView />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    expect(screen.getByTestId("smart-report-builder")).toHaveAttribute("data-role", "member");
  });

  it("carries the section id through the render→builder `✎ edit §N` hand-off (pre-opens that editor)", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ReportFlow />, {
      initialScenario: "utility",
      initialFrame: "f4",
      initialAuthState: "signed-in",
    });
    // Start on the render surface (f4). The sections paint from the render
    // endpoint (async first paint), so await the edit affordance before clicking
    // `✎ edit §N` for charge_breakdown.
    await user.click(await screen.findByTestId("report-section-edit-charge_breakdown"));
    // We land on the builder (f4a) with that section's editor already open —
    // the hand-off carried the id end-to-end (NOT a generic open-with-nothing).
    expect(screen.getByTestId("smart-report-builder")).toBeInTheDocument();
    expect(screen.getByTestId("report-builder-editor-charge_breakdown")).toBeInTheDocument();
  });
});
