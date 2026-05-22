import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StepStrip } from "./StepStrip";
import type { StepDescriptor } from "./types";

// MUI Chip + ButtonBase use TouchRipple animations whose deferred setState
// races the test teardown — the global setup throws on any console.error,
// so we override per-test (the global beforeEach runs first; our beforeEach
// replaces its spy with a silent no-op for this spec).
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

describe("StepStrip", () => {
  it("renders all four primary pills + substeps when analyze is active", () => {
    render(<StepStrip steps={baseSteps} />);
    expect(screen.getByText("1 Ingest")).toBeInTheDocument();
    expect(screen.getByText("2 Understand")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
    expect(screen.getByText("4 Integrate")).toBeInTheDocument();
    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("Interact")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
  });

  it("marks active step with aria-current=step", () => {
    render(<StepStrip steps={baseSteps} />);
    expect(screen.getByText("Analyze").closest(".MuiChip-root")).toHaveAttribute("aria-current", "step");
  });

  it("disabled pills get aria-disabled and tooltip text", () => {
    render(<StepStrip steps={baseSteps} />);
    const integrateChip = screen.getByText("4 Integrate").closest(".MuiChip-root");
    expect(integrateChip).toHaveAttribute("aria-disabled", "true");
    expect(integrateChip).toHaveAttribute("title", "Available after sign-in");
  });

  it("clicking a reachable pill fires onStepClick", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    const steps: StepDescriptor[] = [
      { id: "ingest", label: "1 Ingest", state: "done-traversed" },
      { id: "understand", label: "2 Understand", state: "reachable-todo" },
      { id: "analyze", label: "Analyze", state: "disabled" },
      { id: "integrate", label: "4 Integrate", state: "disabled" },
    ];
    render(<StepStrip steps={steps} onStepClick={onStepClick} />);
    await user.click(screen.getByText("2 Understand"));
    expect(onStepClick).toHaveBeenCalledWith("understand");
  });

  it("clicking a disabled pill does NOT fire onStepClick", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(<StepStrip steps={baseSteps} onStepClick={onStepClick} />);
    await user.click(screen.getByText("4 Integrate"));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("done-traversed pill renders the check icon", () => {
    render(<StepStrip steps={baseSteps} />);
    const ingestChip = screen.getByText("1 Ingest").closest(".MuiChip-root");
    expect(ingestChip?.querySelector("svg")).toBeTruthy();
  });

  it("only renders substep bracket when analyze is active AND substeps are provided", () => {
    const steps: StepDescriptor[] = [
      { id: "ingest", label: "1 Ingest", state: "active" },
      { id: "understand", label: "2 Understand", state: "reachable-todo" },
      { id: "analyze", label: "Analyze", state: "reachable-todo", substeps: [] },
      { id: "integrate", label: "4 Integrate", state: "disabled" },
    ];
    render(<StepStrip steps={steps} />);
    expect(screen.queryByText("Extract")).not.toBeInTheDocument();
  });
});
