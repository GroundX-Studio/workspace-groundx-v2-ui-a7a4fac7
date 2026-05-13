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

  it("creates only the narrow sessions and app metadata tables", async () => {
    const repository = new MySqlAppRepository(testEnv);

    await repository.createSchema();

    const statements = mysqlMock.execute.mock.calls.map(([statement]) => String(statement));
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(statements[1]).toContain("CREATE TABLE IF NOT EXISTS app_user_metadata");
    const schema = statements.join("\n").toLowerCase();
    expect(schema).not.toContain("stripe");
    expect(schema).not.toContain("mailchimp");
    expect(schema).not.toContain("hubspot");
    expect(schema).not.toContain("subscription");
    expect(schema).not.toContain("bucket_name");
    expect(schema).not.toContain("project_name");
    expect(schema).not.toContain("document");
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
