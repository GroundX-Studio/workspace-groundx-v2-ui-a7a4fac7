import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExtractedFields } from "./ExtractedFields";
import { UTILITY_BILL_CATEGORIES } from "../flow/extractionData";

const meters = UTILITY_BILL_CATEGORIES.meters;
const noop = () => {};

describe("ExtractedFields", () => {
  it("renders fields with values, citations, and the locked footer", () => {
    render(<ExtractedFields category={meters} hoveredField={null} onHoverField={noop} onSelectField={noop} />);

    expect(screen.getByText("PEAK_DEMAND_KW")).toBeInTheDocument();
    expect(screen.getByText("16.2")).toBeInTheDocument();
    expect(screen.getByText("[3] p.1")).toBeInTheDocument();
    expect(screen.getByText(/3 more fields locked/)).toBeInTheDocument();
  });

  it("opens a field's provenance when its row is activated", () => {
    const onSelectField = vi.fn();
    render(<ExtractedFields category={meters} hoveredField={null} onHoverField={noop} onSelectField={onSelectField} />);

    fireEvent.click(screen.getByRole("button", { name: "Open provenance for PEAK_DEMAND_KW" }));

    expect(onSelectField).toHaveBeenCalledWith("PEAK_DEMAND_KW");
  });

  it("exposes gated schema actions behind the menu", () => {
    render(<ExtractedFields category={meters} hoveredField={null} onHoverField={noop} onSelectField={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "Extract actions menu" }));

    expect(screen.getByText("Save schema…")).toBeInTheDocument();
    expect(screen.getByText("Export JSON")).toBeInTheDocument();
  });
});
