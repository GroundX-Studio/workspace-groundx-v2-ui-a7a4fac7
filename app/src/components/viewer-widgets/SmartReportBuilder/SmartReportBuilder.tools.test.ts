/**
 * SmartReportBuilder.tools — handler contract (2026-05-29-smart-report-screen
 * Phase 5, step-17 follow-up). Asserts the `show_smart_report_edit` input is
 * threaded into the `editTemplate` intent (NOT silently discarded) so the
 * builder pre-selects the named section via its `selectedSectionId` prop.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./SmartReportBuilder.tools";

function toolByName(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe("show_smart_report_edit handler", () => {
  it("threads selected_section_id into the editTemplate intent (not discarded)", () => {
    const tool = toolByName("show_smart_report_edit");
    const input = tool.input.parse({
      template_id: "tpl-1",
      selected_section_id: "charge_breakdown",
    });
    const intent = tool.handler(input);
    expect(intent).toEqual({
      kind: "editTemplate",
      templateId: "tpl-1",
      selectedSectionId: "charge_breakdown",
    });
  });

  it("omits selectedSectionId when not supplied (open builder, no pre-selection)", () => {
    const tool = toolByName("show_smart_report_edit");
    const input = tool.input.parse({ template_id: "tpl-1" });
    const intent = tool.handler(input);
    expect(intent).toEqual({ kind: "editTemplate", templateId: "tpl-1" });
    expect("selectedSectionId" in (intent as Record<string, unknown>)).toBe(false);
  });
});
