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
  /** Builds the CanvasIntent shape from validated input. */
  intentBuilder: (input: z.infer<TSchema>) => Record<string, unknown>;
}

/**
 * Mirror of `app/src/contexts/ChatStoreContext`'s `ViewerStep["kind"]`.
 * Hand-typed to avoid a cross-workspace import.
 */
export type ViewerStepKind =
  | "ingest-picker"
  | "doc-viewer"
  | "extract-workbench"
  | "interact-chat"
  | "report"
  | "integrate";

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
  bookCall,
];

/**
 * Tools exposed for the given ViewerStep. Mirrors the app-side
 * `toolRegistry.forStep`. Tools with no `availableSteps` are
 * exposed in every step.
 */
export function toolsForStep(stepKind: ViewerStepKind | undefined): ServerTool[] {
  if (!stepKind) return SERVER_TOOL_CATALOG;
  return SERVER_TOOL_CATALOG.filter(
    (t) => !t.availableSteps || t.availableSteps.length === 0 || t.availableSteps.includes(stepKind),
  );
}

/** Lookup by name. Returns undefined for unknown names. */
export function getServerTool(name: string): ServerTool | undefined {
  return SERVER_TOOL_CATALOG.find((t) => t.name === name);
}
