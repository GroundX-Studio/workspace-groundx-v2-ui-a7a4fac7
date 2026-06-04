import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Canvas } from "./Canvas";
import { getSampleData } from "../flow/extractionData";
import { SAMPLES } from "../flow/flowData";

const utilityBill = SAMPLES.find((s) => s.id === "utility-bill")!;
const loan = SAMPLES.find((s) => s.id === "loan-eligibility")!;
const data = getSampleData("utility-bill")!;
const noop = () => {};
const base = {
  sample: utilityBill,
  data,
  view: "meters" as const,
  hoveredField: null,
  selectedField: null,
  onHoverField: noop,
  onSelectField: noop,
  onClearField: noop,
};

describe("Canvas", () => {
  it("shows the parsing banner in the Understand frame", () => {
    render(<Canvas {...base} frame="understand" />);

    expect(screen.getByText(/Reading utility-bill\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("UTILITY BILL · PAGE 1")).toBeInTheDocument();
  });

  it("renders the Extract frame without the parsing banner", () => {
    render(<Canvas {...base} frame="extract" />);

    expect(screen.queryByText(/Reading utility-bill\.pdf/)).not.toBeInTheDocument();
    expect(screen.getByText("sample:")).toBeInTheDocument();
  });

  it("renders anchored citation regions in the Compare frame (P5)", () => {
    render(<Canvas {...base} frame="compare" />);

    expect(screen.getByText(/METER #3 · PEAK 16\.2 KW/)).toBeInTheDocument();
    expect(screen.getByText(/6 small meters combined < #3 alone/)).toBeInTheDocument();
  });

  it("shows a coming-soon placeholder for an unwired sample", () => {
    render(<Canvas {...base} sample={loan} data={undefined} frame="understand" />);

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("renders the Calendly embed when booking, regardless of frame", () => {
    render(<Canvas {...base} frame="extract" booking />);

    expect(screen.getByText("Select a Date & Time")).toBeInTheDocument();
    expect(screen.getByText("GroundX intro · 15 min")).toBeInTheDocument();
  });

  it("renders the Integrate doors in the integrate frame (even for an unwired sample)", () => {
    render(<Canvas {...base} sample={loan} data={undefined} frame="integrate" />);

    expect(screen.getByText("Call it directly")).toBeInTheDocument();
    expect(screen.getByText("Drop into your agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "unlock everything →" })).toBeInTheDocument();
  });
});
