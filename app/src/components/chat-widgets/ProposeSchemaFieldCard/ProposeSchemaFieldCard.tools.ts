/**
 * ProposeSchemaFieldCard — LLM tool declarations.
 *
 * widget-llm-integration follow-up B.1 (2026-05-28): retires the
 * fenced-JSON `proposedSchemaField` envelope by routing the
 * propose / accept / reject lifecycle through native LLM
 * function-calling. All three are mutate-category — the chat router
 * surfaces them on `reply.suggestedActions[]` (per `design.md` §C),
 * and the user confirms via chip click OR the inline Accept / Reject
 * buttons on the card itself.
 *
 * Back-compat: while the A.4 consumer migration is in flight, the
 * middleware mirrors a validated `propose_schema_field` tool call
 * onto `reply.proposedSchemaField` too so the existing inline card
 * render keeps working. A.5 removes the mirror once consumers
 * migrate.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const proposeSchemaField: WidgetTool = {
  name: "propose_schema_field",
  description:
    "Propose adding a new extraction-schema field. Use when the user asks " +
    "to capture an additional value from the documents (add a field for " +
    "total tax, track due date too). The card surfaces inline with " +
    "the assistant bubble for the user to Accept or Reject.",
  category: "mutate",
  input: z.object({
    categoryId: z
      .string()
      .min(1)
      .describe(
        "Existing category id from the active scenario extraction schema (statement, meters).",
      ),
    name: z
      .string()
      .min(1)
      .max(80)
      .describe("Snake_case field id, lowercase (total_tax, due_date)."),
    type: z
      .enum(["STRING", "NUMBER", "DATE", "BOOLEAN"])
      .describe("Primitive type. Must be one of STRING, NUMBER, DATE, BOOLEAN."),
    description: z
      .string()
      .min(1)
      .max(200)
      .describe("One-sentence description of what the field captures, in plain English."),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
  // §5 reachability — this tool's result renders as the inline ProposeSchemaFieldCard
  // (mounted by `conversation/chatPrimitives.tsx` under the assistant bubble).
  rendersWidget: "chat-widgets/ProposeSchemaFieldCard",
};

const acceptProposal: WidgetTool = {
  name: "accept_proposal",
  description:
    "Accept a previously-proposed schema field on behalf of the user. Use when " +
    "an agentic flow has high confidence the user wants the proposal applied " +
    "(auto-accept above a confidence threshold). The user can always " +
    "Reject the chip if they disagree.",
  category: "mutate",
  input: z.object({
    proposalId: z
      .string()
      .min(1)
      .describe("Proposal id (from the pending overlay queue) to accept."),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
};

const rejectProposal: WidgetTool = {
  name: "reject_proposal",
  description:
    "Reject (dismiss) a previously-proposed schema field on behalf of the user. " +
    "Use when an agentic flow determines the proposal does not fit " +
    "the active scenario (the field duplicates an existing column).",
  category: "mutate",
  input: z.object({
    proposalId: z
      .string()
      .min(1)
      .describe("Proposal id (from the pending overlay queue) to reject."),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
};

export const tools: WidgetTool[] = [proposeSchemaField, acceptProposal, rejectProposal];
