import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OnboardingContext, OnboardingContextI } from "@/contexts/OnboardingContext/OnboardingContext";
import { GxThemeProvider } from "@/ThemeProvider";
import type { AppOnboardingStepConfig } from "@/appConfig";

import OnboardingWizard from "./OnboardingWizard";

const renderWizard = (context: Partial<OnboardingContextI> = {}) => {
  const contextValue = {
    isOnboardingOpen: true,
    currentStep: 0,
    next: vi.fn(),
    back: vi.fn(),
    finish: vi.fn(),
    closeWithoutCompleting: vi.fn(),
    ...context,
  };
  const steps = [
    {
      id: "intro",
      title: "Review your signed-in Studio",
      body: "This custom authenticated onboarding copy comes from app config.",
      primaryActionLabel: "Show me around",
      routeHint: "Start from the current product route.",
      educationLabel: "About signed-in onboarding",
      sourceFrame: "Authenticated Studio",
      launchHref: "/onboarding",
      launchLabel: "Open onboarding sandbox",
    },
    {
      id: "finish",
      title: "You are ready",
      body: "Finish stores app-owned onboarding metadata.",
    },
  ] as AppOnboardingStepConfig[];

  render(
    <GxThemeProvider>
      <OnboardingContext.Provider value={contextValue}>
        <OnboardingWizard steps={steps} />
      </OnboardingContext.Provider>
    </GxThemeProvider>
  );
  return contextValue;
};

describe("OnboardingWizard", () => {
  it("renders configured onboarding copy accessibly", () => {
    renderWizard();

    expect(screen.getByRole("dialog", { name: /welcome to groundx studio/i })).toBeInTheDocument();
    expect(screen.getByText("Review your signed-in Studio")).toBeInTheDocument();
    expect(screen.getByText("This custom authenticated onboarding copy comes from app config.")).toBeInTheDocument();
    expect(screen.getByText("Start from the current product route.")).toBeInTheDocument();
    expect(screen.getByText("About signed-in onboarding")).toBeInTheDocument();
    expect(screen.getByText("Authenticated Studio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open onboarding sandbox" })).toHaveAttribute("href", "/onboarding");
  });

  it("supports reachable wizard actions", () => {
    const context = renderWizard({ currentStep: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(context.finish).toHaveBeenCalledTimes(1);
    expect(context.closeWithoutCompleting).toHaveBeenCalledTimes(1);
    expect(context.back).toHaveBeenCalledTimes(1);
  });

  it("uses Finish on the final step", () => {
    const context = renderWizard({ currentStep: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(context.finish).toHaveBeenCalledTimes(1);
  });

  it("does not render when closed", () => {
    renderWizard({ isOnboardingOpen: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
