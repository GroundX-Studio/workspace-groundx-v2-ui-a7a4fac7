import { beforeEach, describe, expect, it, vi } from "vitest";

const mysqlMock = vi.hoisted(() => ({
  execute: vi.fn(),
  createPool: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: mysqlMock.createPool,
  },
}));

import { MySqlAppRepository } from "./mysqlRepository.js";
import { testEnv } from "../test/fakes.js";

describe("MySqlAppRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mysqlMock.createPool.mockReturnValue({ execute: mysqlMock.execute });
    mysqlMock.execute.mockResolvedValue([[], []]);
  });

  it("creates the app-owned tables: sessions, app_user_metadata, and the 5 chat tables", async () => {
    const repository = new MySqlAppRepository(testEnv);

    await repository.createSchema();

    const statements = mysqlMock.execute.mock.calls.map(([statement]) => String(statement));
    expect(statements).toHaveLength(7);
    const joined = statements.join("\n");
    // Auth + metadata.
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS app_user_metadata");
    // Chat-session tables (per project_database.md).
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS chat_sessions");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS chat_messages");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS conversation_summaries");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS chat_session_entities");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS viewer_events");
    // App-owned only — no GroundX/Partner duplicates.
    const lower = joined.toLowerCase();
    expect(lower).not.toContain("stripe");
    expect(lower).not.toContain("mailchimp");
    expect(lower).not.toContain("hubspot");
    expect(lower).not.toContain("subscription");
    expect(lower).not.toContain("bucket_name");
    expect(lower).not.toContain("project_name");
    // "document" appears in "documents" tables we DON'T create. Allow
    // "compressed_into_summary_id" but forbid any `documents` table /
    // column.
    expect(lower).not.toMatch(/\bcreate table.*documents?\b/);
  });

  it("stores session rows with GroundX username and optional encrypted key only", async () => {
    const repository = new MySqlAppRepository(testEnv);
    const expiresAt = new Date("2026-01-01T00:00:00.000Z");

    await repository.createSession({
      id: "session-1",
      groundxUsername: "gx-user",
      groundxApiKeyEnc: "encrypted-key",
      expiresAt,
    });

    expect(mysqlMock.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sessions"),
      ["session-1", "gx-user", "encrypted-key", expiresAt]
    );
  });

  it("round-trips app metadata without duplicating GroundX resources", async () => {
    const repository = new MySqlAppRepository(testEnv);

    await repository.upsertMetadata({
      groundxUsername: "gx-user",
      onboardingState: "complete",
      uiPreferencesJson: JSON.stringify({ density: "compact" }),
      featureFlagsJson: JSON.stringify({ beta: true }),
      lastActiveProjectId: "project-id-only",
      acceptedTermsAt: new Date("2026-01-02T00:00:00.000Z"),
      appRole: "admin",
    });

    expect(mysqlMock.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO app_user_metadata"),
      [
        "gx-user",
        "complete",
        JSON.stringify({ density: "compact" }),
        JSON.stringify({ beta: true }),
        "project-id-only",
        new Date("2026-01-02T00:00:00.000Z"),
        "admin",
      ]
    );
  });

  it("maps session and metadata rows back to typed records", async () => {
    const repository = new MySqlAppRepository(testEnv);
    mysqlMock.execute
      .mockResolvedValueOnce([[{ id: "session-1", groundx_username: "gx-user", groundx_api_key_enc: "encrypted", expires_at: "2026-01-01T00:00:00.000Z" }], []])
      .mockResolvedValueOnce([[{
        groundx_username: "gx-user",
        onboarding_state: "complete",
        ui_preferences_json: "{\"density\":\"compact\"}",
        feature_flags_json: "{\"beta\":true}",
        last_active_project_id: "project-id-only",
        accepted_terms_at: "2026-01-02T00:00:00.000Z",
        app_role: "admin",
      }], []]);

    await expect(repository.getSession("session-1")).resolves.toMatchObject({
      id: "session-1",
      groundxUsername: "gx-user",
      groundxApiKeyEnc: "encrypted",
    });
    await expect(repository.getMetadata("gx-user")).resolves.toMatchObject({
      groundxUsername: "gx-user",
      onboardingState: "complete",
      lastActiveProjectId: "project-id-only",
      appRole: "admin",
    });
  });
});
