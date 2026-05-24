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
    // Sanity guard so a future refactor doesn't accidentally drop the
    // threshold below the strip's natural ~711px content width. If the
    // threshold is too low, the full pill strip clips Integrate at
    // narrow canvas widths (bug visible at viewport=1200 where the
    // canvas pane gives the strip only ~606px). 720 leaves a small
    // breathing buffer over the 711 content sum.
    expect(STEP_STRIP_CONTAINER_COMPACT_THRESHOLD).toBeGreaterThanOrEqual(715);
    expect(STEP_STRIP_CONTAINER_COMPACT_THRESHOLD).toBeLessThan(800);
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
    // Repro: with `flexWrap: "wrap"`, the strip's content totals
    // ~711px at typical viewports. One pixel narrower and the
    // Integrate pill silently wrapped to a second row. The fix is to
    // pin `flex-wrap: nowrap` on the strip's outer container so the
    // pills stay on a single horizontal row regardless of available
    // width; an `overflow-x: auto` lets very narrow viewports scroll
    // instead of stacking.
    //
    // jsdom can't lay out, so we read the emitted CSS from the
    // generated Emotion rules attached to the strip's role=group
    // element, similar to the OnboardingNav divider-height regression.
    render(<StepStrip steps={baseSteps} />);
    const strip = screen.getByRole("group", { name: "Onboarding journey step strip" });
    // Walk the strip + all its descendants → look up rules in document
    // stylesheets → find ANY `flex-wrap` declaration in a rule whose
    // selector matches any of those classes. We accept rule matches by
    // raw cssText substring because Emotion sometimes serializes
    // shorthand properties (e.g. `flex-wrap` under `flex` shorthand)
    // where `rule.style.flexWrap` reads empty. After the container-aware
    // refactor the flex-wrap declaration moved from the outer
    // role=group wrapper to the inner FullStrip body, so we have to
    // crawl descendants.
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
    // Sanity: the strip must actually declare a flex-wrap value (this
    // protects against the test silently passing if the sx prop is
    // dropped entirely).
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
