/**
 * widget-llm-integration Phase 5 — middleware-side tool catalog.
 *
 * Hand-mirrors the app-side `<Name>.tools.ts` declarations (per user
 * pick 2026-05-27). The server doesn't run the app-side handlers —
 * it validates the LLM's emitted arguments, constructs the equivalent
 * `CanvasIntent`, and ships it on the chat reply for the app to
 * dispatch via the canvas orchestrator.
 *
 * Drift mitigation:
 *   • `toolCatalog.test.ts` asserts the name set matches the expected
 *     authoritative list. Adding a new tool on the app side without
 *     mirroring here turns the test red.
 *   • Phase 7 backfill will hand-mirror every tool it touches and
 *     extend the expected set.
 *   • The longer-term shape (design.md §I) is a committed JSON
 *     manifest generated from the app-side files; that lands when
 *     the catalog grows past ~10 tools.
 */
import { z } from "zod";

import { viewerStepKindSchema, type ViewerStepKind, type WidgetRole } from "@groundx/shared";

export type { ViewerStepKind, WidgetRole };

/**
 * Server-side tool descriptor. The `intentBuilder` produces the
 * `CanvasIntent` shape the app's orchestrator dispatches. The
 * `inputSchema` validates LLM-emitted args at the middleware boundary
 * (design.md §G).
 */
export interface ServerTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  category: "read" | "mutate";
  inputSchema: TSchema;
  /**
   * ViewerStep kinds where this tool is exposed to the LLM. Empty /
   * undefined → exposed in every step.
   */
  availableSteps?: ViewerStepKind[];
  /**
   * 2026-05-31-tool-system-completion — the AUTHORIZATION roles this tool is
   * exposed to in the LLM-facing catalog. `WidgetRole` (`@groundx/shared`) is
   * the ONE role enum (`anonymous` | `member`). Rule (composed with
   * `availableSteps`): a tool is exposed IFF (`availableIn` undefined/empty →
   * ALL roles) OR the caller's role ∈ `availableIn`. `category`
   * (read/mutate) drives the confirmation model, NOT visibility. The caller's
   * role is derived SERVER-side from the chat session (never client-trusted) —
   * see `chatHandler.ts` → `ChatRouterRequest.callerRole`.
   *
   * The SERVER catalog is the SOLE role-bearing surface (the app-side
   * `WidgetTool.availableIn` orphan is not migrated — gate-answered decision
   * (b)). Today no SHIPPED tool is role-restricted; the matrix's lone
   * `edit_template = ["member"]` is the `_template` stub, not shipped. Set this
   * deliberately per `docs/agents/widget-access-matrix.md` §3 when a real
   * role-restricted tool ships.
   */
  availableIn?: WidgetRole[];
  /** Builds the CanvasIntent shape from validated input. */
  intentBuilder: (input: z.infer<TSchema>) => Record<string, unknown>;
}

/**
 * True iff the tool is exposed to `role`. `availableIn` undefined/empty → all
 * roles; otherwise role must be listed. The single role-visibility predicate
 * — `toolsForStep` composes it with the step filter, and the parity guard
 * uses the same rule. `category` does NOT participate.
 */
export function roleExposes(tool: ServerTool, role: WidgetRole): boolean {
  if (!tool.availableIn || tool.availableIn.length === 0) return true;
  return tool.availableIn.includes(role);
}

// `ViewerStepKind` is now the ONE shared definition (`@groundx/shared`,
// re-exported above) — app `ViewerStep["kind"]` and this catalog share it, with
// the app-side `ViewerStepKind.contract.test` guarding exact equality. (Was a
// hand-typed cross-workspace mirror, possible to dedupe now that the shared
// package exists.)

// ── Tool declarations (hand-mirrored from app side) ──────────────────

/**
 * Mirror of `viewer-widgets/PdfViewer/PdfViewerWidget.tools.ts` →
 * `open_document`. Produces a `highlightCitation` intent.
 */
const openDocument: ServerTool = {
  name: "open_document",
  description:
    "Open a document in the viewer pane. Use when the user references a document " +
    "by name, asks to see a source, or you are about to cite the document and want " +
    "the source visible while the user reads your answer.",
  category: "read",
  inputSchema: z.object({
    documentId: z
      .string()
      .min(1)
      .describe("GroundX document UUID — the canonical identifier returned by ingestion"),
    page: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional 1-indexed page to open at; defaults to page 1 when omitted"),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "highlightCitation",
    documentId: input.documentId,
    page: input.page ?? 1,
  }),
};

/**
 * Mirror of `viewer-widgets/PdfViewer/PdfViewerWidget.tools.ts` →
 * `jump_to_page`. Produces a `jumpToPage` intent (lighter-weight
 * cousin of highlightCitation, no bbox).
 */
const jumpToPage: ServerTool = {
  name: "jump_to_page",
  description:
    "Jump the active viewer to a specific page of the currently-open document. " +
    "Use when the user references a page number directly (\"go to page 7\") or " +
    "when you've reasoned about a span and want to surface the exact page without " +
    "a region highlight.",
  category: "read",
  inputSchema: z.object({
    documentId: z
      .string()
      .min(1)
      .describe("GroundX document UUID — must match the currently-open viewer document"),
    page: z
      .number()
      .int()
      .positive()
      .describe("1-indexed page to scroll to; the viewer renders this page as active"),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "jumpToPage",
    documentId: input.documentId,
    page: input.page,
  }),
};

/**
 * widget-llm-integration follow-up B.1 — ProposeSchemaFieldCard
 * mirrors. Three mutate-category tools that replace the fenced-JSON
 * `proposedSchemaField` envelope.
 */
const fieldTypeEnum = z
  .enum(["STRING", "NUMBER", "DATE", "BOOLEAN"])
  .describe("Primitive type — must be one of STRING, NUMBER, DATE, BOOLEAN");

const proposeSchemaField: ServerTool = {
  name: "propose_schema_field",
  description:
    "Propose adding a new extraction-schema field. Use when the user asks " +
    "to capture an additional value from the documents (\"add a field for " +
    "total tax\", \"track due date too\"). The card surfaces inline with " +
    "the assistant bubble for the user to Accept or Reject.",
  category: "mutate",
  inputSchema: z.object({
    categoryId: z
      .string()
      .min(1)
      .describe("Existing category id from the active scenario's extraction schema"),
    name: z.string().min(1).max(80).describe("Snake_case field id, lowercase"),
    type: fieldTypeEnum,
    description: z.string().min(1).max(200).describe("One-sentence description"),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "proposeSchemaField",
    categoryId: input.categoryId,
    name: input.name,
    type: input.type,
    description: input.description,
  }),
};

const acceptProposal: ServerTool = {
  name: "accept_proposal",
  description:
    "Accept a previously-proposed schema field on the user's behalf. Use when " +
    "an agentic flow has high confidence the user wants the proposal applied.",
  category: "mutate",
  inputSchema: z.object({
    proposalId: z.string().min(1).describe("Proposal id from the pending overlay queue"),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "acceptSchemaField",
    proposalId: input.proposalId,
  }),
};

const rejectProposal: ServerTool = {
  name: "reject_proposal",
  description:
    "Reject (dismiss) a previously-proposed schema field on the user's " +
    "behalf. Use when an agentic flow determines the proposal doesn't fit.",
  category: "mutate",
  inputSchema: z.object({
    proposalId: z.string().min(1).describe("Proposal id from the pending overlay queue"),
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "rejectSchemaField",
    proposalId: input.proposalId,
  }),
};

/**
 * widget-llm-integration follow-up B.2 — GateChatRail mirrors.
 */
const commitGate: ServerTool = {
  name: "commit_gate",
  description:
    "Commit the active sign-up gate via a specific identity method. " +
    "Use when the user has explicitly chosen the path forward.",
  category: "mutate",
  inputSchema: z.object({
    method: z
      .enum(["register", "sso", "engineer-call"])
      .describe("Which gate-commit path: register / sso / engineer-call"),
  }),
  intentBuilder: (input) => ({ kind: "commitGate", method: input.method }),
};

const dismissGate: ServerTool = {
  name: "dismiss_gate",
  description:
    "Dismiss the active sign-up gate without committing. Use when the " +
    "user has indicated they want to keep exploring without signing up.",
  category: "mutate",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "dismissGate" }),
};

/**
 * 2026-05-31-shared-canvas-affordance-restoration — mirror of the app-side
 * `GateChatRail.tools.ts` → `save_to_account`. The chat-driven successor to the
 * retired F5 Interact "Save" button: opens the sign-in gate (the `openGate`
 * intent the orchestrator routes to `OnboardingSession.openGate("save")`).
 * Exposed on the analysis surfaces a user saves from (doc-viewer / interact).
 */
const saveToAccount: ServerTool = {
  name: "save_to_account",
  description:
    "Open the sign-in offer so the user can save their current analysis to an " +
    "account. Use when the user says \"save\", \"keep this\", or asks to save " +
    "their progress but has NOT yet entered sign-up details (use submit_signup " +
    "once they have). Surfaces the gate; it does not create the account.",
  category: "mutate",
  inputSchema: z.object({}),
  availableSteps: ["doc-viewer", "interact-chat"],
  intentBuilder: () => ({ kind: "openGate", trigger: "save" }),
};

/**
 * widget-llm-integration follow-up A.2 — `suggest_intent` is a
 * server-only catalog entry (no widget owns it). Replaces the
 * legacy fenced-JSON `suggestedIntent` envelope.
 *
 * The LLM emits a tool call with `{ intent, reason, confidence? }`
 * where `intent` is a short canvas-navigation label
 * (`show-extract` / `show-report` / `show-interact`). The chat
 * router surfaces it as a `tool:suggest_intent` chip — the app-
 * side `suggestedActionToIntent` mapper resolves the string label
 * against the active scenario context (which the server doesn't
 * have) into a concrete `CanvasIntent` (e.g. `switchFrame` to f3
 * for `show-extract`).
 *
 * Routing as `mutate` so it surfaces on `suggestedActions[]` for
 * user click confirmation — the chip IS the suggestion. The
 * `intentBuilder` returns the same `switchFrame` mapping the app
 * side uses, as a server-side default. The app's chip handler
 * prefers `detail.arguments.intent` (the string label) over
 * `detail.intent` (the constructed placeholder) for this specific
 * tool, so the mapping stays accurate even if a future scenario
 * needs a different shape.
 */
const suggestIntent: ServerTool = {
  name: "suggest_intent",
  description:
    "Suggest a canvas navigation the user might want next. Use when " +
    "you've reasoned that the user's question naturally leads to " +
    "another surface (\"open the extract to compare line items\", " +
    "\"check the report for the rollup\"). The chip surfaces the " +
    "suggestion; the user clicks to navigate.",
  category: "mutate",
  inputSchema: z.object({
    intent: z
      .string()
      .min(1)
      .describe(
        "Kebab-case canvas intent label: \"show-extract\" / \"show-report\" / \"show-interact\".",
      ),
    reason: z
      .string()
      .min(1)
      .max(200)
      .describe("Short user-facing reason shown on the chip."),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Model confidence 0-1; the client may gate chip rendering at a threshold."),
  }),
  intentBuilder: (input) => {
    const frameByLabel: Record<string, "f3" | "f4" | "f5"> = {
      "show-extract": "f3",
      "show-report": "f4",
      "show-interact": "f5",
    };
    const frame = frameByLabel[input.intent] ?? "f5";
    return { kind: "switchFrame", frame };
  },
};

/**
 * widget-llm-integration follow-up B.3 — BookingStatusCard mirror.
 */
const bookCall: ServerTool = {
  name: "book_call",
  description:
    "Open the Calendly booking surface for a 15-minute engineer call. " +
    "Use when the user signals they want a human-assisted path forward.",
  category: "mutate",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "openBookCall" }),
};

// ── 2026-05-29-smart-report-screen Phase 5 — report tool surface ─────
//
// Hand-mirrors the app-side `SmartReportRender.tools.ts` /
// `SmartReportBuilder.tools.ts` / `PinToReportAction.tools.ts`. The `show_`
// canvas-dispatch verb is the canonical verb for ScopedViewerWidgets
// (allowlisted once in the app's `check-tool-quality` this phase). The report
// + Extract template-mutation tools are a SHARED family (same Template+Scope+
// Results lifecycle). `scope` is the shared `ContentScope` — kept loose here
// (`z.object({}).passthrough()`) because the server doesn't re-validate the
// scope shape (the app + shared Zod own it); the drift guard only pins names.

const reportRenderAsEnum = z
  .enum(["PARAGRAPH", "BULLETS", "TABLE"])
  .describe("How the section body renders: PARAGRAPH (¶) / BULLETS (•) / TABLE (▦).");

const showExtraction: ServerTool = {
  name: "show_extraction",
  description:
    "Move the canvas to the extraction workbench (frame f3) for a scope. Use when " +
    "the user asks to see the extracted fields, says \"show the extraction\", or you've " +
    "reasoned the structured-field view is the natural next surface for what they're analyzing.",
  category: "read",
  inputSchema: z.object({
    scope: z
      .object({})
      .passthrough()
      .describe("The ContentScope the workbench extracts over (documents / bucket+filter / group)."),
    schema_id: z
      .string()
      .min(1)
      .optional()
      .describe("Optional extraction template id; defaults to the active draft template when omitted."),
  }),
  availableSteps: ["extract-workbench", "doc-viewer", "interact-chat", "report"],
  intentBuilder: (input) => ({
    kind: "showExtract",
    scope: (input as { scope: unknown }).scope,
    schemaId: (input as { schema_id?: string }).schema_id ?? "draft",
  }),
};

// onboarding-shell-shared-view Phase 3b — mirror of the app-side Integrate
// widget's show_integrate canvas-dispatch tool. Moves the canvas to the
// Integrate connectors surface (frame f7). Returns the `showIntegrate`
// CanvasIntent the orchestrator routes to advanceFrame("f7").
const showIntegrate: ServerTool = {
  name: "show_integrate",
  description:
    "Move the canvas to the Integrate surface (frame f7) — the connectors / agent " +
    "plugins + API snippets for shipping this sample into a stack. Use when " +
    "the user asks to integrate, ship, connect an agent (Claude / OpenAI / Gemini / " +
    "Cursor), or get the API / SDK snippet for the content being analyzed.",
  category: "read",
  inputSchema: z.object({
    scope: z
      .object({})
      .passthrough()
      .describe("The ContentScope the user is shipping (documents / bucket+filter / group); scope-independent today but threaded for context."),
  }),
  availableSteps: ["integrate", "doc-viewer", "extract-workbench", "interact-chat", "report"],
  intentBuilder: (input) => ({
    kind: "showIntegrate",
    scope: (input as { scope: unknown }).scope,
  }),
};

const showSmartReportRender: ServerTool = {
  name: "show_smart_report_render",
  description:
    "Move the canvas to the Report render surface (frame f4) for a scope. Use when " +
    "the user asks to see the report, says \"make me a report\", or you've reasoned a " +
    "rendered IC-brief is the natural next surface for what they're analyzing.",
  category: "read",
  inputSchema: z.object({
    scope: z
      .object({})
      .passthrough()
      .describe("The render-time ContentScope the report renders over (bucket+filter / documents / group)."),
    template_id: z
      .string()
      .min(1)
      .optional()
      .describe("Optional report template id; defaults to the active draft template when omitted."),
  }),
  availableSteps: ["report", "extract-workbench", "interact-chat", "doc-viewer"],
  intentBuilder: (input) => ({
    kind: "showReport",
    templateId: (input as { template_id?: string }).template_id ?? "draft",
    scope: (input as { scope: unknown }).scope,
  }),
};

const showSmartReportEdit: ServerTool = {
  name: "show_smart_report_edit",
  description:
    "Open the Report builder (frame f4a) with a section pre-selected. Use when the " +
    "user asks to edit the report, change a section's question, or you want to surface " +
    "the section editor for a specific section.",
  category: "read",
  inputSchema: z.object({
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
  availableSteps: ["report", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "editTemplate",
    templateId: input.template_id,
    ...(input.selected_section_id !== undefined
      ? { selectedSectionId: input.selected_section_id }
      : {}),
  }),
};

const pinToReport: ServerTool = {
  name: "pin_to_report",
  description:
    "Pin an assistant answer into the report as a section. Use when the user says " +
    "\"pin that\", \"add this to the report\", or you've reasoned a turn's answer belongs " +
    "in the IC brief. The turn's literal text becomes the section's question.",
  category: "mutate",
  inputSchema: z.object({
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
  intentBuilder: (input) => ({
    kind: "pinToReport",
    turnId: input.turn_id,
    text: input.text,
    ...(input.template_id !== undefined ? { templateId: input.template_id } : {}),
  }),
};

const proposeReportSection: ServerTool = {
  name: "propose_report_section",
  description:
    "Propose adding a new report section. Use when the user asks to add a section to " +
    "the report (\"add an anomalies section\", \"include a recommendation\"). A " +
    "ProposalCard surfaces in the builder for the user to Accept or Reject.",
  category: "mutate",
  inputSchema: z.object({
    name: z.string().min(1).max(80).describe("Snake_case section id, lowercase (anomalies, charge_breakdown)."),
    render_as: reportRenderAsEnum,
    question: z
      .string()
      .min(1)
      .max(400)
      .describe("The question this section answers at render time (the literal prompt)."),
  }),
  availableSteps: ["report", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "proposeReportSection",
    name: input.name,
    renderAs: input.render_as,
    question: input.question,
  }),
};

const acceptReportSection: ServerTool = {
  name: "accept_report_section",
  description:
    "Accept a previously-proposed report section on the user's behalf. Use when an " +
    "agentic flow has high confidence the user wants the proposed section added.",
  category: "mutate",
  inputSchema: z.object({
    proposal_id: z.string().min(1).describe("Proposal id (from the builder's pending proposal queue) to accept."),
  }),
  availableSteps: ["report", "extract-workbench"],
  intentBuilder: (input) => ({ kind: "acceptReportSection", proposalId: input.proposal_id }),
};

const rejectReportSection: ServerTool = {
  name: "reject_report_section",
  description:
    "Reject (dismiss) a previously-proposed report section on the user's behalf. Use " +
    "when an agentic flow determines the proposed section does not fit the report.",
  category: "mutate",
  inputSchema: z.object({
    proposal_id: z.string().min(1).describe("Proposal id (from the builder's pending proposal queue) to reject."),
  }),
  availableSteps: ["report", "extract-workbench"],
  intentBuilder: (input) => ({ kind: "rejectReportSection", proposalId: input.proposal_id }),
};

const editReportSection: ServerTool = {
  name: "edit_report_section",
  description:
    "Edit an existing report section's name / renderAs / question / instructions. Use " +
    "when the user asks to tweak a section (\"make the summary a bulleted list\", " +
    "\"rephrase the anomalies question\"). Mirrors the builder's inline editor.",
  category: "mutate",
  inputSchema: z.object({
    section_id: z.string().min(1).describe("The section id to edit (a draft or saved section)."),
    name: z.string().min(1).max(80).optional().describe("New snake_case section name (optional)."),
    render_as: reportRenderAsEnum.optional(),
    question: z.string().min(1).max(400).optional().describe("New render-time question (optional)."),
    instructions: z.array(z.string()).optional().describe("New instruction rules, one per array entry (optional)."),
  }),
  availableSteps: ["report", "extract-workbench"],
  intentBuilder: (input) => ({
    kind: "editReportSection",
    sectionId: input.section_id,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.render_as !== undefined ? { renderAs: input.render_as } : {}),
    ...(input.question !== undefined ? { question: input.question } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
  }),
};

const deleteReportSection: ServerTool = {
  name: "delete_report_section",
  description:
    "Delete (remove) a report section from the template. Use when the user asks to drop " +
    "a section (\"remove the recommendation\"). Mirrors the builder's ⋮ → Remove section.",
  category: "mutate",
  inputSchema: z.object({
    section_id: z.string().min(1).describe("The section id to remove (a draft or saved section)."),
  }),
  availableSteps: ["report", "extract-workbench"],
  intentBuilder: (input) => ({ kind: "deleteReportSection", sectionId: input.section_id }),
};

// ── 2026-05-31-tool-system-completion — wf04 §1/§2/§4 deferred tools ──
//
// Hand-mirror of the app-side SignUpWidget / OnboardingWizard / DialogTitle
// tool files. All are all-roles (no `availableIn`) per the access matrix §3.
// Each routes to a REAL app action via the widget/view/primitive's registered
// CanvasOrchestrator adapter (no dormant plumbing): the app `handler` and this
// `intentBuilder` produce the SAME CanvasIntent the on-screen control dispatches.

/** Mirror of `SignUpWidget.tools.ts` → `submit_signup` (mutate). */
const submitSignup: ServerTool = {
  name: "submit_signup",
  description:
    "Submit the sign-up form to create the account and save the sample work. " +
    "Use when the user has supplied their name, email, and password and explicitly " +
    "asked to sign up, create an account, or save their work. The user confirms via " +
    "the chip before the account is created — it is not submitted automatically.",
  category: "mutate",
  inputSchema: z.object({
    first: z.string().min(1).describe("The first name."),
    last: z.string().min(1).describe("The last name."),
    email: z.string().min(1).email().describe("The user's email address (the account login)."),
    password: z.string().min(8).describe("The chosen password — at least 8 characters."),
    confirmPassword: z
      .string()
      .min(1)
      .describe("Password confirmation — must match `password` (the widget re-checks)."),
  }),
  intentBuilder: (input) => ({
    kind: "submitSignup",
    first: input.first,
    last: input.last,
    email: input.email,
    password: input.password,
    confirmPassword: input.confirmPassword,
  }),
};

/** Mirror of `OnboardingWizard.tools.ts` → `wizard_next` (read nav). */
const wizardNext: ServerTool = {
  name: "wizard_next",
  description:
    "Advance the onboarding wizard to the next step. Use when the active surface is the " +
    "onboarding wizard and the user asks to continue, go on, or move to the next step.",
  category: "read",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "wizardNext" }),
};

/** Mirror of `OnboardingWizard.tools.ts` → `wizard_back` (read nav). */
const wizardBack: ServerTool = {
  name: "wizard_back",
  description:
    "Move the onboarding wizard back to the previous step. Use when the user asks to go " +
    "back or review the previous onboarding step.",
  category: "read",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "wizardBack" }),
};

/** Mirror of `OnboardingWizard.tools.ts` → `wizard_finish` (read nav). */
const wizardFinish: ServerTool = {
  name: "wizard_finish",
  description:
    "Finish the onboarding wizard, recording completion. Use when the user is on the last " +
    "onboarding step and asks to finish, complete, or close the walkthrough as done.",
  category: "read",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "wizardFinish" }),
};

/** Mirror of `OnboardingWizard.tools.ts` → `dismiss_wizard` (read nav). */
const dismissWizard: ServerTool = {
  name: "dismiss_wizard",
  description:
    "Dismiss the onboarding wizard without completing it. Use when the user asks to skip, " +
    "close, or come back later to the onboarding walkthrough.",
  category: "read",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "dismissWizard" }),
};

/** Mirror of `DialogTitle.tools.ts` → `close_dialog` (mutate). */
const closeDialog: ServerTool = {
  name: "close_dialog",
  description:
    "Close the currently-open dialog via its title-bar close control. Use when the user " +
    "asks to close, dismiss, or cancel the open modal / dialog.",
  category: "mutate",
  inputSchema: z.object({}),
  intentBuilder: () => ({ kind: "closeDialog" }),
};

/**
 * The authoritative server catalog. Phase 7 backfill extends this
 * array as widgets are mirrored. The order here is stable (matches
 * the LLM's tool listing); duplicates fail the drift test.
 */
export const SERVER_TOOL_CATALOG: ServerTool[] = [
  openDocument,
  jumpToPage,
  proposeSchemaField,
  acceptProposal,
  rejectProposal,
  suggestIntent,
  commitGate,
  dismissGate,
  // 2026-05-31-shared-canvas-affordance-restoration — gate-open tool (mirror of
  // the app-side GateChatRail.tools.ts save_to_account).
  saveToAccount,
  bookCall,
  // onboarding-shell-shared-view Phase 3a — extract canvas-dispatch tool
  // (mirror of the app-side Extract widget's show_extraction).
  showExtraction,
  // onboarding-shell-shared-view Phase 3b — integrate canvas-dispatch tool
  // (mirror of the app-side Integrate widget's show_integrate).
  showIntegrate,
  // smart-report Phase 5 — report tool surface (mirror of the app-side
  // SmartReportRender / SmartReportBuilder / PinToReportAction tools).
  showSmartReportRender,
  showSmartReportEdit,
  pinToReport,
  proposeReportSection,
  acceptReportSection,
  rejectReportSection,
  editReportSection,
  deleteReportSection,
  // 2026-05-31-tool-system-completion — wf04 §1/§2/§4 deferred tools
  // (mirror of SignUpWidget / OnboardingWizard / DialogTitle). All all-roles.
  submitSignup,
  wizardNext,
  wizardBack,
  wizardFinish,
  dismissWizard,
  closeDialog,
];

/**
 * Tools exposed for the given ViewerStep + caller role. Mirrors the app-side
 * `toolRegistry.forStep`. The two filters COMPOSE: a tool is exposed IFF its
 * `availableSteps` admits `stepKind` (absent/empty → every step) AND
 * `roleExposes(tool, role)` (absent/empty `availableIn` → every role). When
 * `role` is omitted the role filter is a no-op (back-compat — full per-step
 * catalog). The caller's role is derived SERVER-side (`chatHandler.ts`), never
 * trusted from the client.
 */
export function toolsForStep(
  stepKind: ViewerStepKind | undefined,
  role?: WidgetRole,
): ServerTool[] {
  return SERVER_TOOL_CATALOG.filter((t) => {
    const stepOk =
      !stepKind || !t.availableSteps || t.availableSteps.length === 0 || t.availableSteps.includes(stepKind);
    const roleOk = role === undefined || roleExposes(t, role);
    return stepOk && roleOk;
  });
}

/** Lookup by name. Returns undefined for unknown names. */
export function getServerTool(name: string): ServerTool | undefined {
  return SERVER_TOOL_CATALOG.find((t) => t.name === name);
}
