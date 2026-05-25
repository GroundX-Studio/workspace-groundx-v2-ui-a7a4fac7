import mysql from "mysql2/promise";

import type { AppEnv } from "../config/env.js";
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

export class MySqlAppRepository implements AppRepository {
  private pool: mysql.Pool;

  constructor(env: AppEnv) {
    this.pool = mysql.createPool({
      host: env.MYSQL_HOST!,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE!,
      user: env.MYSQL_USER!,
      password: env.MYSQL_PASSWORD!,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async createSchema(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(128) PRIMARY KEY,
        groundx_username VARCHAR(255) NOT NULL,
        groundx_api_key_enc TEXT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX sessions_groundx_username_idx (groundx_username),
        INDEX sessions_expires_at_idx (expires_at)
      )
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS app_user_metadata (
        groundx_username VARCHAR(255) PRIMARY KEY,
        onboarding_state VARCHAR(128) NULL,
        ui_preferences_json JSON NULL,
        feature_flags_json JSON NULL,
        last_active_project_id VARCHAR(128) NULL,
        accepted_terms_at DATETIME NULL,
        app_role VARCHAR(64) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Chat-session tables (per project_database.md). Anonymous content
    // lives in localStorage; these tables only see rows after the
    // login-claim BFF endpoint ingests an anon payload, and for
    // signed-in writes thereafter. viewer_events is the exception —
    // it's telemetry-class and writes for both anon and signed-in users.
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id VARCHAR(36) PRIMARY KEY,
        onboarding_session_id CHAR(36) NOT NULL,
        owner_user_id VARCHAR(128) NULL,
        owner_anon_id VARCHAR(36) NULL,
        title VARCHAR(255) NOT NULL,
        is_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
        active_entity_key VARCHAR(64) NULL,
        current_intent_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        archived_at DATETIME NULL,
        INDEX chat_sessions_owner_user_idx (owner_user_id, updated_at),
        INDEX chat_sessions_onboarding_idx (onboarding_session_id, updated_at),
        CHECK (owner_user_id IS NOT NULL OR owner_anon_id IS NOT NULL)
      )
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        chat_session_id VARCHAR(36) NOT NULL,
        turn_index INT NOT NULL,
        role VARCHAR(16) NOT NULL,
        content TEXT NOT NULL,
        citations_json JSON NULL,
        tool_calls_json JSON NULL,
        attachments_json JSON NULL,
        compressed_into_summary_id VARCHAR(36) NULL,
        llm_provider VARCHAR(64) NULL,
        llm_model_id VARCHAR(64) NULL,
        latency_ms INT NULL,
        prompt_tokens INT NULL,
        completion_tokens INT NULL,
        error_code VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX chat_messages_session_idx (chat_session_id, turn_index),
        INDEX chat_messages_session_live_idx (chat_session_id, compressed_into_summary_id),
        FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id VARCHAR(36) PRIMARY KEY,
        chat_session_id VARCHAR(36) NOT NULL,
        from_message_id VARCHAR(36) NOT NULL,
        to_message_id VARCHAR(36) NOT NULL,
        generation INT NOT NULL DEFAULT 0,
        absorbed_summary_ids_json JSON NOT NULL,
        content TEXT NOT NULL,
        model VARCHAR(64) NOT NULL,
        tokens_in INT NOT NULL,
        tokens_out INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX conv_summaries_session_idx (chat_session_id, created_at),
        FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_session_entities (
        chat_session_id VARCHAR(36) NOT NULL,
        entity_key VARCHAR(64) NOT NULL,
        last_frame VARCHAR(16) NULL,
        completed_frames_json JSON NOT NULL,
        scan_progress_json JSON NULL,
        extracted_values_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_session_id, entity_key),
        FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS viewer_events (
        id VARCHAR(36) PRIMARY KEY,
        chat_session_id VARCHAR(36) NOT NULL,
        ts_ms BIGINT NOT NULL,
        entity_key VARCHAR(64) NULL,
        action VARCHAR(32) NOT NULL,
        source VARCHAR(16) NOT NULL,
        detail_json JSON NULL,
        INDEX viewer_events_session_idx (chat_session_id, ts_ms),
        FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO sessions (id, groundx_username, groundx_api_key_enc, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        groundx_username = VALUES(groundx_username),
        groundx_api_key_enc = VALUES(groundx_api_key_enc),
        expires_at = VALUES(expires_at)`,
      [session.id, session.groundxUsername, session.groundxApiKeyEnc ?? null, session.expiresAt],
    );
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, groundx_username, groundx_api_key_enc, expires_at FROM sessions WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      groundxUsername: row.groundx_username,
      groundxApiKeyEnc: row.groundx_api_key_enc,
      expiresAt: new Date(row.expires_at),
    };
  }

  async deleteSession(id: string): Promise<void> {
    await this.pool.execute(`DELETE FROM sessions WHERE id = ?`, [id]);
  }

  async upsertMetadata(metadata: AppUserMetadata): Promise<void> {
    await this.pool.execute(
      `INSERT INTO app_user_metadata (
        groundx_username,
        onboarding_state,
        ui_preferences_json,
        feature_flags_json,
        last_active_project_id,
        accepted_terms_at,
        app_role
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        onboarding_state = VALUES(onboarding_state),
        ui_preferences_json = VALUES(ui_preferences_json),
        feature_flags_json = VALUES(feature_flags_json),
        last_active_project_id = VALUES(last_active_project_id),
        accepted_terms_at = VALUES(accepted_terms_at),
        app_role = VALUES(app_role)`,
      [
        metadata.groundxUsername,
        metadata.onboardingState ?? null,
        metadata.uiPreferencesJson ?? null,
        metadata.featureFlagsJson ?? null,
        metadata.lastActiveProjectId ?? null,
        metadata.acceptedTermsAt ?? null,
        metadata.appRole ?? null,
      ],
    );
  }

  async getMetadata(groundxUsername: string): Promise<AppUserMetadata | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT groundx_username, onboarding_state, ui_preferences_json, feature_flags_json,
        last_active_project_id, accepted_terms_at, app_role
       FROM app_user_metadata WHERE groundx_username = ? LIMIT 1`,
      [groundxUsername],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      groundxUsername: row.groundx_username,
      onboardingState: row.onboarding_state,
      uiPreferencesJson: row.ui_preferences_json,
      featureFlagsJson: row.feature_flags_json,
      lastActiveProjectId: row.last_active_project_id,
      acceptedTermsAt: row.accepted_terms_at ? new Date(row.accepted_terms_at) : null,
      appRole: row.app_role,
    };
  }

  // ── Chat sessions ───────────────────────────────────────────────

  async upsertChatSession(record: ChatSessionRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO chat_sessions (
        id, onboarding_session_id, owner_user_id, owner_anon_id, title,
        is_onboarding, active_entity_key, current_intent_json,
        created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        owner_user_id = VALUES(owner_user_id),
        owner_anon_id = VALUES(owner_anon_id),
        title = VALUES(title),
        is_onboarding = VALUES(is_onboarding),
        active_entity_key = VALUES(active_entity_key),
        current_intent_json = VALUES(current_intent_json),
        updated_at = VALUES(updated_at),
        archived_at = VALUES(archived_at)`,
      [
        record.id,
        record.onboardingSessionId,
        record.ownerUserId,
        record.ownerAnonId,
        record.title,
        record.isOnboarding ? 1 : 0,
        record.activeEntityKey,
        record.currentIntent != null ? JSON.stringify(record.currentIntent) : null,
        record.createdAt,
        record.updatedAt,
        record.archivedAt,
      ],
    );
  }

  async getChatSession(id: string): Promise<ChatSessionRecord | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, onboarding_session_id, owner_user_id, owner_anon_id, title,
        is_onboarding, active_entity_key, current_intent_json,
        created_at, updated_at, archived_at
       FROM chat_sessions WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row ? rowToChatSession(row) : null;
  }

  async listChatSessionsForUser(ownerUserId: string): Promise<ChatSessionRecord[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, onboarding_session_id, owner_user_id, owner_anon_id, title,
        is_onboarding, active_entity_key, current_intent_json,
        created_at, updated_at, archived_at
       FROM chat_sessions
       WHERE owner_user_id = ?
       ORDER BY updated_at DESC`,
      [ownerUserId],
    );
    return rows.map(rowToChatSession);
  }

  // ── Messages ────────────────────────────────────────────────────

  async appendChatMessage(record: ChatMessageRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO chat_messages (
        id, chat_session_id, turn_index, role, content,
        citations_json, tool_calls_json, attachments_json,
        compressed_into_summary_id, llm_provider, llm_model_id,
        latency_ms, prompt_tokens, completion_tokens, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.chatSessionId,
        record.turnIndex,
        record.role,
        record.content,
        record.citationsJson,
        record.toolCallsJson,
        record.attachmentsJson,
        record.compressedIntoSummaryId,
        record.llmProvider,
        record.llmModelId,
        record.latencyMs,
        record.promptTokens,
        record.completionTokens,
        record.errorCode,
        record.createdAt,
      ],
    );
  }

  async listChatMessages(chatSessionId: string): Promise<ChatMessageRecord[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, chat_session_id, turn_index, role, content,
        citations_json, tool_calls_json, attachments_json,
        compressed_into_summary_id, llm_provider, llm_model_id,
        latency_ms, prompt_tokens, completion_tokens, error_code, created_at
       FROM chat_messages
       WHERE chat_session_id = ?
       ORDER BY turn_index ASC`,
      [chatSessionId],
    );
    return rows.map(rowToChatMessage);
  }

  async markChatMessagesCompressed(messageIds: string[], summaryId: string): Promise<void> {
    if (messageIds.length === 0) return;
    // mysql2 expands the bound array into the ?-placeholder list, e.g.
    // [["m1","m2","m3"]] → IN (?, ?, ?). Bounded by the compression
    // planner so this is never a million-id array.
    const placeholders = messageIds.map(() => "?").join(", ");
    await this.pool.execute(
      `UPDATE chat_messages
         SET compressed_into_summary_id = ?
       WHERE id IN (${placeholders})`,
      [summaryId, ...messageIds],
    );
  }

  // ── Summaries ───────────────────────────────────────────────────

  async appendConversationSummary(record: ConversationSummaryRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO conversation_summaries (
        id, chat_session_id, from_message_id, to_message_id, generation,
        absorbed_summary_ids_json, content, model, tokens_in, tokens_out, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.chatSessionId,
        record.fromMessageId,
        record.toMessageId,
        record.generation,
        record.absorbedSummaryIdsJson,
        record.content,
        record.model,
        record.tokensIn,
        record.tokensOut,
        record.createdAt,
      ],
    );
  }

  async listConversationSummaries(chatSessionId: string): Promise<ConversationSummaryRecord[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, chat_session_id, from_message_id, to_message_id, generation,
        absorbed_summary_ids_json, content, model, tokens_in, tokens_out, created_at
       FROM conversation_summaries
       WHERE chat_session_id = ?
       ORDER BY created_at DESC`,
      [chatSessionId],
    );
    return rows.map(rowToConversationSummary);
  }

  // ── Per-session entities ────────────────────────────────────────

  async upsertChatSessionEntity(record: ChatSessionEntityRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO chat_session_entities (
        chat_session_id, entity_key, last_frame, completed_frames_json,
        scan_progress_json, extracted_values_json, created_at, last_visited_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        last_frame = VALUES(last_frame),
        completed_frames_json = VALUES(completed_frames_json),
        scan_progress_json = VALUES(scan_progress_json),
        extracted_values_json = VALUES(extracted_values_json),
        last_visited_at = VALUES(last_visited_at)`,
      [
        record.chatSessionId,
        record.entityKey,
        record.lastFrame,
        record.completedFramesJson,
        record.scanProgressJson,
        record.extractedValuesJson,
        record.createdAt,
        record.lastVisitedAt,
      ],
    );
  }

  async listChatSessionEntities(chatSessionId: string): Promise<ChatSessionEntityRecord[]> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT chat_session_id, entity_key, last_frame, completed_frames_json,
        scan_progress_json, extracted_values_json, created_at, last_visited_at
       FROM chat_session_entities
       WHERE chat_session_id = ?`,
      [chatSessionId],
    );
    return rows.map(rowToChatSessionEntity);
  }

  // ── Viewer events ───────────────────────────────────────────────

  async appendViewerEvent(record: ViewerEventRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO viewer_events (
        id, chat_session_id, ts_ms, entity_key, action, source, detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.chatSessionId,
        record.timestamp,
        record.entityKey,
        record.action,
        record.source,
        record.detailJson,
      ],
    );
  }

  async listViewerEvents(chatSessionId: string, sinceTimestamp?: number): Promise<ViewerEventRecord[]> {
    if (sinceTimestamp != null) {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT id, chat_session_id, ts_ms, entity_key, action, source, detail_json
         FROM viewer_events
         WHERE chat_session_id = ? AND ts_ms >= ?
         ORDER BY ts_ms DESC`,
        [chatSessionId, sinceTimestamp],
      );
      return rows.map(rowToViewerEvent);
    }
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, chat_session_id, ts_ms, entity_key, action, source, detail_json
       FROM viewer_events
       WHERE chat_session_id = ?
       ORDER BY ts_ms DESC`,
      [chatSessionId],
    );
    return rows.map(rowToViewerEvent);
  }

  // ── Login-claim (re-key, not bulk-upload) ───────────────────────

  async rekeyAnonymousChatSessions(anonId: string, ownerUserId: string): Promise<{ rekeyedSessions: number }> {
    // One statement, atomic at the row level. Child rows (messages,
    // summaries, entities, viewer_events) reference chat_sessions.id
    // and inherit the new owner transitively — no need to touch them.
    const [result] = await this.pool.execute(
      `UPDATE chat_sessions
         SET owner_user_id = ?,
             owner_anon_id = NULL,
             updated_at = NOW()
       WHERE owner_anon_id = ?`,
      [ownerUserId, anonId],
    );
    const affected = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    return { rekeyedSessions: affected };
  }
}

// ── Row mappers ──────────────────────────────────────────────────────

function rowToChatSession(row: mysql.RowDataPacket): ChatSessionRecord {
  return {
    id: row.id,
    onboardingSessionId: row.onboarding_session_id,
    ownerUserId: row.owner_user_id,
    ownerAnonId: row.owner_anon_id,
    title: row.title,
    isOnboarding: Boolean(row.is_onboarding),
    activeEntityKey: row.active_entity_key,
    currentIntent: row.current_intent_json ? JSON.parse(row.current_intent_json) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
  };
}

function rowToChatMessage(row: mysql.RowDataPacket): ChatMessageRecord {
  return {
    id: row.id,
    chatSessionId: row.chat_session_id,
    turnIndex: row.turn_index,
    role: row.role,
    content: row.content,
    citationsJson: row.citations_json,
    toolCallsJson: row.tool_calls_json,
    attachmentsJson: row.attachments_json,
    compressedIntoSummaryId: row.compressed_into_summary_id,
    llmProvider: row.llm_provider,
    llmModelId: row.llm_model_id,
    latencyMs: row.latency_ms,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    errorCode: row.error_code,
    createdAt: new Date(row.created_at),
  };
}

function rowToConversationSummary(row: mysql.RowDataPacket): ConversationSummaryRecord {
  return {
    id: row.id,
    chatSessionId: row.chat_session_id,
    fromMessageId: row.from_message_id,
    toMessageId: row.to_message_id,
    generation: row.generation,
    absorbedSummaryIdsJson: row.absorbed_summary_ids_json,
    content: row.content,
    model: row.model,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    createdAt: new Date(row.created_at),
  };
}

function rowToChatSessionEntity(row: mysql.RowDataPacket): ChatSessionEntityRecord {
  return {
    chatSessionId: row.chat_session_id,
    entityKey: row.entity_key,
    lastFrame: row.last_frame,
    completedFramesJson: row.completed_frames_json,
    scanProgressJson: row.scan_progress_json,
    extractedValuesJson: row.extracted_values_json,
    createdAt: new Date(row.created_at),
    lastVisitedAt: new Date(row.last_visited_at),
  };
}

function rowToViewerEvent(row: mysql.RowDataPacket): ViewerEventRecord {
  return {
    id: row.id,
    chatSessionId: row.chat_session_id,
    timestamp: Number(row.ts_ms),
    entityKey: row.entity_key,
    action: row.action,
    source: row.source,
    detailJson: row.detail_json,
  };
}
