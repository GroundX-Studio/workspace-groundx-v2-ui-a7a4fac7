import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CapabilityBadge } from "./CapabilityBadge";

describe("CapabilityBadge", () => {
  it("renders the letter so the chip reads as E / I / R", () => {
    render(<CapabilityBadge letter="E" live />);
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("attaches a tooltip describing live status when name is provided", () => {
    render(<CapabilityBadge letter="I" live name="Interact" />);
    expect(screen.getByText("I")).toHaveAttribute("title", "Interact · live in this sample");
  });

  it("attaches a tooltip describing hollow status when live is false", () => {
    render(<CapabilityBadge letter="R" live={false} name="Report" />);
    expect(screen.getByText("R")).toHaveAttribute("title", "Report · not in this sample");
  });

  it("renders without a tooltip when name is omitted", () => {
    render(<CapabilityBadge letter="E" live />);
    expect(screen.getByText("E")).not.toHaveAttribute("title");
  });

  it("accepts the sm size prop without crashing", () => {
    // The actual pixel rendering is a styling detail. The contract is
    // that two size variants exist and the consumer can choose. Pixel
    // values live in CAPABILITY_BADGE_SIZE / _SM constants and are
    // covered by the no-hardcoded-styles test.
    expect(() => render(<CapabilityBadge letter="E" live size="sm" />)).not.toThrow();
  });
});
