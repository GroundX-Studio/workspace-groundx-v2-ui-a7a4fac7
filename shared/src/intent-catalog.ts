import type { CanvasIntent } from "./index";

/**
 * Intent catalog — the SINGLE SOURCE OF TRUTH for intent test/QA coverage.
 *
 * This module is intentionally exported from a DEDICATED subpath
 * (`@groundx/shared/intent-catalog`), NOT the package's `.` runtime entry, so
 * its dev/test data — including live LLM prompts — is excluded from the
 * production bundle. Both the `app` and `middleware` workspaces import it
 * (they cannot import each other's test files), which is why it lives here.
 *
 * It carries DATA only. The layer-specific bits attach by `kind`:
 *   • app:        `intentFixtures` (canned ChatReply triggers + sink assertions)
 *   • middleware: `toolIntentCases` (scripted tool-call → expected DispatchedIntent)
 *   • app:        the `/dev` intent harness (renders + fires fixtures)
 *   • middleware: the on-demand live-LLM suite (sends `llm.prompt` to a real model)
 *
 * See openspec/changes/audit-chat-intent-coverage.
 */

/** Every `kind` in the `canvasIntentSchema` discriminated union. */
export type CanvasIntentKind = CanvasIntent["kind"];

/**
 * How an intent reaches the canvas:
 *   • `viewer-loading` — opens or changes what the canvas shows (doc/frame/region)
 *   • `ux-interaction` — a card/modal/form/gate/wizard/edit, no new doc load
 */
export type IntentClass = "viewer-loading" | "ux-interaction";

/**
 * The LLM-emittability of an intent:
 *   • `false`             — NOT emittable by the model (no tool `intentBuilder`);
 *                           reached only via a UI affordance / suggested action.
 *   • `{ toolName, prompt? }` — emittable: `toolName` is the `SERVER_TOOL_CATALOG`
 *                           tool whose `intentBuilder` produces this `kind`;
 *                           `prompt` (added in Task 5) is a real-model prompt that
 *                           should elicit it. The asserted kind is the entry's own
 *                           `kind` — there is no separate `expectKind`. The
 *                           live-coverage guard requires `prompt` for every
 *                           emittable entry.
 */
export type IntentLlm =
  | false
  | {
      toolName: string;
      prompt?: string;
      /**
       * `false` ⇒ this intent is NOT elicitable from the model in a SINGLE
       * fresh-session turn (it needs prior conversational context — e.g. a
       * pending proposal to accept, or a prior answer to pin). The on-demand
       * live suite SKIPS these with `liveNote` as the reason (NOT a silent
       * gap — they stay fully covered by the FE replay + middleware corpus).
       * Absent ⇒ single-turn elicitable (the live suite asserts it).
       */
      liveSingleTurn?: false;
      /** Required when `liveSingleTurn === false`: why it's skipped live. */
      liveNote?: string;
    };

export interface IntentCatalogEntry {
  kind: CanvasIntentKind;
  class: IntentClass;
  llm: IntentLlm;
}

/**
 * All 30 `canvasIntentSchema` kinds. Reconciled against live code (T1):
 *   • 30 kinds == 30 orchestrator cases (no orphan, no uncased kind)
 *   • 26 are LLM-emittable (have a tool `intentBuilder`)
 *   • 4 are NOT: showSample, openDocument, showCitations, editSchema
 */
export const intentCatalog: IntentCatalogEntry[] = [
  // ── viewer-loading ──────────────────────────────────────────────
  { kind: "showSample", class: "viewer-loading", llm: false },
  { kind: "openDocument", class: "viewer-loading", llm: false },
  { kind: "highlightCitation", class: "viewer-loading", llm: { toolName: "open_document", prompt: "Show me the source in the document for the total amount due." } },
  { kind: "showCitations", class: "viewer-loading", llm: false },
  { kind: "jumpToPage", class: "viewer-loading", llm: { toolName: "jump_to_page", prompt: "Jump the viewer straight to page 2 — just navigate, don't summarize.", liveSingleTurn: false, liveNote: "model inconsistently picks open_document (which also navigates to a page) over the lighter jump_to_page" } },
  { kind: "showExtract", class: "viewer-loading", llm: { toolName: "show_extraction", prompt: "Open the extraction workbench so I can see the extracted fields." } },
  { kind: "showIntegrate", class: "viewer-loading", llm: { toolName: "show_integrate", prompt: "Show me the integration / connector options." } },
  { kind: "showReport", class: "viewer-loading", llm: { toolName: "show_smart_report_render", prompt: "Show me the smart report for this document." } },
  { kind: "editTemplate", class: "viewer-loading", llm: { toolName: "show_smart_report_edit", prompt: "Open the report builder so I can edit the report template." } },
  { kind: "switchFrame", class: "viewer-loading", llm: { toolName: "suggest_intent", prompt: "Switch me to the Interact screen so I can chat with the sources." } },
  // ── ux-interaction ──────────────────────────────────────────────
  { kind: "editSchema", class: "ux-interaction", llm: false },
  { kind: "openGate", class: "ux-interaction", llm: { toolName: "save_to_account", prompt: "I want to save this to my account so I don't lose it — open the save/sign-in step.", liveSingleTurn: false, liveNote: "model answers conversationally about saving rather than reliably calling save_to_account single-turn" } },
  { kind: "proposeSchemaField", class: "ux-interaction", llm: { toolName: "propose_schema_field", prompt: "Add a new field to the schema for the total tax amount." } },
  { kind: "acceptSchemaField", class: "ux-interaction", llm: { toolName: "accept_proposal", prompt: "Yes, accept the proposed field.", liveSingleTurn: false, liveNote: "needs a pending field proposal in context (multi-turn)" } },
  { kind: "rejectSchemaField", class: "ux-interaction", llm: { toolName: "reject_proposal", prompt: "No, reject the proposed field.", liveSingleTurn: false, liveNote: "needs a pending field proposal in context (multi-turn)" } },
  { kind: "commitGate", class: "ux-interaction", llm: { toolName: "commit_gate", prompt: "Sign me up with email and password now." } },
  { kind: "dismissGate", class: "ux-interaction", llm: { toolName: "dismiss_gate", prompt: "Not now, let me keep exploring instead of signing up." } },
  { kind: "openBookCall", class: "ux-interaction", llm: { toolName: "book_call", prompt: "I'd like to speak with a team member and book a call with an engineer." } },
  { kind: "pinToReport", class: "ux-interaction", llm: { toolName: "pin_to_report", prompt: "Pin this answer to my report.", liveSingleTurn: false, liveNote: "needs a prior assistant answer/turn to pin (multi-turn)" } },
  { kind: "proposeReportSection", class: "ux-interaction", llm: { toolName: "propose_report_section", prompt: "Add an anomalies section to the report." } },
  { kind: "acceptReportSection", class: "ux-interaction", llm: { toolName: "accept_report_section", prompt: "Yes, accept the proposed report section.", liveSingleTurn: false, liveNote: "needs a pending report-section proposal in context (multi-turn)" } },
  { kind: "rejectReportSection", class: "ux-interaction", llm: { toolName: "reject_report_section", prompt: "No, reject the proposed report section.", liveSingleTurn: false, liveNote: "needs a pending report-section proposal in context (multi-turn)" } },
  { kind: "editReportSection", class: "ux-interaction", llm: { toolName: "edit_report_section", prompt: "Rename the summary section of the report to 'overview'." } },
  { kind: "deleteReportSection", class: "ux-interaction", llm: { toolName: "delete_report_section", prompt: "Delete the summary section from the report." } },
  { kind: "submitSignup", class: "ux-interaction", llm: { toolName: "submit_signup", prompt: "Create my account: Pat Lee, pat@example.com, password pw12345678.", liveSingleTurn: false, liveNote: "signup is a UI-form action; the model doesn't fabricate + submit credentials from a single chat turn" } },
  { kind: "wizardNext", class: "ux-interaction", llm: { toolName: "wizard_next", prompt: "Continue to the next onboarding step." } },
  { kind: "wizardBack", class: "ux-interaction", llm: { toolName: "wizard_back", prompt: "Go back to the previous onboarding step." } },
  { kind: "wizardFinish", class: "ux-interaction", llm: { toolName: "wizard_finish", prompt: "Finish the onboarding wizard." } },
  { kind: "dismissWizard", class: "ux-interaction", llm: { toolName: "dismiss_wizard", prompt: "Close the onboarding wizard." } },
  { kind: "closeDialog", class: "ux-interaction", llm: { toolName: "close_dialog", prompt: "Close this dialog." } },
];

/** Lookup an entry by kind (throws if unknown — kinds are a closed set). */
export function intentCatalogEntry(kind: CanvasIntentKind): IntentCatalogEntry {
  const entry = intentCatalog.find((e) => e.kind === kind);
  if (!entry) throw new Error(`intentCatalog: no entry for kind "${kind}"`);
  return entry;
}
