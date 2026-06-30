import { describe, expect, it } from "vitest";

import { SAMPLE_TEMPLATE_OWNER } from "../db/seedSampleProject.js";
import { reportTemplateAccess } from "./reportTemplateAccess.js";

/**
 * harden-report-render-template-access T1 — the ONE read-access rule both the
 * builder read endpoint and the live render's template load share.
 */
describe("reportTemplateAccess", () => {
  it("the public sample is readable by anyone but not owned by them", () => {
    expect(reportTemplateAccess({ kind: "report", groundxUsername: SAMPLE_TEMPLATE_OWNER }, "alice")).toEqual({
      accessible: true,
      owned: false,
    });
    expect(reportTemplateAccess({ kind: "report", groundxUsername: SAMPLE_TEMPLATE_OWNER }, null)).toEqual({
      accessible: true,
      owned: false,
    });
  });

  it("a member's own template is accessible AND owned", () => {
    expect(reportTemplateAccess({ kind: "report", groundxUsername: "alice" }, "alice")).toEqual({
      accessible: true,
      owned: true,
    });
  });

  it("another member's template is NOT accessible", () => {
    expect(reportTemplateAccess({ kind: "report", groundxUsername: "bob" }, "alice")).toEqual({
      accessible: false,
      owned: false,
    });
  });

  it("an anonymous caller (empty username) never owns and cannot read a member template", () => {
    expect(reportTemplateAccess({ kind: "report", groundxUsername: "bob" }, "")).toEqual({
      accessible: false,
      owned: false,
    });
    // Defensive: an empty-username caller must not "own" an empty-username row.
    expect(reportTemplateAccess({ kind: "report", groundxUsername: "" }, "")).toEqual({
      accessible: false,
      owned: false,
    });
  });

  it("a non-report template is never accessible via this rule", () => {
    expect(reportTemplateAccess({ kind: "extract", groundxUsername: "alice" }, "alice")).toEqual({
      accessible: false,
      owned: false,
    });
  });
});
