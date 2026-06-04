import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CapabilityPills } from "./CapabilityPills";

describe("CapabilityPills", () => {
  it("marks demonstrated capabilities as supported and the rest as not in this sample", () => {
    render(<CapabilityPills active={["E", "I"]} />);

    expect(screen.getByLabelText("Extract supported")).toBeInTheDocument();
    expect(screen.getByLabelText("Interact supported")).toBeInTheDocument();
    expect(screen.getByLabelText("Report not in this sample")).toBeInTheDocument();
  });

  it("renders legend labels when requested", () => {
    render(<CapabilityPills active={["E", "I", "R"]} legend />);

    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("Interact")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
  });
});
