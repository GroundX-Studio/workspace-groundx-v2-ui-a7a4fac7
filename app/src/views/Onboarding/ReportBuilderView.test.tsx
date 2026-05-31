import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ReportBuilderView } from "./ReportBuilderView";

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
});
