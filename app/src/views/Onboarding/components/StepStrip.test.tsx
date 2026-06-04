import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GxThemeProvider } from "@/ThemeProvider";

import { StepStrip } from "./StepStrip";

const renderStrip = (props: Parameters<typeof StepStrip>[0]) =>
  render(
    <GxThemeProvider>
      <StepStrip {...props} />
    </GxThemeProvider>,
  );

describe("StepStrip", () => {
  it("renders every stage and the ANALYZE bracket", () => {
    renderStrip({ activePhase: "ingest" });

    for (const label of ["Ingest", "Understand", "Extract", "Interact", "Report", "Integrate", "ANALYZE"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the active phase and earlier phases as done", () => {
    renderStrip({ activePhase: "understand" });

    // Ingest precedes Understand, so it should render a completed check.
    expect(screen.getByTestId("CheckIcon")).toBeInTheDocument();
  });

  it("makes the Integrate pill a button when onIntegrate is provided", () => {
    const onIntegrate = vi.fn();
    renderStrip({ activePhase: "interact", onIntegrate });

    fireEvent.click(screen.getByRole("button", { name: "Go to Integrate" }));

    expect(onIntegrate).toHaveBeenCalledTimes(1);
  });

  it("keeps Report disabled (never visited) even when Integrate is active", () => {
    renderStrip({ activePhase: "integrate" });

    // Ingest, Understand, Extract, Interact are done (4 checks); Report is skipped in the
    // linear flow so it stays muted (no check); Integrate is the active pill (badge, no check).
    expect(screen.getAllByTestId("CheckIcon").length).toBe(4);
    expect(screen.getByText("Report")).toBeInTheDocument();
  });
});
