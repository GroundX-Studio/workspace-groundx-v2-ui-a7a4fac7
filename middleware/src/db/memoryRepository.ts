import type {
  AnonymousChatPayload,
  AppRepository,
  AppUserMetadata,
  ChatMessageRecord,
  ChatSessionEntityRecord,
  ChatSessionRecord,
  ConversationSummaryRecord,
  SessionRecord,
  ViewerEventRecord,
} from "../types.js";

/**
 * In-memory implementation of AppRepository. Used in MOCK_MODE and
 * tests. Mirrors the table shape of MySqlAppRepository so the contract
 * stays consistent.
 */
export class MemoryAppRepository implements AppRepository {
  sessions = new Map<string, SessionRecord>();
  metadata = new Map<string, AppUserMetadata>();

  // Chat tables (per project_database.md). Keyed by primary key columns.
  chatSessions = new Map<string, ChatSessionRecord>();
  chatMessages = new Map<string, ChatMessageRecord[]>();
  conversationSummaries = new Map<string, ConversationSummaryRecord[]>();
  chatSessionEntities = new Map<string, ChatSessionEntityRecord>(); // key: `${sessionId}|${entityKey}`
  viewerEvents = new Map<string, ViewerEventRecord[]>();

  async createSchema(): Promise<void> {}

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async upsertMetadata(metadata: AppUserMetadata): Promise<void> {
    this.metadata.set(metadata.groundxUsername, metadata);
  }

  async getMetadata(groundxUsername: string): Promise<AppUserMetadata | null> {
    return this.metadata.get(groundxUsername) ?? null;
  }

  // ── Chat sessions ───────────────────────────────────────────────

  async upsertChatSession(record: ChatSessionRecord): Promise<void> {
    this.chatSessions.set(record.id, record);
  }

  async getChatSession(id: string): Promise<ChatSessionRecord | null> {
    return this.chatSessions.get(id) ?? null;
  }

  async listChatSessionsForUser(ownerUserId: string): Promise<ChatSessionRecord[]> {
    return [...this.chatSessions.values()]
      .filter((s) => s.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // ── Messages ────────────────────────────────────────────────────

  async appendChatMessage(record: ChatMessageRecord): Promise<void> {
    const list = this.chatMessages.get(record.chatSessionId) ?? [];
    list.push(record);
    this.chatMessages.set(record.chatSessionId, list);
  }

  async listChatMessages(chatSessionId: string): Promise<ChatMessageRecord[]> {
    return [...(this.chatMessages.get(chatSessionId) ?? [])].sort(
      (a, b) => a.turnIndex - b.turnIndex,
    );
  }

  // ── Summaries ───────────────────────────────────────────────────

  async appendConversationSummary(record: ConversationSummaryRecord): Promise<void> {
    const list = this.conversationSummaries.get(record.chatSessionId) ?? [];
    list.push(record);
    this.conversationSummaries.set(record.chatSessionId, list);
  }

  async listConversationSummaries(chatSessionId: string): Promise<ConversationSummaryRecord[]> {
    return [...(this.conversationSummaries.get(chatSessionId) ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // ── Per-session entities ────────────────────────────────────────

  async upsertChatSessionEntity(record: ChatSessionEntityRecord): Promise<void> {
    this.chatSessionEntities.set(`${record.chatSessionId}|${record.entityKey}`, record);
  }

  async listChatSessionEntities(chatSessionId: string): Promise<ChatSessionEntityRecord[]> {
    return [...this.chatSessionEntities.values()].filter((e) => e.chatSessionId === chatSessionId);
  }

  // ── Viewer events ───────────────────────────────────────────────

  async appendViewerEvent(record: ViewerEventRecord): Promise<void> {
    const list = this.viewerEvents.get(record.chatSessionId) ?? [];
    list.push(record);
    this.viewerEvents.set(record.chatSessionId, list);
  }

  async listViewerEvents(chatSessionId: string, sinceTimestamp?: number): Promise<ViewerEventRecord[]> {
    const all = this.viewerEvents.get(chatSessionId) ?? [];
    const filtered = sinceTimestamp != null ? all.filter((e) => e.timestamp >= sinceTimestamp) : all;
    return [...filtered].sort((a, b) => b.timestamp - a.timestamp);
  }

  // ── Login-claim ─────────────────────────────────────────────────

  async claimAnonymousChatPayload(ownerUserId: string, payload: AnonymousChatPayload): Promise<void> {
    // Atomic in the in-memory impl (no transaction needed). The MySQL
    // impl will wrap this in a single transaction.
    for (const session of payload.chatSessions) {
      this.chatSessions.set(session.id, {
        ...session,
        ownerUserId,
        ownerAnonId: null, // The claim transfers ownership from anon to user.
      });
    }
    for (const msg of payload.chatMessages) {
      const list = this.chatMessages.get(msg.chatSessionId) ?? [];
      list.push(msg);
      this.chatMessages.set(msg.chatSessionId, list);
    }
    for (const summary of payload.conversationSummaries) {
      const list = this.conversationSummaries.get(summary.chatSessionId) ?? [];
      list.push(summary);
      this.conversationSummaries.set(summary.chatSessionId, list);
    }
    for (const entity of payload.chatSessionEntities) {
      this.chatSessionEntities.set(`${entity.chatSessionId}|${entity.entityKey}`, entity);
    }
    for (const event of payload.viewerEvents) {
      const list = this.viewerEvents.get(event.chatSessionId) ?? [];
      list.push(event);
      this.viewerEvents.set(event.chatSessionId, list);
    }
  }
}
