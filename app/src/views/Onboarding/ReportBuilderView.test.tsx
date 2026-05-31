import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

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
    // Start on the render surface (f4). Click `✎ edit §N` for charge_breakdown.
    await user.click(screen.getByTestId("report-section-edit-charge_breakdown"));
    // We land on the builder (f4a) with that section's editor already open —
    // the hand-off carried the id end-to-end (NOT a generic open-with-nothing).
    expect(screen.getByTestId("smart-report-builder")).toBeInTheDocument();
    expect(screen.getByTestId("report-builder-editor-charge_breakdown")).toBeInTheDocument();
  });
});
