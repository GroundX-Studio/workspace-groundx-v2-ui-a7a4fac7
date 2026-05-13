import mysql from "mysql2/promise";

import type { AppEnv } from "../config/env.js";
import type { AppRepository, AppUserMetadata, SessionRecord } from "../types.js";

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
}
