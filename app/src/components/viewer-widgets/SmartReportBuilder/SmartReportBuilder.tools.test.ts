/**
 * SmartReportBuilder.tools — app metadata contract. Asserts the
 * `show_smart_report_edit` input schema preserves `selected_section_id`; the
 * executable intent builder lives in the middleware `SERVER_TOOL_CATALOG`.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./SmartReportBuilder.tools";

function toolByName(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe("show_smart_report_edit metadata", () => {
  it("accepts selected_section_id in the metadata schema", () => {
    const tool = toolByName("show_smart_report_edit");
    const input = tool.input.parse({
      template_id: "tpl-1",
      selected_section_id: "charge_breakdown",
    });
    expect(input).toEqual({
      template_id: "tpl-1",
      selected_section_id: "charge_breakdown",
    });
  });

  it("omits selected_section_id when not supplied", () => {
    const tool = toolByName("show_smart_report_edit");
    const input = tool.input.parse({ template_id: "tpl-1" });
    expect(input).toEqual({ template_id: "tpl-1" });
    expect("selected_section_id" in (input as Record<string, unknown>)).toBe(false);
  });
});
