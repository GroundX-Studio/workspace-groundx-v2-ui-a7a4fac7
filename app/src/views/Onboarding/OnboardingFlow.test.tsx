import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithAppProviders } from "@/test/renderWithAppProviders";

import { OnboardingFlow } from "./OnboardingFlow";

describe("OnboardingFlow", () => {
  it("opens on the full-width F1 Ingest screen", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    expect(screen.getByRole("heading", { name: "Connect your data to GroundX." })).toBeInTheDocument();
    expect(screen.getByText("TRY A SAMPLE · NO SIGN-UP")).toBeInTheDocument();
    expect(screen.getByText("Utility Bill")).toBeInTheDocument();
    expect(screen.getByText("Loan Eligibility Packet")).toBeInTheDocument();
    expect(screen.getByText("Solar Project Portfolio")).toBeInTheDocument();
    // The shell renders the nav rail alongside the screen.
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
  });

  it("advances into the split layout (Understand) when a sample is picked", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByText("Utility Bill"));

    // Chat panel + canvas now render the split, on the Understand step.
    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByText("Pick a view:")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize chat and canvas" })).toBeInTheDocument();
  });

  it("opens the Extract view with citable fields when a Pick-a-view chip is clicked", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByText("Utility Bill"));
    fireEvent.click(screen.getByRole("button", { name: "meters" }));

    expect(screen.getByText("Extracted fields")).toBeInTheDocument();
    expect(screen.getByText("PEAK_DEMAND_KW")).toBeInTheDocument();
    expect(screen.getByText("[3] p.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "unlock everything →" })).toBeInTheDocument();
  });

  it("lets keyboard users select a sample (cards are buttons activated by Enter)", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    const card = screen.getByRole("button", { name: "Try the Utility Bill sample" });
    fireEvent.keyDown(card, { key: "Enter" });

    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("collapses the nav rail to an icon-only rail", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));

    // The wordmark hides; the expand control is now available.
    expect(screen.queryByText("GroundX")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
  });
});
