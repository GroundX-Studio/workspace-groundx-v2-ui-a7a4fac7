import type {
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

  async markChatMessagesCompressed(messageIds: string[], summaryId: string): Promise<void> {
    if (messageIds.length === 0) return;
    const idSet = new Set(messageIds);
    // The in-memory store is sharded by chatSessionId. To stay simple
    // we walk every shard; production callers always pass ids from a
    // single session so the cost is bounded by the active session's
    // message count. The MySQL impl will use a single UPDATE ... WHERE
    // id IN (...) and won't pay this cost.
    for (const [sessionId, messages] of this.chatMessages.entries()) {
      let mutated = false;
      const next = messages.map((m) => {
        if (!idSet.has(m.id)) return m;
        mutated = true;
        return { ...m, compressedIntoSummaryId: summaryId };
      });
      if (mutated) this.chatMessages.set(sessionId, next);
    }
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

  // ── Login-claim (re-key, not bulk-upload) ───────────────────────

  async rekeyAnonymousChatSessions(anonId: string, ownerUserId: string): Promise<{ rekeyedSessions: number }> {
    let rekeyedSessions = 0;
    for (const [id, session] of this.chatSessions) {
      if (session.ownerAnonId === anonId) {
        this.chatSessions.set(id, {
          ...session,
          ownerUserId,
          ownerAnonId: null,
          updatedAt: new Date(),
        });
        rekeyedSessions += 1;
      }
    }
    return { rekeyedSessions };
  }
}
