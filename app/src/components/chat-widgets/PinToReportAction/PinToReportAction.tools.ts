/**
 * PinToReportAction — LLM tool declaration (2026-05-29-smart-report-screen
 * Phase 5).
 *
 * `pin_to_report({ turn_id, text, template_id? })` is the chat twin of the
 * `📌 pin to report` button. It pins the assistant turn's LITERAL text (#12 —
 * no auto-variable inference) as a report section. When no `template_id` is
 * supplied the surface prompts the existing-or-new UX (NO silent auto-create);
 * an explicit `template_id` targets that template.
 *
 * Middleware `intentBuilder` emits the SAME `pinToReport` `CanvasIntent` the
 * button dispatches → the orchestrator routes to `ChatStore.pinToReport`, so
 * the mirrored tool performs the identical mutation as the on-screen control.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const pinToReport: WidgetTool = {
  name: "pin_to_report",
  description:
    "Pin an assistant answer into the report as a section. Use when the user says " +
    "\"pin that\", \"add this to the report\", or you've reasoned a turn's answer belongs " +
    "in the IC brief. The turn's literal text becomes the section's question.",
  category: "mutate",
  input: z.object({
    turn_id: z
      .string()
      .min(1)
      .describe("The assistant turn id being pinned (recorded as the section's source provenance)."),
    text: z
      .string()
      .min(1)
      .describe("The turn's literal text — becomes the pinned section's question (#12, no variable inference)."),
    template_id: z
      .string()
      .min(1)
      .optional()
      .describe("Explicit target template id; omit to prompt the user existing-or-new (no auto-create)."),
  }),
  availableSteps: ["interact-chat", "doc-viewer", "extract-workbench", "report"],
};

export const tools: WidgetTool[] = [pinToReport];
