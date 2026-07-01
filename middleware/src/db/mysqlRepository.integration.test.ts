import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";

import type { AppEnv } from "../config/env.js";
import { testEnv } from "../test/fakes.js";
import { MySqlAppRepository } from "./mysqlRepository.js";

/**
 * REAL-DB integration test for the boot schema reconciliation in
 * `MySqlAppRepository.createSchema()`.
 *
 * This is the test that would have caught the dev-chat outage: the mocked-pool
 * unit tests (`mysqlRepository.test.ts`) verify the DDL *strings*, but a string
 * can't reveal that `CREATE TABLE IF NOT EXISTS` is a no-op against an ALREADY-
 * PROVISIONED table — so a renamed column (`last_step_json`) was missing on the real
 * DB and every chat turn's first SELECT died with ER_BAD_FIELD_ERROR. These tests run
 * `createSchema()` against a real MySQL whose schema has been deliberately regressed,
 * then assert the reconciliation actually applied + a round-trip works.
 *
 * Gated on `MYSQL_TEST_HOST` (a disposable MySQL — Docker locally, a service
 * container in CI). Skipped when unset so the normal `npm test` run needs no DB.
 */
const HOST = process.env.MYSQL_TEST_HOST;
const suite = HOST ? describe : describe.skip;

const env: AppEnv = {
  ...testEnv,
  MYSQL_HOST: HOST ?? "localhost",
  MYSQL_PORT: Number(process.env.MYSQL_TEST_PORT ?? testEnv.MYSQL_PORT),
  MYSQL_DATABASE: process.env.MYSQL_TEST_DATABASE ?? testEnv.MYSQL_DATABASE,
  MYSQL_USER: process.env.MYSQL_TEST_USER ?? testEnv.MYSQL_USER,
  MYSQL_PASSWORD: process.env.MYSQL_TEST_PASSWORD ?? testEnv.MYSQL_PASSWORD,
};

suite("MySqlAppRepository.createSchema() against a real MySQL", () => {
  let conn: mysql.Connection;
  let repo: MySqlAppRepository;

  beforeAll(async () => {
    conn = await mysql.createConnection({
      host: env.MYSQL_HOST!,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE!,
      user: env.MYSQL_USER!,
      password: env.MYSQL_PASSWORD!,
      multipleStatements: true,
    });
    repo = new MySqlAppRepository(env);
  });

  afterAll(async () => {
    await conn?.end();
    // The repo holds a pool; end it so vitest can exit cleanly.
    await (repo as unknown as { pool: mysql.Pool }).pool.end();
  });

  beforeEach(async () => {
    await resetDb(conn);
  });

  async function resetDb(c: mysql.Connection): Promise<void> {
    await c.query("SET FOREIGN_KEY_CHECKS = 0");
    const [rows] = await c.query<mysql.RowDataPacket[]>(
      "SELECT table_name AS t FROM information_schema.TABLES WHERE table_schema = DATABASE()",
    );
    for (const r of rows) await c.query(`DROP TABLE IF EXISTS \`${r.t}\``);
    await c.query("SET FOREIGN_KEY_CHECKS = 1");
  }

  async function columnExists(table: string, column: string): Promise<boolean> {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, column],
    );
    return Number(rows[0].n) > 0;
  }

  // Insert a parent chat_sessions row (FK target for entities).
  async function seedSessionRow(id: string): Promise<void> {
    await repo.upsertChatSession({
      id,
      onboardingSessionId: "o1",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "T",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
      updatedAt: new Date("2026-06-22T00:00:00.000Z"),
      archivedAt: null,
    });
  }

  it("FRESH DB: boots with the current schema (last_step_json present, no dead columns)", async () => {
    await repo.createSchema();

    expect(await columnExists("chat_session_entities", "last_step_json")).toBe(true);
    expect(await columnExists("chat_session_entities", "reached_stages_json")).toBe(true);
    // agentic-template-item-editor — the uncommitted draft-Template column ships on a fresh DB.
    expect(await columnExists("chat_session_entities", "draft_template_json")).toBe(true);
    expect(await columnExists("chat_messages", "tool_calls_json")).toBe(false);
    expect(await columnExists("chat_sessions", "viewer_history_json")).toBe(false);
  });

  it("STALE DB missing draft_template_json: the additive ALTER adds it (data preserved)", async () => {
    // Provision the current schema, then REGRESS chat_session_entities to a
    // pre-draft_template_json shape — the exact state an already-live DB is in
    // the first time this change deploys. Unlike the pre-rename regression, this
    // must be an ADDITIVE reconcile (no drop, no data loss).
    await repo.createSchema();
    await seedSessionRow("sess-draft-stale");
    await conn.query("ALTER TABLE chat_session_entities DROP COLUMN draft_template_json");
    await conn.query(
      `INSERT INTO chat_session_entities (chat_session_id, entity_key, reached_stages_json)
       VALUES ('sess-draft-stale', 'e1', '[]')`,
    );
    expect(await columnExists("chat_session_entities", "draft_template_json")).toBe(false); // regressed

    await repo.createSchema(); // additive reconcile

    expect(await columnExists("chat_session_entities", "draft_template_json")).toBe(true);
    // The pre-existing row survived the additive ALTER (no drop+recreate).
    const rows = await repo.listChatSessionEntities("sess-draft-stale");
    expect(rows).toHaveLength(1);
    expect(rows[0].draftTemplateJson).toBeNull();
  });

  it("ROUND-TRIP: draft_template_json persists a TemplateSaveInput body and re-reads it (add → edit → remove)", async () => {
    await repo.createSchema();
    await seedSessionRow("sess-draft-rt");
    // A resolved TemplateSaveInput body (plain JSON — no Map/Set): the user added
    // a question, edited another's prompt, and removed a third. Only the resolved
    // question set is persisted, NOT overlay diffs.
    const draftBody = {
      name: null,
      kind: "extract",
      categories: [
        { name: "Totals", fields: [{ id: "f1", name: "Amount Due", type: "currency", instructions: "edited prompt" }] },
      ],
    };
    await repo.upsertChatSessionEntity({
      chatSessionId: "sess-draft-rt",
      entityKey: "e1",
      lastStepJson: null,
      reachedStagesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      draftTemplateJson: JSON.stringify(draftBody),
      bucketId: null,
      projectIdsJson: null,
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date("2026-06-30T00:00:00.000Z"),
      lastVisitedAt: new Date("2026-06-30T00:00:00.000Z"),
    });

    const afterWrite = await repo.listChatSessionEntities("sess-draft-rt");
    expect(afterWrite).toHaveLength(1);
    // mysql2 auto-parses JSON columns → the value round-trips as a parsed object.
    expect(afterWrite[0].draftTemplateJson as unknown).toMatchObject({
      name: null,
      categories: [{ fields: [{ id: "f1", name: "Amount Due", instructions: "edited prompt" }] }],
    });

    // Clearing the draft (user reverted to the committed template) persists as null.
    await repo.upsertChatSessionEntity({
      chatSessionId: "sess-draft-rt",
      entityKey: "e1",
      lastStepJson: null,
      reachedStagesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      draftTemplateJson: null,
      bucketId: null,
      projectIdsJson: null,
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date("2026-06-30T00:00:00.000Z"),
      lastVisitedAt: new Date("2026-06-30T00:00:00.000Z"),
    });
    const afterClear = await repo.listChatSessionEntities("sess-draft-rt");
    expect(afterClear[0].draftTemplateJson).toBeNull();
  });

  it("STALE pre-rename chat_session_entities: reconciled so the chat-turn SELECT works again", async () => {
    // 1. Provision the current schema, then REGRESS chat_session_entities to its
    //    pre-rename shape (last_frame / completed_frames_json, NO last_step_json) —
    //    exactly the state the dev DB was stuck in.
    await repo.createSchema();
    await seedSessionRow("sess-stale");
    await conn.query("DROP TABLE chat_session_entities");
    await conn.query(`
      CREATE TABLE chat_session_entities (
        chat_session_id VARCHAR(64) NOT NULL,
        entity_key VARCHAR(64) NOT NULL,
        last_frame VARCHAR(16) NULL,
        completed_frames_json JSON NOT NULL,
        scan_progress_json JSON NULL,
        extracted_values_json JSON NULL,
        bucket_id INT NULL,
        project_ids_json JSON NULL,
        group_id INT NULL,
        document_ids_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_session_id, entity_key),
        FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);
    await conn.query(
      `INSERT INTO chat_session_entities (chat_session_id, entity_key, completed_frames_json)
       VALUES ('sess-stale', 'e1', '[]')`,
    );
    expect(await columnExists("chat_session_entities", "last_step_json")).toBe(false); // regressed

    // 2. Boot again → reconciliation drops + recreates the table.
    await repo.createSchema();

    // 3. New schema is in place; the obsolete columns are gone.
    expect(await columnExists("chat_session_entities", "last_step_json")).toBe(true);
    expect(await columnExists("chat_session_entities", "reached_stages_json")).toBe(true);
    expect(await columnExists("chat_session_entities", "completed_frames_json")).toBe(false);
    expect(await columnExists("chat_session_entities", "last_frame")).toBe(false);

    // 4. The exact path that 500'd now round-trips cleanly.
    await seedSessionRow("sess-rt");
    await repo.upsertChatSessionEntity({
      chatSessionId: "sess-rt",
      entityKey: "e1",
      lastStepJson: JSON.stringify({ kind: "interact-chat" }),
      reachedStagesJson: JSON.stringify(["ingest", "understand", "analyze"]),
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: null,
      projectIdsJson: null,
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
      lastVisitedAt: new Date("2026-06-22T00:00:00.000Z"),
    });
    const entities = await repo.listChatSessionEntities("sess-rt");
    expect(entities).toHaveLength(1);
    // mysql2 auto-parses JSON columns, so the value round-trips as a parsed object
    // (the chat handler consumes it tolerantly). Normalize before asserting.
    const step = entities[0].lastStepJson as unknown;
    expect(JSON.stringify(step)).toContain("interact-chat");
  });

  it("LINGERING dead columns: createSchema drops them from an already-provisioned DB", async () => {
    await repo.createSchema();
    // Simulate an older DB that still carries the dropped columns.
    await conn.query("ALTER TABLE chat_messages ADD COLUMN tool_calls_json JSON NULL");
    await conn.query("ALTER TABLE chat_messages ADD COLUMN attachments_json JSON NULL");
    await conn.query("ALTER TABLE chat_sessions ADD COLUMN viewer_history_json JSON NULL");
    await conn.query("ALTER TABLE chat_sessions ADD COLUMN viewer_overlays_json JSON NULL");
    await conn.query("ALTER TABLE chat_sessions ADD COLUMN viewer_workspace_json JSON NULL");
    expect(await columnExists("chat_messages", "tool_calls_json")).toBe(true); // present

    await repo.createSchema();

    expect(await columnExists("chat_messages", "tool_calls_json")).toBe(false);
    expect(await columnExists("chat_messages", "attachments_json")).toBe(false);
    expect(await columnExists("chat_sessions", "viewer_history_json")).toBe(false);
    expect(await columnExists("chat_sessions", "viewer_overlays_json")).toBe(false);
    expect(await columnExists("chat_sessions", "viewer_workspace_json")).toBe(false);
  });

  it("IDEMPOTENT: a second boot on an already-current DB makes no destructive change", async () => {
    await repo.createSchema();
    await seedSessionRow("sess-idem");
    await repo.upsertChatSessionEntity({
      chatSessionId: "sess-idem",
      entityKey: "e1",
      lastStepJson: null,
      reachedStagesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: null,
      projectIdsJson: null,
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
      lastVisitedAt: new Date("2026-06-22T00:00:00.000Z"),
    });

    await repo.createSchema(); // second boot — must NOT drop the table or the row

    const entities = await repo.listChatSessionEntities("sess-idem");
    expect(entities).toHaveLength(1); // row survived → no needless DROP
  });
});
