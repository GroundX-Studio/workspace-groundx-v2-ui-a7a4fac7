export interface SessionRecord {
  id: string;
  groundxUsername: string;
  groundxApiKeyEnc?: string | null;
  expiresAt: Date;
}

export interface AppUserMetadata {
  groundxUsername: string;
  onboardingState?: string | null;
  uiPreferencesJson?: string | null;
  featureFlagsJson?: string | null;
  lastActiveProjectId?: string | null;
  acceptedTermsAt?: Date | null;
  appRole?: string | null;
}

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
  currentIntent: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessageRecord {
  id: string;
  chatSessionId: string;
  turnIndex: number;
  role: ChatMessageRole;
  content: string;
  citationsJson: string | null;
  toolCallsJson: string | null;
  attachmentsJson: string | null;
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
  createdAt: Date;
  lastVisitedAt: Date;
}

export type ViewerEventAction =
  | "opened"
  | "frame-advanced"
  | "extracted-value-viewed"
  | "citation-clicked"
  | "scan-completed"
  | "intent-dispatched"
  | "left";

export type ViewerEventSource = "user" | "agent" | "tour" | "system";

export interface ViewerEventRecord {
  id: string;
  chatSessionId: string;
  timestamp: number;
  entityKey: string | null;
  action: ViewerEventAction;
  source: ViewerEventSource;
  detailJson: string | null;
}

/** Bundle of records a single anonymous->signed-in claim migrates. */
export interface AnonymousChatPayload {
  chatSessions: ChatSessionRecord[];
  chatMessages: ChatMessageRecord[];
  conversationSummaries: ConversationSummaryRecord[];
  chatSessionEntities: ChatSessionEntityRecord[];
  viewerEvents: ViewerEventRecord[];
}

export interface AppRepository {
  createSchema(): Promise<void>;
  createSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  upsertMetadata(metadata: AppUserMetadata): Promise<void>;
  getMetadata(groundxUsername: string): Promise<AppUserMetadata | null>;

  // Chat sessions
  upsertChatSession(record: ChatSessionRecord): Promise<void>;
  getChatSession(id: string): Promise<ChatSessionRecord | null>;
  listChatSessionsForUser(ownerUserId: string): Promise<ChatSessionRecord[]>;

  // Messages
  appendChatMessage(record: ChatMessageRecord): Promise<void>;
  listChatMessages(chatSessionId: string): Promise<ChatMessageRecord[]>;

  // Summaries (compression chain)
  appendConversationSummary(record: ConversationSummaryRecord): Promise<void>;
  listConversationSummaries(chatSessionId: string): Promise<ConversationSummaryRecord[]>;

  // Per-session entities
  upsertChatSessionEntity(record: ChatSessionEntityRecord): Promise<void>;
  listChatSessionEntities(chatSessionId: string): Promise<ChatSessionEntityRecord[]>;

  // Viewer events (telemetry-class; DB for ALL users)
  appendViewerEvent(record: ViewerEventRecord): Promise<void>;
  listViewerEvents(chatSessionId: string, sinceTimestamp?: number): Promise<ViewerEventRecord[]>;

  // Login-claim: ingest anonymous localStorage payload into DB
  claimAnonymousChatPayload(ownerUserId: string, payload: AnonymousChatPayload): Promise<void>;
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
