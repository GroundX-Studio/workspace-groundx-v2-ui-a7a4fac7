import type { EntityKey, EntityKind, EntitySession } from "@/contexts/EntityRegistryContext";
import type { GateStatus } from "@/contexts/OnboardingSessionContext/types";

/**
 * Chat session foundation — see /memory/project_chat_session_model.md.
 *
 * A chat session is the parent container of the app's state. Each
 * session is a self-contained workspace: its own conversation
 * (messages + compression summaries), its own entity registry
 * (samples/projects/docs the user has touched here), its own
 * viewer-event trail (intent transitions for LLM context).
 *
 * Onboarding restricts to exactly one session for the duration of
 * onboarding. Steady mode (post-signin) unlocks N sessions + the
 * switcher UI.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  /**
   * NULL = message is still in the active LLM context. Non-null =
   * folded into a `ConversationSummary`; raw text kept for audit/
   * replay but excluded from LLM requests.
   */
  compressedIntoSummaryId?: string | null;
  // Future expansions:
  // citations?: Citation[];
  // toolCalls?: ToolCall[];
  // attachments?: Attachment[];
}

/**
 * Compressed chunk of conversation. Replaces a contiguous range of
 * older `ChatMessage`s in active context, freeing tokens. May be
 * chained — a newer summary can absorb prior summaries
 * (`absorbedSummaryIds`).
 */
export interface ConversationSummary {
  id: string;
  fromMessageId: string;
  toMessageId: string;
  generation: number;
  absorbedSummaryIds: string[];
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: number;
}

/**
 * One row of the user's activity trail inside a session — projected
 * from `intent_log` once the BFF is live; in-memory cache for now.
 * Last ~10 bundled into LLM requests as the "viewer trail" axis.
 */
export interface ViewerEvent {
  id: string;
  timestamp: number;
  entityKey: EntityKey | null;
  action:
    | "opened"
    | "frame-advanced"
    | "extracted-value-viewed"
    | "citation-clicked"
    | "scan-completed"
    | "intent-dispatched"
    | "left";
  source: "user" | "agent" | "tour" | "system";
  detail?: Record<string, unknown>;
}

/**
 * Canvas Orchestrator intent — what view is currently mounted.
 * Defined as `unknown` here to keep the foundation phase open;
 * the full Zod discriminated union lives in
 * `CanvasOrchestratorContext` (see memory `project_architecture.md`
 * for the schema). At runtime this is the parsed payload of the
 * active intent for this chat session.
 */
export type CanvasIntent = Record<string, unknown> | null;

/**
 * UI-01 Phase 1 — per-session, in-memory overlay over the active
 * scenario's `extractionSchema`. Lets the user edit the schema in
 * SchemaView without mutating the immutable scenario manifest.
 *
 * Phase 1 ships the type + an empty default + the `addedFields` /
 * `removedFieldIds` slots (read by SchemaView to render).
 * Phase 2 will wire LLM propose-cards to populate `addedFields`,
 * plus persistence to the `extraction_schemas` table.
 *
 * The overlay's semantics are layered over the manifest at render
 * time — see `SchemaView.applyOverlay` for the merge rule.
 */
/**
 * UI-01 Phase 2c — per-field extraction result the chat propose-card
 * fires for after `addSchemaField` lands the addition. Until the
 * focused LLM call returns, status sits at "pending" so SchemaView
 * can show an "Extracting…" badge instead of a "—" placeholder.
 * Failures land at "error"; happy path lands at "done" with a value.
 */
export interface SchemaFieldExtractionResult {
  status: "pending" | "done" | "error";
  value: string | number | boolean | null;
  confidence?: number;
  /**
   * `expand-inline-editor-fields` — the previous extraction's
   * confidence when this result is a re-run. Drives the preview
   * chip's `conf <new> ↑ <old>` rendering. Absent on the first
   * extraction (no prior run to compare against).
   */
  previousConfidence?: number;
  citation?: { documentId: string; page: number; snippet?: string } | null;
}

export interface SchemaFieldAddition {
  categoryId: string;
  /** Generated client-side; survives until template save. */
  id: string;
  name: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
  description: string;
  /**
   * UI-01 Phase 2c — populated by `setSchemaFieldExtraction` after the
   * propose-card Accept fires the focused extraction. Absent on
   * additions that haven't yet been re-extracted (e.g. additions
   * hydrated from a saved template).
   */
  extraction?: SchemaFieldExtractionResult;
}

/**
 * Per-field edit that the user committed via the F3a inline editor.
 * The overlay merges these on top of the manifest's field definition
 * when SchemaView renders the effective schema. Partial because the
 * user may have edited a subset of the available fields (e.g.
 * tweaked just the extraction prompt, not the type).
 */
export type SchemaFieldEdit = Partial<{
  name: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
  description: string;
  required: boolean;
  instructions: string[];
  /** F3a "format (opt)" free-text hint, per `expand-inline-editor-fields`. */
  format: string;
  /** F3a editable "identifiers" chip array (labels nearby the field). */
  identifiers: string[];
}>;

export interface PendingSchemaOverlay {
  /** Fields added by the user via SchemaView / LLM propose-card. */
  addedFields: SchemaFieldAddition[];
  /** Field ids the user removed (covers both manifest + added fields). */
  removedFieldIds: ReadonlySet<string>;
  /**
   * Per-field overrides committed via the inline F3a editor. Keyed by
   * field id. Empty until the user clicks Save on a row. SchemaView
   * merges these onto the manifest field at render time.
   */
  editedFields: ReadonlyMap<string, SchemaFieldEdit>;
  /**
   * Propose-cards the user hasn't acted on yet. Surfaced by SchemaView
   * ABOVE the field list (per spec: "ProposalCard suggestions appear
   * above the list with Accept / Dismiss"). The chat-side propose-card
   * dispatches `enqueueFieldProposal` whenever an assistant turn
   * carries `reply.proposedSchemaField`; Accept moves the proposal
   * into `addedFields` + clears it from the queue; Dismiss just
   * clears it.
   */
  pendingFieldProposals: SchemaFieldProposal[];
  /**
   * `add-pinned-samples-row` — sample document ids the user has pinned
   * for the Designer + Stress Test surfaces. Maximum of 3. The first
   * is auto-pinned on F3a entry from the active scenario's primary
   * document; the user can unpin via the `×` on each chip or pin more
   * (subject to sign-in for non-sample docs).
   */
  pinnedSamples: string[];
  /**
   * `add-pinned-samples-row` — the schema category the user is
   * currently focusing inside the Fields/Results sub-tabs. Drives the
   * topbar title (`Designing <sample> · <category>`) AND the Fields
   * tab's render scope (per the `category-scoped-fields-view` change).
   * Null means "no scope set"; SchemaView's render falls back to the
   * first manifest category.
   */
  focusedCategoryId: string | null;
}

/**
 * UI-01 — proposal queue entry. Each proposal carries the same
 * payload as `ProposedSchemaField` on the chat reply, plus a
 * client-minted id that makes Dismiss idempotent (so two chat turns
 * proposing the same field don't collapse into one queue row).
 */
export interface SchemaFieldProposal {
  id: string;
  categoryId: string;
  name: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
  description: string;
  /**
   * `proposal-envelope-provenance`: forwarded from the middleware's
   * Zod-validated envelope. Renderers gate the
   * `proposal_v<version> · envelope verified` label on
   * `provenance?.verified === true`.
   */
  provenance?: { version: "v1"; verified: true };
}

/** Shared default — every new ChatSession starts with no overlay. */
export const EMPTY_PENDING_SCHEMA_OVERLAY: PendingSchemaOverlay = {
  addedFields: [],
  removedFieldIds: new Set<string>(),
  editedFields: new Map<string, SchemaFieldEdit>(),
  pendingFieldProposals: [],
  pinnedSamples: [],
  focusedCategoryId: null,
};

// ── master-viewer-session Phase 1 ─────────────────────────────────────
//
// The viewer mirrors the chat: one ViewerSession per ChatSession,
// accumulating `ViewerStep[]` as the user moves, with transient
// `ViewerOverlay[]` z-stacked on top. The bug class where stored
// "gate is open" mode flags strand the canvas-swap goes away because
// overlays' lifetimes belong to the overlays themselves.
//
// Phase 1 ships TYPES + STORAGE only. No surface reads from these
// yet; Phase 2 lights up the gate-as-overlay path that closes the
// user-reported regression class.

/**
 * One "place the user is looking at." Frame surfaces (F1 Ingest,
 * F2 Understand, F3/F3a Extract, F5 Interact, F7 Integrate) are
 * projections of `step.kind`. Each step's payload carries the
 * cross-navigation state the surface needs (scenario, focused
 * category, current document, etc.).
 */
export type ViewerStep =
  | { kind: "ingest-picker"; attachedSchema?: { schemaId: string; name: string } }
  | {
      kind: "doc-viewer";
      documentId: string;
      page?: number;
      /**
       * clickable-citations Phase 3 — region annotation produced by a
       * citation click. The viewer pane reads `highlight.page` for the
       * page to surface and renders a bbox overlay when
       * `highlight.bbox` is present. Optional `sourceCitationIndex`
       * is the 1-based chip index that produced the highlight, used
       * for `cite.peeked` correlation telemetry.
       */
      highlight?: {
        page: number;
        bbox?: { x: number; y: number; w: number; h: number };
        sourceCitationIndex?: number;
      };
    }
  | { kind: "extract-workbench"; scenarioId: string; focusedCategoryId?: string }
  | { kind: "interact-chat"; scenarioId: string }
  | { kind: "report" }
  | { kind: "integrate" };

/**
 * Transient surfaces that sit on top of the current step in a z-stack.
 * Overlays push, mutate, and pop; they NEVER replace the underlying
 * step. `committed`-state sign-up is not an overlay — identity-level
 * "signed-in" is a durable AppMode flip.
 */
export type ViewerOverlay =
  | { kind: "sign-up"; state: "pending" | "done" | "dismissed"; cause?: "save-schema" }
  | { kind: "citation-peek"; documentId: string; page: number; bbox?: { x: number; y: number; w: number; h: number } }
  | { kind: "book-call" };

/**
 * Workspace state that's neither step nor overlay — sticky across
 * navigations, but not part of the step history. Schema overlay
 * (Phase 4) and future workspace state (pinned docs, draft reports,
 * etc.) land here.
 */
export interface ViewerWorkspace {
  schemaOverlay: PendingSchemaOverlay;
}

/**
 * Master viewer record, paired 1:1 with the enclosing `ChatSession`.
 * (No `id` slot — the pairing is implicit via the parent ChatSession.id.)
 * `history` accumulates — never erased. `currentStep.stepIndex` points
 * into history (or -1 when the session has no steps yet, e.g.
 * immediately after creation before any frame is mounted).
 */
export interface ViewerSession {
  history: ViewerStep[];
  currentStep: { stepIndex: number };
  overlays: ViewerOverlay[];
  workspace: ViewerWorkspace;
}

/** Shared default — every new ChatSession's viewer starts empty. */
export const EMPTY_VIEWER_SESSION: ViewerSession = {
  history: [],
  currentStep: { stepIndex: -1 },
  overlays: [],
  workspace: { schemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY },
};

export interface ChatSession {
  id: string; // c-<uuid>
  title: string;
  createdAt: number;
  updatedAt: number;

  // Conversation axis
  messages: ChatMessage[];
  summaries: ConversationSummary[];

  // Entity axis (the per-session entity registry)
  entities: ReadonlyMap<EntityKey, EntitySession>;
  activeEntityKey: EntityKey | null;

  // Viewer axis (intent + nav trail; used for LLM context)
  viewerHistory: ViewerEvent[];
  currentIntent: CanvasIntent;

  // Schema-editor overlay (UI-01). Empty by default; Phase 1
  // ships the slot, Phase 2 wires mutations.
  // Phase 4 of `master-viewer-session` will migrate this slot onto
  // `viewer.workspace.schemaOverlay`; for one release cycle a
  // deprecated getter here can proxy to the viewer slot.
  pendingSchemaOverlay: PendingSchemaOverlay;

  // `master-viewer-session` Phase 1 — paired ViewerSession. Phase 1
  // ships the slot + persistence; Phase 2+ wire the surfaces against
  // it (gate as overlay, currentFrame as derived).
  viewer: ViewerSession;

  // Onboarding-only special-case state (always present on the type
  // but only meaningful on the single onboarding session)
  gate: GateStatus;
  signupOpen: boolean;
  isOnboardingSession: boolean;
}

export interface ChatStoreState {
  ownerKey: string;
  sessions: ReadonlyMap<string, ChatSession>;
  activeSessionId: string | null;
}

export interface NewMessageInput {
  role: ChatMessage["role"];
  content: string;
}

export interface ChatStoreApi {
  state: ChatStoreState;
  /**
   * Create a new session and activate it. Returns the new session id.
   * `isOnboardingSession` defaults to false — the onboarding
   * bootstrap (Phase D) explicitly opts in.
   */
  newSession: (options?: { isOnboardingSession?: boolean; title?: string }) => string;
  /** Activate an existing session. No-op if id is unknown. */
  switchTo: (id: string) => void;
  /** Append a message to the active session. No-op if no session is active. */
  appendMessage: (input: NewMessageInput) => void;

  // --- Entity actions (formerly on EntityRegistryContext) ----------
  // These mutate the active chat session's `entities` map.
  // `useEntityRegistry()` is now a thin facade over these.

  /**
   * Set the active entity within the active session. Pass null to
   * deactivate (return to picker). No-op when no session is active.
   */
  activateEntity: (key: EntityKey | null) => void;
  /**
   * Create or activate an entity inside the active session. If the
   * entity already exists in this session, just activates it
   * (preserves state). If new, creates it with the given defaults.
   * Returns the entity key. No-op (returns the key anyway) when no
   * session is active.
   */
  upsertEntityAndActivate: (kind: EntityKind, id: string, defaults: Partial<EntitySession>) => EntityKey;
  /** Mutate the active entity inside the active session. No-op if either is missing. */
  updateActiveEntity: (updater: (session: EntitySession) => EntitySession) => void;

  /**
   * Append a ViewerEvent to the active session's `viewerHistory`.
   * No-op when no session is active. Last N events feed the LLM
   * context bundling (see [[project-chat-session-model]] § three
   * context axes). For now this is in-memory only; once the BFF is
   * wired (Phase H), each append will also write a row to the
   * `viewer_events` table.
   */
  appendViewerEvent: (input: NewViewerEventInput) => void;

  /**
   * UI-10 — flip the active ChatSession's `currentIntent`. Wired by
   * `CanvasOrchestratorContext.dispatch` on every dispatch so the
   * LLM-context bundler can see "the user/agent just dispatched X"
   * on the conversation axis. Pass `null` to clear. No-op when no
   * session is active.
   */
  setCurrentIntent: (intent: CanvasIntent) => void;

  /**
   * RT-05 — merge a server-provided list of persisted chat sessions
   * into local state. Used on auth-resolved to hydrate from the DB
   * (so a signed-in user on a fresh browser sees their full session
   * history). Per the storage rule in memory `project_chat_session_model.md`,
   * the DB is source of truth: for sessions present on both sides,
   * server wins on the fields it carries (title, activeEntityKey,
   * currentIntent, updatedAt). Client-only fields (messages,
   * summaries, entities, viewerHistory) are preserved from the
   * localStorage cache on each existing session. Server-only sessions
   * get added with empty client-only state.
   */
  hydrateFromServer: (
    sessions: ReadonlyArray<{
      id: string;
      title: string;
      isOnboarding: boolean;
      activeEntityKey: string | null;
      currentIntent: Record<string, unknown> | null;
      createdAt: string;
      updatedAt: string;
    }>,
  ) => void;

  /**
   * UI-01 Phase 2 — append a field to the active session's
   * `pendingSchemaOverlay.addedFields`. Called by the propose-card
   * Accept handler in chat AND by future direct-add UI. No-op when
   * no session is active.
   */
  addSchemaField: (input: SchemaFieldAddition) => void;

  /**
   * UI-01 Phase 2 — mark a field id as removed in the active
   * session's `pendingSchemaOverlay.removedFieldIds`. Covers both
   * manifest fields and previously-added overlay fields. No-op when
   * no session is active.
   */
  removeSchemaField: (fieldId: string) => void;

  /**
   * UI-01 Phase 2c — set / update the extraction result on a
   * previously-added overlay field. Called twice per Accept: once
   * with status="pending" to flip the field card to its loading
   * state, once with status="done"/"error" after the focused
   * extraction call returns. No-op when no active session OR when
   * the field id isn't present in `addedFields`.
   */
  setSchemaFieldExtraction: (fieldId: string, result: SchemaFieldExtractionResult) => void;

  /**
   * F3a inline editor — commit (or update) per-field overrides into
   * `pendingSchemaOverlay.editedFields`. Pass a partial patch; the
   * action shallow-merges onto any existing entry. The next render
   * of SchemaView sees the manifest field with the patch applied.
   * No-op when no active session.
   */
  editSchemaField: (fieldId: string, edit: SchemaFieldEdit) => void;

  /**
   * F3a inline editor — discard the per-field edit (revert to manifest
   * shape). Removes the entry from `editedFields`. No-op when no
   * active session OR when no edit exists for the id.
   */
  resetSchemaFieldEdit: (fieldId: string) => void;

  /**
   * F3a propose-cards above the list — enqueue an LLM-proposed
   * schema-field addition so SchemaView can surface a ProposalCard on
   * the canvas (not just inline in chat). Idempotent on (categoryId,
   * name) so chat turns that repeat the same proposal don't pile up.
   */
  enqueueFieldProposal: (proposal: Omit<SchemaFieldProposal, "id">) => void;

  /**
   * F3a propose-cards — accept a queued proposal. Moves it into
   * `addedFields` (via `addSchemaField` semantics) AND removes it
   * from the queue in a single state transition. Callers that need
   * the new field id back can read it from the queue entry before
   * accepting.
   */
  acceptFieldProposal: (proposalId: string) => string | null;

  /**
   * F3a propose-cards — drop a queued proposal without adding the
   * field. The chat scroll's matching propose-card animates to a
   * dismissed state as a mirror.
   */
  dismissFieldProposal: (proposalId: string) => void;

  /**
   * `add-pinned-samples-row` — pin a sample document for use by the
   * Designer + Stress Test surfaces. Idempotent (re-pinning is a
   * no-op); enforces the 3-sample maximum. No-op when no active session.
   */
  pinSample: (sampleId: string) => void;

  /**
   * `add-pinned-samples-row` — unpin a previously-pinned sample.
   * No-op when the id isn't pinned OR when no active session.
   */
  unpinSample: (sampleId: string) => void;

  /**
   * `add-pinned-samples-row` — set the focused category id (the
   * sub-tab "scope"). Pass null to clear. Read by ExtractView's
   * topbar title AND the Fields tab's render scope.
   */
  setFocusedCategory: (categoryId: string | null) => void;

  /**
   * `schema-agent-chat-affordances` — append an assistant-role
   * `ChatMessage` to the active session's `messages` list. Returns
   * the minted message id (or `null` when no session is active).
   * Distinct from `appendMessage` (which takes a `NewMessageInput`)
   * by being purpose-built for agent-emitted bubbles like the
   * confidence-delta narration; messages land with an `agent-<rand>`
   * id prefix so ChatColumn can project them into the rendered
   * stream separately from user-driven `appendMessage` writes.
   */
  appendAgentMessage: (content: string) => string | null;

  /**
   * `master-viewer-session` Phase 2 — append an overlay onto the
   * active session's `viewer.overlays`. Used by URL-driven sign-up
   * (OnboardingShell pushes on `/onboarding/signup`) AND intent-
   * driven flows (F3a Save 401 pushes a `cause: "save-schema"`
   * overlay). No-op when no active session.
   */
  pushOverlay: (overlay: ViewerOverlay) => void;

  /**
   * `master-viewer-session` Phase 2 — mutate the topmost overlay of
   * the given kind. Used to flip `sign-up` from `pending → done`
   * after `commitGate` or `pending → dismissed` after `dismissGate`.
   * No-op when no active session or when no overlay of the kind is
   * present.
   */
  mutateOverlay: (kind: ViewerOverlay["kind"], patch: Partial<ViewerOverlay>) => void;

  /**
   * `master-viewer-session` Phase 2 — pop the topmost overlay of the
   * given kind (or the topmost overlay regardless when called without
   * a kind). Used to clean up the sign-up surface on URL navigation
   * away. No-op when no active session or no overlay matches.
   */
  popOverlay: (kind?: ViewerOverlay["kind"]) => void;

  /**
   * `master-viewer-session` Phase 3 — append a `ViewerStep` onto the
   * active session's `viewer.history` AND advance `currentStep.stepIndex`
   * to point at the new entry. Idempotent: pushing a step structurally
   * equal to the current step is a no-op (avoids history pollution
   * from re-renders that re-fire the same navigation). No-op when no
   * active session.
   */
  pushStep: (step: ViewerStep) => void;

  /**
   * clickable-citations Phase 3 — citation-click target. Push-or-mutate
   * a `doc-viewer` step:
   *   - If the active step is `doc-viewer` for the SAME documentId,
   *     mutate its `highlight` slot in place (no new history entry).
   *   - Otherwise push a new `doc-viewer` step with the given
   *     documentId + page + highlight.
   *
   * This is the canonical sink for `CanvasIntent.highlightCitation`
   * — the orchestrator wires it directly. No-op when no active
   * session.
   */
  gotoDocViewer: (input: {
    documentId: string;
    page: number;
    bbox?: { x: number; y: number; w: number; h: number };
    sourceCitationIndex?: number;
  }) => void;
}

export interface NewViewerEventInput {
  action: ViewerEvent["action"];
  entityKey: ViewerEvent["entityKey"];
  source: ViewerEvent["source"];
  detail?: ViewerEvent["detail"];
}
