/**
 * GateValueProp — the canvas half of the F6 gate (P1, 2026-05-29).
 * Presentational pitch surface; the sign-up doors live in GateChatRail.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GateValueProp } from "./GateValueProp";

describe("GateValueProp", () => {
  it("renders the value-prop pitch (eyebrow + headline + points)", () => {
    render(<GateValueProp />);
    expect(screen.getByTestId("gate-value-prop")).toBeInTheDocument();
    expect(screen.getByText(/why groundx/i)).toBeInTheDocument();
    expect(screen.getByText(/answers you can trust/i)).toBeInTheDocument();
    expect(screen.getByText(/cites its source/i)).toBeInTheDocument();
    // No account-creation form lives in the canvas anymore.
    expect(screen.queryByLabelText(/sign-up form/i)).not.toBeInTheDocument();
  });

  it("honors the mode prop (locked-affordance contract)", () => {
    render(<GateValueProp mode="steady" />);
    expect(screen.getByTestId("gate-value-prop").getAttribute("data-mode")).toBe("steady");
  });

  it("defaults to onboarding mode", () => {
    render(<GateValueProp />);
    expect(screen.getByTestId("gate-value-prop").getAttribute("data-mode")).toBe("onboarding");
  });
});
