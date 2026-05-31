import type { ContentScope, Scenario } from "@/types/onboarding";
import type { NormalizedBbox } from "@groundx/shared";

/**
 * CanvasIntent — discriminated union of every command the canvas can receive.
 *
 * Three intent sources converge (user UI events / agent tool calls / tour
 * state machine), all stamped with `source` and a monotonic `intentId` so the
 * middleware reducer can establish total order. Server-wins on conflict.
 *
 * Extend this union by adding a new variant + registering a matching
 * `CanvasAdapter` via `registerAdapter`. Zod validation guards the wire format
 * at the middleware boundary; the discriminated union enforces compile-time
 * exhaustiveness inside the app.
 */
export type CanvasIntent =
  | { kind: "showSample"; scenario: Scenario }
  | { kind: "openDocument"; documentId: string; page?: number }
  | {
      kind: "highlightCitation";
      documentId: string;
      page: number;
      bbox?: NormalizedBbox;
      /** WF-06b — attribution tier; threaded to the viewer overlay precision. */
      tier?: import("@/types/onboarding").CitationTier;
    }
  /**
   * widget-llm-integration Phase 4 — lighter-weight cousin of
   * `highlightCitation`. Same viewer-step push/swap, but no
   * `bbox` highlight. Produced by `PdfViewer.jump_to_page` (LLM
   * tool) and by future page-navigation affordances inside the
   * viewer pane itself.
   */
  | { kind: "jumpToPage"; documentId: string; page: number }
  | { kind: "showExtract"; scope: ContentScope; schemaId: string }
  | { kind: "editSchema"; schemaId: string }
  // 2026-05-30-onboarding-shell-shared-view Phase 3b — the canvas-dispatch
  // intent for the Integrate connectors surface (frame f7). Mirrors
  // showExtract / showReport: a navigation intent the orchestrator routes to
  // `advanceFrame("f7")`.
  | { kind: "showIntegrate"; scope: ContentScope }
  | { kind: "showReport"; templateId: string; scope: ContentScope }
  /**
   * Open the report builder (f4a) for a template. `selectedSectionId` (when
   * present) is the section the builder pre-opens its inline editor on — the
   * render→builder `✎ edit §N` hand-off and the `show_smart_report_edit` LLM
   * tool both carry it. Omitted → builder opens with no editor expanded.
   */
  | { kind: "editTemplate"; templateId: string; selectedSectionId?: string }
  | { kind: "openGate"; trigger: "save" | "export" | "byo" | "threshold" }
  | { kind: "switchFrame"; frame: import("@/types/onboarding").FFrame }
  /**
   * widget-llm-integration follow-up B.1 — schema-field proposal
   * (the LLM-proposed addition). Replaces the fenced-JSON
   * `proposedSchemaField` envelope. The orchestrator handler
   * routes to `ChatStore.enqueueFieldProposal` so the chat scroll
   * + canvas-side ProposalCard both surface the proposal.
   */
  | {
      kind: "proposeSchemaField";
      categoryId: string;
      name: string;
      type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
      description: string;
    }
  /**
   * widget-llm-integration follow-up B.1 — accept a queued
   * proposal. The orchestrator handler routes to
   * `ChatStore.acceptFieldProposal(proposalId)`.
   */
  | { kind: "acceptSchemaField"; proposalId: string }
  /**
   * widget-llm-integration follow-up B.1 — reject a queued
   * proposal. The orchestrator handler routes to
   * `ChatStore.dismissFieldProposal(proposalId)`.
   */
  | { kind: "rejectSchemaField"; proposalId: string }
  /**
   * widget-llm-integration follow-up B.2 — commit the sign-up
   * gate via a specific method. Orchestrator routes to
   * `OnboardingSessionContext.commitGate(method)`.
   */
  | { kind: "commitGate"; method: "register" | "sso" | "engineer-call" }
  /**
   * widget-llm-integration follow-up B.2 — dismiss the sign-up
   * gate. Orchestrator routes to `OnboardingSessionContext.dismissGate()`.
   */
  | { kind: "dismissGate" }
  /**
   * widget-llm-integration follow-up B.3 — open the Book Call
   * surface by setting `?bookCall=1` on the URL. The
   * OnboardingShell already watches this param to mount
   * `BookCallView` + `BookingStatusCard`. The orchestrator
   * handler manipulates `window.location.search` directly.
   */
  | { kind: "openBookCall" }
  /**
   * 2026-05-29-smart-report-screen Phase 5 — pin an assistant turn
   * into the report as a section. Produced by the `pin_to_report`
   * LLM tool and the `📌 pin to report` chat affordance. The
   * orchestrator routes to `ChatStore.pinToReport` (existing-or-new
   * UX, NO silent auto-create). `text` is the literal turn text
   * (#12); `templateId` is the explicit target when the user chose one.
   */
  | { kind: "pinToReport"; turnId: string; text: string; templateId?: string }
  /**
   * smart-report Phase 5 — an LLM-proposed report section. Produced by
   * `propose_report_section`. The orchestrator routes to
   * `ChatStore.enqueueReportProposal` so the builder surfaces a
   * ProposalCard (the report sibling of `proposeSchemaField`).
   */
  | {
      kind: "proposeReportSection";
      name: string;
      renderAs: "PARAGRAPH" | "BULLETS" | "TABLE";
      question: string;
    }
  /**
   * smart-report Phase 5 — accept a queued report-section proposal.
   * The orchestrator routes to `ChatStore.acceptReportProposal`.
   */
  | { kind: "acceptReportSection"; proposalId: string }
  /**
   * smart-report Phase 5 — reject a queued report-section proposal.
   * The orchestrator routes to `ChatStore.dismissReportProposal`.
   */
  | { kind: "rejectReportSection"; proposalId: string }
  /**
   * smart-report Phase 5 — edit a report section (the chat-driven twin
   * of the builder's inline editor). The orchestrator routes to
   * `ChatStore.editReportSection` (shallow-merge patch). Fields mirror
   * the inline editor: name / renderAs / question / instructions /
   * variables (all optional — a partial patch).
   */
  | {
      kind: "editReportSection";
      sectionId: string;
      name?: string;
      renderAs?: "PARAGRAPH" | "BULLETS" | "TABLE";
      question?: string;
      instructions?: string[];
      variables?: string[];
    }
  /**
   * smart-report Phase 5 — delete a report section (the chat-driven twin
   * of the builder's `⋮ → Remove section`). The orchestrator routes to
   * `ChatStore.removeReportSection`.
   */
  | { kind: "deleteReportSection"; sectionId: string }
  /**
   * 2026-05-31-tool-system-completion (wf04 §1) — submit the F6 sign-up
   * form with the collected identity fields. Produced by the
   * `submit_signup` LLM tool and the SignUpWidget's submit Button (both
   * route to the SAME registered adapter, which runs the widget's own
   * `register` → `claimAnonymousChat` → `promoteToSignedIn` → `commitGate`
   * sequence). Mutate-category: the LLM driving sign-up is a confirmable
   * action, not an auto-run. No-op when no SignUpWidget adapter is mounted.
   */
  | {
      kind: "submitSignup";
      first: string;
      last: string;
      email: string;
      password: string;
      confirmPassword: string;
    }
  /**
   * 2026-05-31-tool-system-completion (wf04 §2) — OnboardingWizard
   * navigation. Produced by the `wizard_next` / `wizard_back` /
   * `wizard_finish` / `dismiss_wizard` LLM tools and the wizard's own nav
   * Buttons (both route to the SAME registered adapter, which calls the
   * OnboardingContext `next` / `back` / `finish` / `closeWithoutCompleting`).
   * Read-style nav → auto-dispatch. No-op when no wizard adapter is mounted.
   */
  | { kind: "wizardNext" }
  | { kind: "wizardBack" }
  | { kind: "wizardFinish" }
  | { kind: "dismissWizard" }
  /**
   * 2026-05-31-tool-system-completion (wf04 §4) — dismiss the active dialog.
   * Produced by the `close_dialog` LLM tool and the `DialogTitle` primitive's
   * close IconButton (both route to the SAME registered adapter, which calls
   * the DialogTitle's `onClose`). Mutate-category. No-op when no DialogTitle
   * adapter is mounted.
   */
  | { kind: "closeDialog" };

export type IntentSource = "user" | "agent" | "tour";

export interface StampedIntent {
  intentId: number;
  source: IntentSource;
  ts: number;
  intent: CanvasIntent;
}

export interface CanvasAdapter<K extends CanvasIntent["kind"] = CanvasIntent["kind"]> {
  kind: K;
  apply: (intent: Extract<CanvasIntent, { kind: K }>) => void | Promise<void>;
}

export interface CanvasOrchestratorApi {
  /** Last successfully applied intent (for diff + telemetry). */
  lastAppliedIntentId: number | null;
  /** Dispatch an intent from any source. Returns the stamped intent. */
  dispatch: (intent: CanvasIntent, source?: IntentSource) => StampedIntent;
  /**
   * Register an adapter for a given intent kind. Replaces a previously
   * registered adapter for the same kind (last registration wins — views
   * register on mount and unregister on unmount).
   */
  registerAdapter: <K extends CanvasIntent["kind"]>(adapter: CanvasAdapter<K>) => () => void;

  // ── post-mvs-cleanup Phase A — chat↔viewer bus ──────────────────────
  //
  // Named convenience channels for cross-side dispatch. They formalize
  // the chat→viewer + viewer→chat seams that previously happened via
  // pointwise wires (component callbacks, ad-hoc store mutations).
  //
  // The legacy `dispatch(intent)` + adapter registry stays — it's the
  // generic surface. These named methods are the curated subset that
  // most cross-side flows go through.

  /**
   * **chat→viewer**: open a citation peek over the current viewer step.
   * Pushes a `{ kind: "citation-peek", documentId, page, bbox? }`
   * overlay onto `viewer.overlays`. The viewer surface renders the
   * peek on top of whatever step is active.
   */
  openCitation: (documentId: string, page: number, bbox?: NormalizedBbox) => void;

  /**
   * **viewer→chat**: announce that a document was just opened in the
   * viewer. Appends an assistant chat message describing the open so
   * the conversation thread carries the user's viewer-side activity
   * (separate from the LLM-context telemetry trail).
   */
  docOpened: (input: { documentId: string; fileName: string }) => void;
}
