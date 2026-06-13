/**
 * SmartReportBuilder — LLM tool declarations (2026-05-29-smart-report-screen
 * Phase 5).
 *
 * The builder's controls are all chat-drivable (smart-report spec "Every report
 * control SHALL be drivable from chat"). These are the SAME shared family as the
 * Extract schema-builder's field-mutation tools — same allowlisted verbs
 * (`show_` / `propose_` / `accept_` / `reject_` / `edit_` / `delete_`), same Zod
 * validation, same chip routing, same both-side mirror — since both operate on
 * the one shared Template lifecycle:
 *
 *   • `show_smart_report_edit` — open the builder (f4a) at a section (the
 *     `_edit` sibling of `show_smart_report_render`). `read`-category nav.
 *   • `propose_report_section` — surface a ProposalCard in the builder.
 *   • `accept_report_section` / `reject_report_section` — act on a queued proposal.
 *   • `edit_report_section` / `delete_report_section` — the chat twins of the
 *     inline editor + `⋮ → Remove`.
 *
 * Middleware `intentBuilder`s emit the SAME `CanvasIntent`s the on-screen
 * controls dispatch, which the orchestrator routes to the identical ChatStore
 * action (`editReportSection`, `removeReportSection`, `enqueueReportProposal`,
 * …). The builder's mouse controls and these mirrored tools therefore perform
 * the same mutation.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

const showSmartReportEdit: WidgetTool = {
  name: "show_smart_report_edit",
  description:
    "Open the Report builder (frame f4a) with a section pre-selected. Use when the " +
    "user asks to edit the report, change a section's question, or you want to surface " +
    "the section editor for a specific section.",
  category: "read",
  input: z.object({
    template_id: z
      .string()
      .min(1)
      .describe("The report template id to open in the builder (the active draft when in onboarding)."),
    selected_section_id: z
      .string()
      .min(1)
      .optional()
      .describe("Optional section id to pre-select / expand in the builder's row list."),
  }),
  // Canvas-NAVIGATION tool — universal, NO availableSteps (Task 7 mirrors the
  // 2026-06-11 server-side decision: navigation tools move the user BETWEEN
  // steps; gating them by the current step defeats their purpose).
};

const proposeReportSection: WidgetTool = {
  name: "propose_report_section",
  description:
    "Propose adding a new report section. Use when the user asks to add a section to " +
    "the report (\"add an anomalies section\", \"include a recommendation\"). A " +
    "ProposalCard surfaces in the builder for the user to Accept or Reject.",
  category: "mutate",
  input: z.object({
    name: z
      .string()
      .min(1)
      .max(80)
      .describe("Snake_case section id, lowercase (anomalies, charge_breakdown)."),
    render_as: z.enum(["PARAGRAPH", "BULLETS", "TABLE"]).describe("How the section body renders: PARAGRAPH paragraph, BULLETS bullet list, TABLE table."),
    question: z
      .string()
      .min(1)
      .max(400)
      .describe("The question this section answers at render time (the literal prompt)."),
  }),
  availableSteps: ["report", "extract-workbench"],
};

const acceptReportSection: WidgetTool = {
  name: "accept_report_section",
  description:
    "Accept a previously-proposed report section on behalf of the user. Use when an " +
    "agentic flow has high confidence the proposed section should be added.",
  category: "mutate",
  input: z.object({
    proposal_id: z
      .string()
      .min(1)
      .describe("Proposal id (from the builder's pending proposal queue) to accept."),
  }),
  availableSteps: ["report", "extract-workbench"],
};

const rejectReportSection: WidgetTool = {
  name: "reject_report_section",
  description:
    "Reject (dismiss) a previously-proposed report section on behalf of the user. Use " +
    "when an agentic flow determines the proposed section does not fit the report.",
  category: "mutate",
  input: z.object({
    proposal_id: z
      .string()
      .min(1)
      .describe("Proposal id (from the builder's pending proposal queue) to reject."),
  }),
  availableSteps: ["report", "extract-workbench"],
};

const editReportSection: WidgetTool = {
  name: "edit_report_section",
  description:
    "Edit an existing report section name, renderAs, question, or instructions. Use " +
    "when the user asks to tweak a section, such as making the summary a bulleted " +
    "list or rephrasing the question. Mirrors the builder inline editor.",
  category: "mutate",
  input: z.object({
    section_id: z.string().min(1).describe("The section id to edit (a draft or saved section)."),
    name: z.string().min(1).max(80).optional().describe("New snake_case section name (optional)."),
    render_as: z.enum(["PARAGRAPH", "BULLETS", "TABLE"]).optional().describe("How the section body renders: PARAGRAPH paragraph, BULLETS bullet list, TABLE table."),
    question: z.string().min(1).max(400).optional().describe("New render-time question (optional)."),
    instructions: z
      .array(z.string())
      .optional()
      .describe("New instruction rules, one per array entry (optional)."),
  }),
  availableSteps: ["report", "extract-workbench"],
};

const deleteReportSection: WidgetTool = {
  name: "delete_report_section",
  description:
    "Delete (remove) a report section from the template. Use when the user asks to drop " +
    "a section (\"remove the recommendation\"). Mirrors the builder's ⋮ → Remove section.",
  category: "mutate",
  input: z.object({
    section_id: z.string().min(1).describe("The section id to remove (a draft or saved section)."),
  }),
  availableSteps: ["report", "extract-workbench"],
};

export const tools: WidgetTool[] = [
  showSmartReportEdit,
  proposeReportSection,
  acceptReportSection,
  rejectReportSection,
  editReportSection,
  deleteReportSection,
];

/**
 * ScopedViewerWidget descriptor for the Report BUILDER surface — the
 * `report-builder` canvas kind (distinct from the render surface's
 * `report` kind). Carries the builder's full chat-drivable tool family.
 * Registered into the production singleton so `<ScopedCanvas>` mounts
 * `SmartReportBuilder` for `report-builder` steps.
 */
export const descriptor = defineScopedViewerWidget({
  id: "smart-report-builder",
  kind: "report-builder",
  slot: "viewer-widgets",
  viewerFrame: {
    chromePolicy: "framed",
    contentMode: "padded-scroll",
    eyebrow: "Report",
    title: "Report builder",
    subtitle: "Edit report sections and review proposed changes for this scope.",
  },
  tools,
});
