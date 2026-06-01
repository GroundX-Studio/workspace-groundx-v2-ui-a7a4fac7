import { z } from "zod";

import { sourceSchema, type AppUserMetadata as SharedAppUserMetadata, type CanvasIntent, type Source, type TemplateKind } from "@groundx/shared";

export interface SessionRecord {
  id: string;
  groundxUsername: string;
  groundxApiKeyEnc?: string | null;
  expiresAt: Date;
}

// 2026-05-31-chat-wire-types-shared — `AppUserMetadata` was a byte-twin of the
// app's documented subset. It is now a re-export of the ONE `@groundx/shared`
// schema (every field optional except `groundxUsername`). The middleware reads
// the full set; `acceptedTermsAt` accepts `Date | string` so the repository
// row-mapper's `new Date(...)` stays valid. The `Eq<>` guard lives in
// `middleware/src/appUserMetadata.contract.test.ts`.
export type AppUserMetadata = SharedAppUserMetadata;

/**
 * Chat-session records (per project_chat_session_model + project_database).
 *
 * Storage rule:
 *   - Authenticated users: DB primary, localStorage cache.
 *   - Anonymous users: localStorage ONLY for content; on signup, the
 *     middleware ingests their cached content into DB (login-claim flow).
 *
 * `viewer_events` is the one chat-related table that is DB for BOTH
 * anonymous and authenticated users (telemetry, not content).
 */
export interface ChatSessionRecord {
  id: string;
  onboardingSessionId: string;
  ownerUserId: string | null;
  ownerAnonId: string | null;
  title: string;
  isOnboarding: boolean;
  activeEntityKey: string | null;
  /**
   * `2026-05-31-canvas-intent-schema-shared` — the validated `CanvasIntent`
   * read off `current_intent_json` via the shared `parseCanvasIntent` (was an
   * open `Record<string, unknown>` blind-cast). The middleware derives the
   * type from the ONE `canvasIntentSchema` in `@groundx/shared`, the same
   * schema the app hydration boundary validates against.
   */
  currentIntent: CanvasIntent | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/**
 * 2026-05-31-core-data-followups §4c — the union-typed DB columns are Zod
 * enums (one source of truth: the TS type is derived via `z.infer`), so the
 * row→object mappers can `safeParse`-validate the persisted VARCHAR instead of
 * blind-casting it into LLM context. Each schema carries a documented SAFE
 * in-union default for coercion when a corrupt row is read.
 */
export const chatMessageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;
/** Safe default for a corrupt `chat_messages.role` — `system` is the
 * non-authoritative role (never treated as the user's words or the model's). */
export const CHAT_MESSAGE_ROLE_FALLBACK: ChatMessageRole = "system";

export interface ChatMessageRecord {
  id: string;
  chatSessionId: string;
  turnIndex: number;
  role: ChatMessageRole;
  content: string;
  citationsJson: string | null;
  compressedIntoSummaryId: string | null;
  llmProvider: string | null;
  llmModelId: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  errorCode: string | null;
  createdAt: Date;
}

export interface ConversationSummaryRecord {
  id: string;
  chatSessionId: string;
  fromMessageId: string;
  toMessageId: string;
  generation: number;
  absorbedSummaryIdsJson: string;
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: Date;
}

export interface ChatSessionEntityRecord {
  chatSessionId: string;
  entityKey: string;
  lastFrame: string | null;
  completedFramesJson: string;
  scanProgressJson: string | null;
  extractedValuesJson: string | null;
  /**
   * CF-15 — RAG scope refs. The active EntitySession carries enough
   * routing info for the chat handler to build a `ContentScope`
   * (`@groundx/shared`) without hardcoding the env samples bucket.
   *
   *   bucketId         — primary bucket the entity lives in (steady mode:
   *                      customer's bucket; onboarding: samples bucket).
   *   projectIdsJson   — JSON array of GroundX projectIds to scope the
   *                      search to. 0 → whole bucket. 1 → single-project
   *                      filter. N → $in filter.
   *   groupId          — pre-created group of buckets (multi-workspace).
   *                      Built lazily via `ensureBucketGroup` when the
   *                      user pivots across more than one bucket.
   *   documentIdsJson  — JSON array of explicit documentIds (single-doc
   *                      "look at this PDF" flows). Dispatches to the
   *                      doc-search endpoint.
   *
   * All four are nullable: a fresh anon onboarding entity has none of
   * them and falls through to the env samples bucket. A first-time
   * steady-mode user has bucketId set; a multi-bucket pivot adds
   * groupId; a single-doc viewer flow uses documentIdsJson.
   */
  bucketId: number | null;
  projectIdsJson: string | null;
  groupId: number | null;
  documentIdsJson: string | null;
  createdAt: Date;
  lastVisitedAt: Date;
}

export const viewerEventActionSchema = z.enum([
  "opened",
  "frame-advanced",
  "extracted-value-viewed",
  "citation-clicked",
  "scan-completed",
  "intent-dispatched",
  "left",
]);
export type ViewerEventAction = z.infer<typeof viewerEventActionSchema>;
/** Safe default for a corrupt `viewer_events.action` — `opened` is the inert
 * baseline action (no UI side effect inferred from it). */
export const VIEWER_EVENT_ACTION_FALLBACK: ViewerEventAction = "opened";

// 2026-05-31-chat-wire-types-shared — the viewer-event source enum was a
// byte-twin of the shared `["user","agent","tour","system"]` vocabulary; it now
// IS the shared `sourceSchema` (one source of truth across the boundary). The
// local name + the `ViewerEventSource` type alias + the coercion fallback are
// kept so `mysqlRepository.coerceEnum` callers are unchanged.
export const viewerEventSourceSchema = sourceSchema;
export type ViewerEventSource = Source;
/** Safe default for a corrupt `viewer_events.source` — `system` (the
 * non-attributable origin). */
export const VIEWER_EVENT_SOURCE_FALLBACK: ViewerEventSource = "system";

export interface ViewerEventRecord {
  id: string;
  chatSessionId: string;
  timestamp: number;
  entityKey: string | null;
  action: ViewerEventAction;
  source: ViewerEventSource;
  detailJson: string | null;
}

/**
 * UI-10b — `intent_log` table. The canvas-orchestrator dispatch trail
 * lives here, separate from `viewer_events`:
 *
 *   - viewer_events records every UI-visible action (frame-advanced,
 *     citation-clicked, scan-completed). Reads light, writes many.
 *   - intent_log records every dispatched CanvasIntent regardless of
 *     whether it produced a UI-visible action. Smaller volume but
 *     critical for the PLUG-05 tour state machine (`source: "tour"`).
 *
 * Both tables share `chat_session_id` so the conversation/viewer/intent
 * axes can be cross-joined when building LLM context.
 */
// 2026-05-31-chat-wire-types-shared — same single-source as
// `viewerEventSourceSchema`: the intent-log source IS the shared `sourceSchema`.
export const intentLogSourceSchema = sourceSchema;
export type IntentLogSource = Source;
/** Safe default for a corrupt `intent_log.source` — `system`. */
export const INTENT_LOG_SOURCE_FALLBACK: IntentLogSource = "system";

export interface IntentLogRecord {
  id: string;
  chatSessionId: string;
  timestamp: number;
  source: IntentLogSource;
  /** Discriminator from the CanvasIntent union (e.g. "openDocument"). */
  intentKind: string;
  /** Full intent payload, JSON-serialized. Replayed for audit / debug. */
  intentJson: string;
}

/**
 * shared-template-lifecycle Phase 2 — the durable Template row (Extract schema
 * + Report template share this). `bodyJson` is the opaque JSON body (the
 * kind-discriminated `Template.body`), stored as a string. `groundxUsername`
 * is the owner — SERVER-assigned (never from the wire).
 *
 * The WRITE path (`POST /api/templates`) validates the wire shape with the
 * shared `templateSaveInputSchema` and persists `bodyJson` opaquely. The READ
 * path that assembles a full `Template` from a row + validates it with
 * `parseTemplate` is the report-render flow (smart-report); `getTemplate` +
 * `parseTemplate` are the foundation API it consumes. (Extract today only
 * exercises write + `listTemplates`.)
 */
export interface TemplateRecord {
  id: string;
  kind: TemplateKind;
  groundxUsername: string;
  name: string;
  bodyJson: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppRepository {
  createSchema(): Promise<void>;
  createSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  upsertMetadata(metadata: AppUserMetadata): Promise<void>;
  getMetadata(groundxUsername: string): Promise<AppUserMetadata | null>;

  // Templates (shared-template-lifecycle — Extract schema + Report template).
  // (The legacy `extraction_schemas` repo methods were removed at the Phase-3
  // cutover — nothing calls them; the table itself is kept, read only by the
  // boot-time copy-migration, until the deferred drop sweep.)
  saveTemplate(record: TemplateRecord): Promise<void>;
  getTemplate(id: string): Promise<TemplateRecord | null>;
  listTemplates(groundxUsername: string, kind: TemplateKind): Promise<TemplateRecord[]>;

  // Chat sessions
  upsertChatSession(record: ChatSessionRecord): Promise<void>;
  getChatSession(id: string): Promise<ChatSessionRecord | null>;
  listChatSessionsForUser(ownerUserId: string): Promise<ChatSessionRecord[]>;

  // Messages
  appendChatMessage(record: ChatMessageRecord): Promise<void>;
  listChatMessages(chatSessionId: string): Promise<ChatMessageRecord[]>;
  /**
   * Mark a batch of chat messages as compressed into a given summary.
   * Used by the compression chain (Phase J): after a new
   * ConversationSummary is written, the absorbed messages get their
   * compressedIntoSummaryId set so subsequent live-tail reads
   * (`compressedIntoSummaryId IS NULL`) skip them.
   */
  markChatMessagesCompressed(messageIds: string[], summaryId: string): Promise<void>;

  // Summaries (compression chain)
  appendConversationSummary(record: ConversationSummaryRecord): Promise<void>;
  listConversationSummaries(chatSessionId: string): Promise<ConversationSummaryRecord[]>;

  // Per-session entities
  upsertChatSessionEntity(record: ChatSessionEntityRecord): Promise<void>;
  listChatSessionEntities(chatSessionId: string): Promise<ChatSessionEntityRecord[]>;

  // Viewer events (telemetry-class; DB for ALL users)
  appendViewerEvent(record: ViewerEventRecord): Promise<void>;
  listViewerEvents(chatSessionId: string, sinceTimestamp?: number): Promise<ViewerEventRecord[]>;

  // Intent log (UI-10b — every canvas-orchestrator dispatch)
  appendIntentLog(record: IntentLogRecord): Promise<void>;
  listIntentLog(chatSessionId: string, sinceTimestamp?: number): Promise<IntentLogRecord[]>;

  /**
   * Login-claim: re-key every chat_sessions row whose ownerAnonId
   * matches the supplied anon id so it's instead owned by the
   * supplied user id (ownerAnonId becomes null). Child rows (messages,
   * summaries, entities, viewer_events) are untouched — they continue
   * to reference the same chat_session_id and inherit the new owner
   * transitively.
   *
   * Returns the number of chat_sessions rows that were re-keyed.
   * Zero is a valid result (the user signed up from a different
   * browser, or no anon sessions ever existed).
   */
  rekeyAnonymousChatSessions(anonId: string, ownerUserId: string): Promise<{ rekeyedSessions: number }>;
}

export interface GroundXPartnerClient {
  registerCustomer(input: RegisterCustomerInput): Promise<AuthResponse>;
  loginCustomer(input: LoginCustomerInput): Promise<AuthResponse>;
  getCustomer(username: string): Promise<{ customer: Record<string, unknown> }>;
  requestPasswordReset(email: string): Promise<unknown>;
  confirmPasswordReset(input: ConfirmPasswordInput): Promise<unknown>;
  createApiKey(username: string, name: string): Promise<string>;
  forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response>;
}

export interface GroundXClient {
  forward(path: string, init: RequestInit & { apiKey: string }): Promise<Response>;
}

export interface LlmClient {
  forward(path: string, init: RequestInit): Promise<Response>;
}

export interface RegisterCustomerInput {
  email: string;
  password: string;
  first?: string;
  last?: string;
  company?: string;
  partnerUserId?: string;
  phone?: string;
}

export interface LoginCustomerInput {
  email: string;
  password: string;
}

export interface ConfirmPasswordInput {
  email: string;
  newPassword: string;
  code: string;
}

export interface AuthResponse {
  token: string;
  username: string;
}
