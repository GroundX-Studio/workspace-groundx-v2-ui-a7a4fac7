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
    // 9 CREATE TABLE statements + 1 information_schema probe + the
    // ALTER TABLE migration only fires when columns are missing. The
    // mock returns [] (no rows) → all three viewer columns reported
    // missing → 1 ALTER fires. Total = 11.
    expect(statements).toHaveLength(11);
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
    // UI-10b — intent_log table (canvas-orchestrator dispatch trail).
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS intent_log");
    // CF-04 — app-owned saved-schemas table.
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS extraction_schemas");
    // master-viewer-session Phase 1 — idempotent migration probe + ALTER
    // when the viewer JSON columns are missing.
    expect(joined).toContain("information_schema.COLUMNS");
    expect(joined).toContain("ALTER TABLE chat_sessions ADD COLUMN viewer_history_json JSON NULL");
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

  // ── master-viewer-session Phase 1 — chat_sessions viewer-column migration ──
  //
  // Regression class: the upstream bug was "chat_sessions table was
  // created BEFORE the viewer JSON columns were added to the schema;
  // CREATE TABLE IF NOT EXISTS is a no-op so the columns never landed
  // on existing deployments; every upsertChatSession then failed with
  // 'Unknown column'." These tests pin the migration logic so it can't
  // regress to silently no-op'ing again.
  //
  // CAVEAT: these tests use a mocked mysql pool. They verify the
  // migration's DDL strings + branching, NOT that the DDL actually
  // applies to a real MySQL instance. A real-DB integration test
  // (testcontainers / disposable schema) is the only complete catch
  // for "schema migration didn't run end-to-end."
  describe("ensureChatSessionsViewerColumns migration (Phase 1 regression)", () => {
    function statements(): string[] {
      return mysqlMock.execute.mock.calls.map(([s]) => String(s));
    }
    function alters(): string[] {
      return statements().filter((s) => /^ALTER TABLE chat_sessions/i.test(s));
    }

    it("ALTERs in all three viewer columns when none exist (fresh upgrade path)", async () => {
      // First call → CREATE TABLE statements; the information_schema
      // probe returns an empty resultset → all three columns missing.
      mysqlMock.execute.mockResolvedValue([[], []]);
      const repository = new MySqlAppRepository(testEnv);

      await repository.createSchema();

      const alterStatements = alters();
      expect(alterStatements).toHaveLength(1);
      const alter = alterStatements[0];
      expect(alter).toContain("ADD COLUMN viewer_history_json JSON NULL");
      expect(alter).toContain("ADD COLUMN viewer_overlays_json JSON NULL");
      expect(alter).toContain("ADD COLUMN viewer_workspace_json JSON NULL");
      // Single statement holds all three — cheaper than three ALTERs.
      expect(alter.split(",").length).toBe(3);
    });

    it("ALTERs in only the missing columns when some already exist (partial migration)", async () => {
      // Probe returns one row → viewer_history_json already exists;
      // the other two are missing.
      mysqlMock.execute.mockImplementation((sql: string) => {
        if (typeof sql === "string" && sql.includes("information_schema.COLUMNS")) {
          return Promise.resolve([[{ COLUMN_NAME: "viewer_history_json" }], []]);
        }
        return Promise.resolve([[], []]);
      });
      const repository = new MySqlAppRepository(testEnv);

      await repository.createSchema();

      const alterStatements = alters();
      expect(alterStatements).toHaveLength(1);
      const alter = alterStatements[0];
      // Already-present column NOT added (note: `viewer_history_json`
      // may still appear in an `AFTER viewer_history_json` positional
      // hint, so we check the ADD COLUMN clause specifically).
      expect(alter).not.toContain("ADD COLUMN viewer_history_json");
      // Missing columns ARE added.
      expect(alter).toContain("ADD COLUMN viewer_overlays_json");
      expect(alter).toContain("ADD COLUMN viewer_workspace_json");
    });

    it("issues NO ALTER when all three viewer columns already exist (idempotent)", async () => {
      // Steady-state boot: all three columns present.
      mysqlMock.execute.mockImplementation((sql: string) => {
        if (typeof sql === "string" && sql.includes("information_schema.COLUMNS")) {
          return Promise.resolve([
            [
              { COLUMN_NAME: "viewer_history_json" },
              { COLUMN_NAME: "viewer_overlays_json" },
              { COLUMN_NAME: "viewer_workspace_json" },
            ],
            [],
          ]);
        }
        return Promise.resolve([[], []]);
      });
      const repository = new MySqlAppRepository(testEnv);

      await repository.createSchema();

      expect(alters()).toHaveLength(0);
    });

    it("probes information_schema before any ALTER (verifies the conditional path runs once)", async () => {
      mysqlMock.execute.mockResolvedValue([[], []]);
      const repository = new MySqlAppRepository(testEnv);

      await repository.createSchema();

      const probeStatements = statements().filter((s) => s.includes("information_schema.COLUMNS"));
      expect(probeStatements).toHaveLength(1);
      // The probe scopes to the right table + the right three columns.
      const probe = probeStatements[0];
      expect(probe).toContain("'chat_sessions'");
      expect(probe).toContain("'viewer_history_json'");
      expect(probe).toContain("'viewer_overlays_json'");
      expect(probe).toContain("'viewer_workspace_json'");
    });
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
