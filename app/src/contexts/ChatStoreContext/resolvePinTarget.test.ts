/**
 * `resolvePinTarget` — pure pin-target resolver (2026-05-29-smart-report-screen
 * Phase 5). The pin affordance + the `pin_to_report` tool are its real callers
 * (re-added here per "name the 2nd real caller before abstracting"). Decides
 * the existing-or-new UX WITHOUT ever auto-creating a template:
 *
 *   • no existing report templates → `prompt-new-only`
 *   • exactly one → `single-existing` (the obvious target)
 *   • two or more → `prompt-existing-or-new` (the user picks)
 *
 * An explicit `templateId` short-circuits to `single-existing` on that id.
 */

import { describe, expect, it } from "vitest";

import { resolvePinTarget, type PinTargetTemplate } from "./resolvePinTarget";

const one: PinTargetTemplate = { id: "tpl-1", name: "IC Brief" };
const two: PinTargetTemplate = { id: "tpl-2", name: "Risk Memo" };

describe("resolvePinTarget (pure)", () => {
  it("no existing templates → prompt-new-only (NEVER auto-create)", () => {
    expect(resolvePinTarget([], {})).toEqual({ mode: "prompt-new-only" });
  });

  it("exactly one template → single-existing on that template", () => {
    expect(resolvePinTarget([one], {})).toEqual({
      mode: "single-existing",
      templateId: "tpl-1",
    });
  });

  it("two or more templates → prompt-existing-or-new with the choices", () => {
    expect(resolvePinTarget([one, two], {})).toEqual({
      mode: "prompt-existing-or-new",
      templates: [one, two],
    });
  });

  it("an explicit templateId short-circuits to single-existing on that id", () => {
    expect(resolvePinTarget([one, two], { templateId: "tpl-2" })).toEqual({
      mode: "single-existing",
      templateId: "tpl-2",
    });
  });

  it("an explicit templateId not in the list is still honored (caller-asserted)", () => {
    expect(resolvePinTarget([], { templateId: "tpl-9" })).toEqual({
      mode: "single-existing",
      templateId: "tpl-9",
    });
  });
});
