/**
 * `resolvePinTarget` — pure pin-target resolver (2026-05-29-smart-report-screen
 * Phase 5 / smart-report spec "Pin-to-report SHALL ask for a target template —
 * no auto-create").
 *
 * Real callers: the `📌 pin to report` chat affordance (`PinToReportAction`)
 * and the `pin_to_report` LLM tool → `ChatStore.pinToReport`. This resolver
 * decides the **existing-or-new template UX** WITHOUT ever silently
 * auto-creating a template:
 *
 *   • no existing report templates → `prompt-new-only` (the only option is a
 *     new template — the affordance still PROMPTS; it does not auto-create).
 *   • exactly one → `single-existing` (the obvious target, pre-selected).
 *   • two or more → `prompt-existing-or-new` (the user picks one or "new").
 *
 * An explicit `templateId` (e.g. the LLM passed `pin_to_report({template_id})`)
 * short-circuits to `single-existing` on that id — the caller asserted the
 * target, so no prompt is needed.
 *
 * Pure + side-effect-free: it reads the available templates and the input and
 * returns the resolution. The stateful landing (mint a section into the draft
 * overlay) is `ChatStore.pinToReport`, which calls this first.
 */

/** A report template the user could pin into (id + display name). */
export interface PinTargetTemplate {
  id: string;
  name: string;
}

/** What the user pinned — the turn + its (optional) caller-chosen target. */
export interface PinSectionInput {
  /** Explicit target template id, if the caller already chose one. */
  templateId?: string;
}

/**
 * The resolved existing-or-new decision. NEVER includes an auto-created
 * template — `prompt-new-only` means "ask the user to confirm a new one".
 */
export type PinResolution =
  | { mode: "prompt-new-only" }
  | { mode: "single-existing"; templateId: string }
  | { mode: "prompt-existing-or-new"; templates: PinTargetTemplate[] };

/**
 * Resolve the pin target. Pure — no state mutation, no template creation.
 */
export function resolvePinTarget(
  available: readonly PinTargetTemplate[],
  input: PinSectionInput,
): PinResolution {
  if (input.templateId !== undefined) {
    return { mode: "single-existing", templateId: input.templateId };
  }
  if (available.length === 0) {
    return { mode: "prompt-new-only" };
  }
  if (available.length === 1) {
    return { mode: "single-existing", templateId: available[0].id };
  }
  return { mode: "prompt-existing-or-new", templates: [...available] };
}
