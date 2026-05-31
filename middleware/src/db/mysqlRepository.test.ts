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
    // 9 legacy CREATE TABLE statements + 1 information_schema probe + 1 ALTER
    // (mock reports all three viewer columns missing) = 11; shared-template-
    // lifecycle Phase 2 adds CREATE TABLE templates + the idempotent copy
    // INSERT…SELECT from extraction_schemas = 13.
    expect(statements).toHaveLength(13);
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
    // shared-template-lifecycle Phase 2 — templates table + idempotent copy.
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS templates");
    const copyStmt = statements.find((s) => /INSERT\s+INTO\s+templates/i.test(s))!;
    // Idempotent AND concurrent-safe: ON DUPLICATE KEY UPDATE no-ops on a
    // row already present, so re-runs do nothing and a multi-pod boot race on
    // the PRIMARY KEY can't throw (a plain INSERT would → CrashLoopBackOff).
    expect(copyStmt).toMatch(/ON\s+DUPLICATE\s+KEY\s+UPDATE\s+id\s*=\s*id/i);
    // A plain INSERT (no conflict handling) would be the bug — assert it's absent.
    expect(copyStmt).not.toMatch(/WHERE\s+id\s+NOT\s+IN/i);
    // Column MAPPING must be exact — a swapped column silently corrupts the
    // migration and substring matches wouldn't catch it. Pin INSERT target
    // columns AND the SELECT projection order (body_json ← schema_json,
    // kind ← literal 'extract', everything else 1:1).
    expect(copyStmt).toMatch(
      /INSERT\s+INTO\s+templates\s*\(\s*id\s*,\s*kind\s*,\s*groundx_username\s*,\s*name\s*,\s*body_json\s*,\s*created_at\s*,\s*updated_at\s*\)/i,
    );
    expect(copyStmt).toMatch(
      /SELECT\s+id\s*,\s*'extract'\s*,\s*groundx_username\s*,\s*name\s*,\s*schema_json\s*,\s*created_at\s*,\s*updated_at\s+FROM\s+extraction_schemas/i,
    );
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

    // Concurrency regression: multi-replica EKS / rolling update boots two pods
    // at once. Both probe "column missing" and both issue the ALTER; the loser
    // hits ER_DUP_FIELDNAME (errno 1060). A plain throw rejects createSchema()
    // → CrashLoopBackOff until the winner finishes. The ALTER must tolerate
    // losing the race (same class of fix as the templates copy-migration's
    // ON DUPLICATE KEY UPDATE).
    it("swallows a duplicate-column error from the ALTER (concurrent-pod race)", async () => {
      mysqlMock.execute.mockImplementation((sql: string) => {
        if (typeof sql === "string" && sql.includes("information_schema.COLUMNS")) {
          // We saw the columns as missing — so we'll issue the ALTER...
          return Promise.resolve([[], []]);
        }
        if (typeof sql === "string" && /^ALTER TABLE chat_sessions/i.test(sql)) {
          // ...but a concurrent pod already added them. MySQL: errno 1060.
          const err = Object.assign(new Error("Duplicate column name 'viewer_history_json'"), {
            code: "ER_DUP_FIELDNAME",
            errno: 1060,
          });
          return Promise.reject(err);
        }
        return Promise.resolve([[], []]);
      });
      const repository = new MySqlAppRepository(testEnv);

      // The race-loser must NOT crash the pod — createSchema resolves.
      await expect(repository.createSchema()).resolves.toBeUndefined();
      // It DID attempt the ALTER (it isn't silently skipping the migration).
      expect(alters()).toHaveLength(1);
    });

    it("re-throws a non-duplicate-column error from the ALTER (real failures still surface)", async () => {
      mysqlMock.execute.mockImplementation((sql: string) => {
        if (typeof sql === "string" && sql.includes("information_schema.COLUMNS")) {
          return Promise.resolve([[], []]);
        }
        if (typeof sql === "string" && /^ALTER TABLE chat_sessions/i.test(sql)) {
          // e.g. table genuinely gone, permissions, syntax — must NOT be eaten.
          const err = Object.assign(new Error("Table 'chat_sessions' doesn't exist"), {
            code: "ER_NO_SUCH_TABLE",
            errno: 1146,
          });
          return Promise.reject(err);
        }
        return Promise.resolve([[], []]);
      });
      const repository = new MySqlAppRepository(testEnv);

      await expect(repository.createSchema()).rejects.toThrow(/doesn't exist/);
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

  // 2026-05-31-core-data-followups §4c — row→object mapper union validation.
  //
  // The union-typed VARCHAR columns (`role`/`action`/`source`) used to be
  // blind-cast (`row.role` straight into `ChatMessageRecord.role`), so a
  // corrupt DB value would flow unchecked into LLM context. Parallel to the
  // `rowToTemplate` kind-guard precedent, the mappers now validate against the
  // shared row-enum schema and COERCE an out-of-union value to a safe in-union
  // default (so a single bad telemetry/message row is sanitized, not silently
  // trusted, and the row is not dropped — preserving turn ordering). A VALID
  // value maps through unchanged (behavior preserved).
  describe("row-mapper union validation (§4c)", () => {
    it("listChatMessages passes a valid role through unchanged", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "m1", chat_session_id: "c1", turn_index: 0, role: "assistant", content: "hi",
          citations_json: null, tool_calls_json: null, attachments_json: null,
          compressed_into_summary_id: null, llm_provider: null, llm_model_id: null,
          latency_ms: null, prompt_tokens: null, completion_tokens: null, error_code: null,
          created_at: "2026-05-31T00:00:00.000Z",
        }],
        [],
      ]);
      const [msg] = await repository.listChatMessages("c1");
      expect(msg.role).toBe("assistant");
    });

    it("listChatMessages coerces a corrupt role to a safe default (not blind-cast)", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "m1", chat_session_id: "c1", turn_index: 0, role: "HACKER", content: "x",
          citations_json: null, tool_calls_json: null, attachments_json: null,
          compressed_into_summary_id: null, llm_provider: null, llm_model_id: null,
          latency_ms: null, prompt_tokens: null, completion_tokens: null, error_code: null,
          created_at: "2026-05-31T00:00:00.000Z",
        }],
        [],
      ]);
      const [msg] = await repository.listChatMessages("c1");
      expect(msg.role).not.toBe("HACKER");
      expect(["user", "assistant", "system", "tool"]).toContain(msg.role);
      expect(msg.role).toBe("system");
    });

    it("listViewerEvents coerces a corrupt action + source (not blind-cast)", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "v1", chat_session_id: "c1", ts_ms: 100, entity_key: "e1",
          action: "DROP TABLE", source: "evil", detail_json: null,
        }],
        [],
      ]);
      const [evt] = await repository.listViewerEvents("c1");
      expect(evt.action).toBe("opened");
      expect(evt.source).toBe("system");
    });

    it("listViewerEvents passes valid action + source through unchanged", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "v1", chat_session_id: "c1", ts_ms: 100, entity_key: "e1",
          action: "citation-clicked", source: "user", detail_json: null,
        }],
        [],
      ]);
      const [evt] = await repository.listViewerEvents("c1");
      expect(evt.action).toBe("citation-clicked");
      expect(evt.source).toBe("user");
    });

    it("listIntentLog coerces a corrupt source (not blind-cast)", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "i1", chat_session_id: "c1", ts_ms: 100, source: "spoofed",
          intent_kind: "openDocument", intent_json: "{}",
        }],
        [],
      ]);
      const [log] = await repository.listIntentLog("c1");
      expect(log.source).toBe("system");
      // intent_kind is a free string discriminator (not a closed union) — unchanged.
      expect(log.intentKind).toBe("openDocument");
    });
  });

  // shared-template-lifecycle Phase 2 — templates repo methods.
  describe("templates (Phase 2)", () => {
    it("saveTemplate upserts INTO templates with the kind + body_json params", async () => {
      const repository = new MySqlAppRepository(testEnv);
      const createdAt = new Date("2026-05-29T00:00:00.000Z");
      await repository.saveTemplate({
        id: "t1",
        kind: "extract",
        groundxUsername: "gx-user",
        name: "Utility",
        bodyJson: '{"categories":[]}',
        createdAt,
        updatedAt: createdAt,
      });
      const [sql, params] = mysqlMock.execute.mock.calls.at(-1)!;
      expect(String(sql)).toContain("INTO templates");
      expect(String(sql)).toMatch(/ON DUPLICATE KEY UPDATE/i);
      expect(params).toEqual(["t1", "extract", "gx-user", "Utility", '{"categories":[]}', createdAt, createdAt]);
    });

    it("listTemplates filters by username AND kind and maps rows", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{ id: "e1", kind: "extract", groundx_username: "gx-user", name: "U", body_json: '{"categories":[]}', created_at: "2026-05-29T00:00:00.000Z", updated_at: "2026-05-29T00:00:00.000Z" }],
        [],
      ]);
      const rows = await repository.listTemplates("gx-user", "extract");
      const [sql, params] = mysqlMock.execute.mock.calls.at(-1)!;
      expect(String(sql)).toMatch(/WHERE\s+groundx_username\s*=\s*\?\s+AND\s+kind\s*=\s*\?/i);
      expect(params).toEqual(["gx-user", "extract"]);
      expect(rows).toEqual([
        { id: "e1", kind: "extract", groundxUsername: "gx-user", name: "U", bodyJson: '{"categories":[]}', createdAt: new Date("2026-05-29T00:00:00.000Z"), updatedAt: new Date("2026-05-29T00:00:00.000Z") },
      ]);
    });

    it("getTemplate maps a row; unknown id → null", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{ id: "t1", kind: "report", groundx_username: "gx-user", name: "R", body_json: '{"sections":[]}', created_at: "2026-05-29T00:00:00.000Z", updated_at: "2026-05-29T00:00:00.000Z" }],
        [],
      ]);
      await expect(repository.getTemplate("t1")).resolves.toMatchObject({ id: "t1", kind: "report", name: "R" });
      mysqlMock.execute.mockResolvedValueOnce([[], []]);
      await expect(repository.getTemplate("nope")).resolves.toBeNull();
    });

    it("getTemplate guards a corrupt kind → null (VARCHAR not blindly cast)", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{ id: "t1", kind: "bogus", groundx_username: "gx-user", name: "X", body_json: "{}", created_at: "2026-05-29T00:00:00.000Z", updated_at: "2026-05-29T00:00:00.000Z" }],
        [],
      ]);
      await expect(repository.getTemplate("t1")).resolves.toBeNull();
    });
  });
});
