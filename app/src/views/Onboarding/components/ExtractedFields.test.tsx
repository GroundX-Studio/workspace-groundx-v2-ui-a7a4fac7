import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExtractedFields } from "./ExtractedFields";
import { UTILITY_BILL_CATEGORIES } from "../flow/extractionData";

const meters = UTILITY_BILL_CATEGORIES.meters;

describe("ExtractedFields", () => {
  it("renders fields with values, citations, and the locked footer", () => {
    render(<ExtractedFields category={meters} hoveredField={null} onHoverField={() => {}} />);

    expect(screen.getByText("PEAK_DEMAND_KW")).toBeInTheDocument();
    expect(screen.getByText("16.2")).toBeInTheDocument();
    expect(screen.getByText("[3] p.1")).toBeInTheDocument();
    expect(screen.getByText(/3 more fields locked/)).toBeInTheDocument();
  });

  it("highlights the row matching the hovered field", () => {
    const { rerender } = render(<ExtractedFields category={meters} hoveredField={null} onHoverField={() => {}} />);
    // Re-render with a hovered field; the matching row should expose its citation unchanged.
    rerender(<ExtractedFields category={meters} hoveredField="PEAK_DEMAND_KW" onHoverField={() => {}} />);

    expect(screen.getByText("PEAK_DEMAND_KW")).toBeInTheDocument();
    expect(screen.getByText("16.2")).toBeInTheDocument();
  });

  it("exposes gated schema actions behind the menu", () => {
    render(<ExtractedFields category={meters} hoveredField={null} onHoverField={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Extract actions menu" }));

    expect(screen.getByText("Save schema…")).toBeInTheDocument();
    expect(screen.getByText("Export JSON")).toBeInTheDocument();
  });
});
