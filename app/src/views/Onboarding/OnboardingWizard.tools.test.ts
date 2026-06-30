/**
 * 2026-05-31-tool-system-completion (wf04 §2) — OnboardingWizard nav tools.
 *
 * Four read-style navigation tool metadata declarations. Executable intent
 * construction lives in the middleware `SERVER_TOOL_CATALOG`.
 *
 * This file lives in the view glob-home (`views/**`) opened this change, so the
 * registry + quality scanner discover it in place.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./OnboardingWizard.tools";

describe("OnboardingWizard tools", () => {
  it("declares the four wizard nav tools (read)", () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      "dismiss_wizard",
      "wizard_back",
      "wizard_finish",
      "wizard_next",
    ]);
    expect(tools.every((t) => t.category === "read")).toBe(true);
  });

  it("each tool takes no arguments", () => {
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.wizard_next.input.parse({})).toEqual({});
    expect(byName.wizard_back.input.parse({})).toEqual({});
    expect(byName.wizard_finish.input.parse({})).toEqual({});
    expect(byName.dismiss_wizard.input.parse({})).toEqual({});
  });

  it("each description meets the Phase 5b quality bar", () => {
    for (const t of tools) {
      expect(/use when|triggers when/i.test(t.description)).toBe(true);
      expect(t.description.length).toBeGreaterThanOrEqual(40);
    }
  });
});
