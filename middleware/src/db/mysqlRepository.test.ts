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
    // 9 CREATE TABLE statements + shared-template-lifecycle Phase 2's
    // CREATE TABLE templates + the idempotent copy INSERT…SELECT from
    // extraction_schemas = 11. The Phase-1 viewer-column information_schema
    // probe + ALTER were dropped (2026-05-31-viewer-history-column-drop).
    // 2026-06-01-projects-rbac-scope-filter adds CREATE TABLE projects +
    // project_grants → 13.
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
    // 2026-06-01-projects-rbac-scope-filter — app-owned projects + RBAC grants.
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS projects");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS project_grants");
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

  // ── 2026-05-31-core-data-followups §4 #17 — dead persist-column closeout ──
  //
  // `chat_messages.tool_calls_json` was WRITE-ONLY (the chat handler wrote
  // `reply.tools` but nothing ever read it back into application/LLM context)
  // and `attachments_json` was DEAD (always written NULL, never read). Per the
  // §9 closeout rule a persist chain must have BOTH a reader and a writer OR be
  // dropped; adding a reader would surface tool-calls to the client (new
  // behavior, out of scope), so both columns were dropped. This guard fails
  // loudly if either column is reintroduced anywhere in the DDL or the
  // chat_messages INSERT/SELECT — i.e. if a write-only/dead column comes back.
  it("does not reintroduce the dropped tool_calls_json / attachments_json columns (§4 #17)", async () => {
    const repository = new MySqlAppRepository(testEnv);
    await repository.createSchema();
    const statements = mysqlMock.execute.mock.calls.map(([statement]) => String(statement));
    const joined = statements.join("\n").toLowerCase();
    expect(joined).not.toContain("tool_calls_json");
    expect(joined).not.toContain("attachments_json");
  });

  // ── 2026-05-31-viewer-history-column-drop — dead viewer-column closeout ──
  //
  // The three `chat_sessions` viewer JSON columns
  // (`viewer_history_json` / `viewer_overlays_json` / `viewer_workspace_json`)
  // were WRITE-NULL-ONLY: the full read/write/migration chain existed, but no
  // app mutator ever wrote a non-null value, so every reload saw NULL. Per the
  // §9 / §4 #17 closeout rule a persist chain must have BOTH a live reader AND a
  // live writer OR be dropped; wiring a viewer PATCH would be new product
  // behavior (out of scope), so the columns were dropped. This guard fails
  // loudly if any of the three is reintroduced in the ASSEMBLED `chat_sessions`
  // DDL, the `upsertChatSession` INSERT, OR the `listChatSessions` SELECT — i.e.
  // if the dead plumbing comes back on any of the three statements.
  it("does not reintroduce the dropped viewer_* chat_sessions columns (DDL + INSERT + SELECT)", async () => {
    const repository = new MySqlAppRepository(testEnv);

    // (1) DDL — every statement createSchema() actually issues.
    await repository.createSchema();
    const ddl = mysqlMock.execute.mock.calls.map(([s]) => String(s)).join("\n");

    // (2) INSERT — the actually-assembled `upsertChatSession` SQL string.
    mysqlMock.execute.mockClear();
    await repository.upsertChatSession({
      id: "s1",
      onboardingSessionId: "o1",
      ownerUserId: "u1",
      ownerAnonId: null,
      title: "T",
      isOnboarding: false,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: new Date("2026-05-31T00:00:00.000Z"),
      updatedAt: new Date("2026-05-31T00:00:00.000Z"),
      archivedAt: null,
    });
    const insertSql = String(mysqlMock.execute.mock.calls.at(-1)![0]);
    expect(insertSql).toContain("INSERT INTO chat_sessions");

    // (3) SELECT — the actually-assembled `listChatSessionsForUser` SQL string.
    mysqlMock.execute.mockClear();
    mysqlMock.execute.mockResolvedValueOnce([[], []]);
    await repository.listChatSessionsForUser("u1");
    const selectSql = String(mysqlMock.execute.mock.calls.at(-1)![0]);
    expect(selectSql).toMatch(/SELECT[\s\S]+FROM chat_sessions/);

    // The three dead columns must appear in NONE of the three statements.
    for (const col of ["viewer_history_json", "viewer_overlays_json", "viewer_workspace_json"]) {
      expect(ddl, `DDL still references dead column ${col}`).not.toContain(col);
      expect(insertSql, `INSERT still references dead column ${col}`).not.toContain(col);
      expect(selectSql, `SELECT still references dead column ${col}`).not.toContain(col);
    }
  });

  // ── 2026-05-31-viewer-history-column-drop — reduced-schema boot ──
  //
  // The Phase-1 viewer columns + their idempotent information_schema-probed
  // ALTER migration were DROPPED (write-NULL-only dead plumbing). These tests
  // pin both boot paths against the reduced schema:
  //   - Fresh boot: the chat_sessions CREATE TABLE carries no viewer_* column,
  //     and createSchema issues NO information_schema probe and NO ALTER tied
  //     to the dropped columns.
  //   - Existing-DB upgrade: an older DB that already has the viewer columns
  //     boots without error. Because the probe/ALTER are gone, a residual
  //     column is simply ignored (nothing writes it) — the drop is lossless.
  //
  // CAVEAT: these tests use a mocked mysql pool. They verify the boot's DDL
  // strings + branching, NOT that the DDL actually applies to a real MySQL
  // instance. A real-DB integration test is the only complete catch for
  // "schema migration ran end-to-end."
  describe("reduced-schema boot (viewer columns dropped)", () => {
    function statements(): string[] {
      return mysqlMock.execute.mock.calls.map(([s]) => String(s));
    }
    function chatSessionsCreate(): string {
      return statements().find((s) => /CREATE TABLE IF NOT EXISTS chat_sessions/i.test(s))!;
    }

    it("fresh boot: chat_sessions CREATE TABLE has no viewer_* column", async () => {
      mysqlMock.execute.mockResolvedValue([[], []]);
      const repository = new MySqlAppRepository(testEnv);

      await repository.createSchema();

      const create = chatSessionsCreate();
      expect(create).toBeDefined();
      expect(create).not.toContain("viewer_history_json");
      expect(create).not.toContain("viewer_overlays_json");
      expect(create).not.toContain("viewer_workspace_json");
    });

    it("fresh boot: no information_schema probe and no viewer-column ALTER are issued", async () => {
      mysqlMock.execute.mockResolvedValue([[], []]);
      const repository = new MySqlAppRepository(testEnv);

      await repository.createSchema();

      const joined = statements().join("\n");
      // The dropped migration's probe + ALTER must be gone entirely.
      expect(joined).not.toContain("information_schema.COLUMNS");
      expect(joined).not.toMatch(/ALTER TABLE chat_sessions.*viewer_/i);
    });

    it("existing-DB upgrade: boots without error against a DB that still has the viewer columns", async () => {
      // Simulate an older DB: the `CREATE TABLE IF NOT EXISTS` is a no-op
      // (the table already exists, with the legacy viewer columns). The
      // boot must complete with no error — and crucially must NOT issue any
      // probe/ALTER referencing the dropped columns (there is none left).
      mysqlMock.execute.mockResolvedValue([[], []]);
      const repository = new MySqlAppRepository(testEnv);

      await expect(repository.createSchema()).resolves.toBeUndefined();

      const joined = statements().join("\n");
      expect(joined).not.toContain("information_schema.COLUMNS");
      expect(joined).not.toMatch(/ALTER TABLE chat_sessions.*viewer_/i);
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
          citations_json: null,
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
          citations_json: null,
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

    // 2026-05-31-canvas-intent-schema-shared §4 — `current_intent_json` was
    // blind-cast (`parseJsonColumn(...) as ChatSessionRecord["currentIntent"]`),
    // so a corrupt/legacy persisted intent flowed unchecked into the read.
    // `rowToChatSession` now validates via the shared `parseCanvasIntent`
    // (same schema as the app hydration boundary), coercing an invalid intent
    // to `null` while a valid intent round-trips unchanged.
    it("getChatSession coerces a malformed current_intent_json to null (other fields intact)", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "s1", onboarding_session_id: "o1", owner_user_id: "u1", owner_anon_id: null,
          title: "T", is_onboarding: 1, active_entity_key: "e1",
          // real-looking `kind` but `openDocument` requires `documentId`.
          current_intent_json: { kind: "openDocument" },
          created_at: "2026-05-31T00:00:00.000Z", updated_at: "2026-05-31T00:00:00.000Z",
          archived_at: null,
        }],
        [],
      ]);
      const session = await repository.getChatSession("s1");
      expect(session).not.toBeNull();
      expect(session!.currentIntent).toBeNull();
      // Other fields unaffected by the intent coercion.
      expect(session!.id).toBe("s1");
      expect(session!.title).toBe("T");
      expect(session!.activeEntityKey).toBe("e1");
    });

    it("getChatSession passes a well-formed current_intent_json through (round-trips equal)", async () => {
      const repository = new MySqlAppRepository(testEnv);
      mysqlMock.execute.mockResolvedValueOnce([
        [{
          id: "s2", onboarding_session_id: "o2", owner_user_id: "u1", owner_anon_id: null,
          title: "T2", is_onboarding: 0, active_entity_key: null,
          current_intent_json: { kind: "openDocument", documentId: "util-1", page: 2 },
          created_at: "2026-05-31T00:00:00.000Z", updated_at: "2026-05-31T00:00:00.000Z",
          archived_at: null,
        }],
        [],
      ]);
      const session = await repository.getChatSession("s2");
      expect(session!.currentIntent).toEqual({ kind: "openDocument", documentId: "util-1", page: 2 });
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
