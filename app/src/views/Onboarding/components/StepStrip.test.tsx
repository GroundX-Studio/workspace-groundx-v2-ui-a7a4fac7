import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
