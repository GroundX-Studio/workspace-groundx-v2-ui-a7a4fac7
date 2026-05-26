import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { STEP_STRIP_CONTAINER_COMPACT_THRESHOLD, StepStrip } from "./StepStrip";
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

  it("exports a container compact threshold matching the full-strip natural width", () => {
    // Trimmed 2026-05-26 (pass-2) from 720 → 660 alongside a ~5%
    // shrink on pill / connector / ANALYZE-bracket padding. The
    // strip's natural width is now ~675 px, so 660 leaves a small
    // buffer below it without firing at typical desktop widths
    // (viewport 947 → header 767 → strip wrapper 735 px, well above
    // 660). Tests below the floor would still hit compact mode, but
    // that's correctly handled by the viewport-driven `compact` prop
    // coming from OnboardingShell when AppShell is in compact mode.
    expect(STEP_STRIP_CONTAINER_COMPACT_THRESHOLD).toBeGreaterThanOrEqual(640);
    expect(STEP_STRIP_CONTAINER_COMPACT_THRESHOLD).toBeLessThan(720);
  });

  it("falls back to the full strip when ResizeObserver is unavailable", () => {
    // jsdom has no ResizeObserver. The component must still render the
    // full strip (degraded but not broken) instead of crashing. We
    // assert the full strip's "ANALYZE" eyebrow renders, which is
    // present only in the full layout, not the compact progress bar.
    render(<StepStrip steps={baseSteps} />);
    expect(screen.getByText("ANALYZE")).toBeInTheDocument();
    // The compact "Step X of Y" copy must NOT appear when the strip
    // is in full mode.
    expect(screen.queryByText(/Step \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("never wraps to a second row — flex-wrap pinned to nowrap (bug fix: at 1305px in Chrome the strip dropped Integrate to a second line)", () => {
    // The strip pins `flex-wrap: nowrap` + `overflow-x: auto` so the
    // pills stay on a single row at any container width; very narrow
    // containers get a horizontal scroll instead of a stacked wrap.
    // Now that the strip is hosted in a header slot spanning chat +
    // canvas (2026-05-26), the wrap-risk window is even smaller.
    render(<StepStrip steps={baseSteps} />);
    const strip = screen.getByRole("group", { name: "Onboarding journey step strip" });
    const descendants = [strip, ...Array.from(strip.querySelectorAll("*"))];
    const classNames = descendants.flatMap((el) =>
      (el as HTMLElement).className.split(/\s+/).filter(Boolean),
    );
    const flexWrapValues: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = (sheet as CSSStyleSheet).cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const matchesElement = classNames.some((cls) =>
          rule.selectorText.includes(`.${cls}`),
        );
        if (!matchesElement) continue;
        const cssText = rule.cssText;
        const match = cssText.match(/flex-wrap:\s*([a-z-]+)/i);
        if (match) flexWrapValues.push(match[1]);
      }
    }
    expect(flexWrapValues.length).toBeGreaterThan(0);
    expect(flexWrapValues).not.toContain("wrap");
    expect(flexWrapValues).toContain("nowrap");
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
