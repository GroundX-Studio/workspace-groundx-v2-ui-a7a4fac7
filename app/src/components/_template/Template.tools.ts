/**
 * Widget Template — canonical LLM tool declaration.
 *
 * **COPY THIS FILE** alongside `Template.tsx` and rename to
 * `<Name>.tools.ts`. Replace the two stub tools below with the real
 * actions the widget supports. The four floor rules (per design.md §F
 * and Phase 5b's `check-tool-quality.mjs` script) apply to every tool:
 *
 *   1. **Globally unique name.** snake_case, allowlisted verb prefix
 *      (`open_`, `jump_`, `propose_`, `accept_`, `dismiss_`, `save_`,
 *      `send_`, `pick_`, `pivot_`, `highlight_`, `commit_`, `book_`,
 *      `edit_`, `pin_`, `run_`, `reject_`, `cancel_`, `delete_`).
 *   2. **Description quality.** ≥ 40 chars AND contains `Use when`
 *      or `Triggers when`. The "Use when" clause is the single most
 *      impactful field for LLM tool-selection accuracy.
 *   3. **Per-parameter `.describe()`.** Every Zod field on `input`
 *      carries a non-empty `.describe(...)` call.
 *   4. **Category.** `read` for navigation / focus / highlight (auto-
 *      execute). `mutate` for any persisted change (renders as a chip /
 *      card; user must confirm). Mutate handlers return `null` from
 *      `handler` to signal "raise a chip, don't dispatch now."
 *
 * Alternative: opt out by deleting this file and creating a sibling
 * `no-llm.md` with a `## Why` section. The drift guard (Phase 6)
 * fails on widgets that ship neither.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

/**
 * Example `read` tool. Navigation / focus only — auto-executes on
 * LLM invocation. Replace with the widget's real read surface.
 */
const editTemplate: WidgetTool = {
  name: "edit_template",
  description:
    "Open the template widget's edit affordance. Use when the user asks to edit or modify the template's label.",
  category: "mutate",
  input: z.object({
    label: z
      .string()
      .min(1)
      .max(120)
      .describe("New label text the user wants to show on the template widget"),
  }),
  // Mutate tools return null — the chat router emits them onto
  // suggestedActions[] instead of dispatching directly. Phase 1's
  // SuggestedActionChips widget renders them as Accept chips.
  handler: () => null,
  availableIn: ["steady"], // edit is locked in onboarding
  availableSteps: ["doc-viewer", "extract-workbench"],
};

/**
 * Example `read` tool. Replace or extend per the real widget.
 */
const openTemplate: WidgetTool = {
  name: "open_template",
  description:
    "Bring the template widget into focus. Use when the user asks to see or open the template panel.",
  category: "read",
  input: z.object({}),
  // Read tools return a CanvasIntent for immediate dispatch. The
  // example below is illustrative — replace `switchFrame` with the
  // real intent the widget needs.
  handler: () => ({ kind: "switchFrame", frame: "f3" }),
};

export const tools: WidgetTool[] = [openTemplate, editTemplate];
