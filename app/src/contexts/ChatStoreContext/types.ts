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
}

export interface NewViewerEventInput {
  action: ViewerEvent["action"];
  entityKey: ViewerEvent["entityKey"];
  source: ViewerEvent["source"];
  detail?: ViewerEvent["detail"];
}
