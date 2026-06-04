import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Canvas } from "./Canvas";
import { SAMPLES } from "../flow/flowData";

const utilityBill = SAMPLES.find((s) => s.id === "utility-bill")!;

describe("Canvas", () => {
  it("shows the parsing banner during the understand phase", () => {
    render(<Canvas sample={utilityBill} phase="understand" />);

    expect(screen.getByText(/Reading utility-bill\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("UTILITY BILL · PAGE 1")).toBeInTheDocument();
  });

  it("drops the parsing banner once past understand", () => {
    render(<Canvas sample={utilityBill} phase="extract" />);

    expect(screen.queryByText(/Reading utility-bill\.pdf/)).not.toBeInTheDocument();
    // Sample switcher remains available.
    expect(screen.getByText("sample:")).toBeInTheDocument();
  });
});
