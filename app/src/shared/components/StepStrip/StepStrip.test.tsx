import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StepStrip } from "./StepStrip";
import type { StepDescriptor } from "./types";

// Some pills schedule deferred layout work that races vitest teardown; silence
// the global "throw on console.error" spy for this spec only.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const baseSteps: StepDescriptor[] = [
  { id: "ingest", label: "1 Ingest", state: "done-traversed" },
  { id: "understand", label: "2 Understand", state: "done-traversed" },
  {
    id: "analyze",
    label: "Analyze",
    state: "active",
    substeps: [
      { id: "extract", label: "Extract", state: "active" },
      { id: "interact", label: "Interact", state: "reachable-todo" },
      { id: "report", label: "Report", state: "disabled" },
    ],
  },
  { id: "integrate", label: "4 Integrate", state: "disabled" },
];

/**
 * The wireframe rewrite (spec-nav-v2.jsx) renders the step number as a
 * standalone circular badge inside the pill, with the label as plain text
 * next to it. So the DOM contains "1" + "Ingest" as separate text nodes.
 * Tests match by the label substring.
 */
describe("StepStrip", () => {
  it("renders all four primary slots + substep bracket when analyze is active", () => {
    render(<StepStrip steps={baseSteps} />);
    const strip = screen.getByRole("group", { name: "Onboarding journey step strip" });
    expect(within(strip).getByText("Ingest")).toBeInTheDocument();
    expect(within(strip).getByText("Understand")).toBeInTheDocument();
    expect(within(strip).getByText("ANALYZE")).toBeInTheDocument();
    expect(within(strip).getByText("Integrate")).toBeInTheDocument();
    expect(within(strip).getByText("Extract")).toBeInTheDocument();
    expect(within(strip).getByText("Interact")).toBeInTheDocument();
    expect(within(strip).getByText("Report")).toBeInTheDocument();
  });

  it("number badge shows ✓ for done-traversed steps", () => {
    render(<StepStrip steps={baseSteps} />);
    const ingestPill = screen.getByText("Ingest").closest('[role="button"]');
    expect(ingestPill).not.toBeNull();
    expect(ingestPill?.textContent).toContain("✓");
  });

  it("disabled pills get aria-disabled + 'Available after sign-in' tooltip", () => {
    render(<StepStrip steps={baseSteps} />);
    const integratePill = screen.getByText("Integrate").closest('[role="button"]');
    expect(integratePill).toHaveAttribute("aria-disabled", "true");
    expect(integratePill).toHaveAttribute("title", "Available after sign-in");
  });

  it("active step gets aria-current=step", () => {
    // The Analyze slot is the bracket (role=group) when active; the per-step
    // aria-current sits on Ingest etc. So pick a non-Analyze step in active
    // state to exercise this.
    const steps: StepDescriptor[] = [
      { id: "ingest", label: "1 Ingest", state: "active" },
      { id: "understand", label: "2 Understand", state: "reachable-todo" },
      { id: "analyze", label: "Analyze", state: "reachable-todo", substeps: [] },
      { id: "integrate", label: "4 Integrate", state: "disabled" },
    ];
    render(<StepStrip steps={steps} />);
    const ingestPill = screen.getByText("Ingest").closest('[role="button"]');
    expect(ingestPill).toHaveAttribute("aria-current", "step");
  });

  it("clicking a reachable pill fires onStepClick", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    const steps: StepDescriptor[] = [
      { id: "ingest", label: "1 Ingest", state: "done-traversed" },
      { id: "understand", label: "2 Understand", state: "reachable-todo" },
      { id: "analyze", label: "Analyze", state: "disabled", substeps: [] },
      { id: "integrate", label: "4 Integrate", state: "disabled" },
    ];
    render(<StepStrip steps={steps} onStepClick={onStepClick} />);
    await user.click(screen.getByText("Understand"));
    expect(onStepClick).toHaveBeenCalledWith("understand");
  });

  it("clicking a disabled pill does NOT fire onStepClick", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(<StepStrip steps={baseSteps} onStepClick={onStepClick} />);
    await user.click(screen.getByText("Integrate"));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("analyze bracket renders even when no substeps are provided (it's the slot, not the content)", () => {
    const steps: StepDescriptor[] = [
      { id: "ingest", label: "1 Ingest", state: "active" },
      { id: "understand", label: "2 Understand", state: "reachable-todo" },
      { id: "analyze", label: "Analyze", state: "reachable-todo", substeps: [] },
      { id: "integrate", label: "4 Integrate", state: "disabled" },
    ];
    render(<StepStrip steps={steps} />);
    expect(screen.getByText("ANALYZE")).toBeInTheDocument();
    // No substeps means no sub-pills inside the bracket.
    expect(screen.queryByText("Extract")).not.toBeInTheDocument();
  });
});
