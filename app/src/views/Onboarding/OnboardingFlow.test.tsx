import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithAppProviders } from "@/test/renderWithAppProviders";

import { OnboardingFlow } from "./OnboardingFlow";

describe("OnboardingFlow", () => {
  it("opens on the full-width P1 Ingest screen", () => {
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

  it("opens a field's provenance peek (P4) and collapses back to the field list", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByText("Utility Bill"));
    fireEvent.click(screen.getByRole("button", { name: "meters" }));
    fireEvent.click(screen.getByRole("button", { name: "Open provenance for PEAK_DEMAND_KW" }));

    // Provenance peek is open.
    expect(screen.getByText("Field provenance")).toBeInTheDocument();
    expect(screen.getByText("WHY MATCHED")).toBeInTheDocument();
    expect(screen.getByText(/region \(520, 380\)/)).toBeInTheDocument();
    expect(screen.getByText(/how did you get 16\.2\?/)).toBeInTheDocument();

    // Collapse returns to the Extract field list.
    fireEvent.click(screen.getByRole("button", { name: "← all fields" }));
    expect(screen.getByText("Extracted fields")).toBeInTheDocument();
  });

  it("answers a comparison question (P5) with anchored citation regions", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByText("Utility Bill"));
    fireEvent.click(screen.getByRole("button", { name: "meters" }));
    fireEvent.click(screen.getByRole("button", { name: "compare two meters" }));

    expect(screen.getByText("How does meter #3 compare to the others?")).toBeInTheDocument();
    // The answer's citation anchors to a labelled region on the doc.
    expect(screen.getByText(/892 kWh \(#3\) vs 728 kWh \(#1\)/)).toBeInTheDocument();
  });

  it("opens the inline sign-in gate (P6), books a call (P6a), and dismisses back to Extract", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByText("Utility Bill"));
    fireEvent.click(screen.getByRole("button", { name: "meters" }));

    // "unlock everything" opens the gate inline; the canvas stays behind.
    fireEvent.click(screen.getByRole("button", { name: "unlock everything →" }));
    expect(screen.getByText("CONTINUE WITH…")).toBeInTheDocument();
    expect(screen.getByText("Extracted fields")).toBeInTheDocument();

    // Book a call → Calendly embed in the canvas.
    fireEvent.click(screen.getByRole("button", { name: "Book a call" }));
    expect(screen.getByText("Select a Date & Time")).toBeInTheDocument();

    // Back to sign-in.
    fireEvent.click(screen.getByRole("button", { name: "← back to sign-in" }));
    expect(screen.getByText("CONTINUE WITH…")).toBeInTheDocument();

    // Dismiss → returns to exploring (gate gone, Extract still there).
    fireEvent.click(screen.getByRole("button", { name: "Dismiss sign-in" }));
    expect(screen.queryByText("CONTINUE WITH…")).not.toBeInTheDocument();
    expect(screen.getByText("Extracted fields")).toBeInTheDocument();
  });

  it("jumps to Integrate (P7) from the step strip and re-opens the gate from the locked banner", () => {
    renderWithAppProviders(<OnboardingFlow />, "/start");

    fireEvent.click(screen.getByText("Utility Bill"));
    // The Integrate pill is clickable in the split.
    fireEvent.click(screen.getByRole("button", { name: "Go to Integrate" }));

    expect(screen.getByText("Call it directly")).toBeInTheDocument();
    expect(screen.getByText("Drop into your agent")).toBeInTheDocument();
    expect(screen.getByText("how do I run this from my own code?")).toBeInTheDocument();

    // The locked banner re-opens the sign-in gate inline.
    fireEvent.click(screen.getByRole("button", { name: "unlock everything →" }));
    expect(screen.getByText("CONTINUE WITH…")).toBeInTheDocument();
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
