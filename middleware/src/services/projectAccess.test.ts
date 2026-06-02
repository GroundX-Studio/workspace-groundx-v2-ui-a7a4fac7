/**
 * 2026-06-01-projects-rbac-scope-filter Task 4 — RBAC resolution + cross-user
 * isolation. Seeds grants in the in-memory repo and asserts the authorized set
 * + the rbac filter enforce read isolation between GroundX usernames.
 */
import { describe, expect, it } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import { seedSampleProject, SAMPLE_PROJECT_ID } from "../db/seedSampleProject.js";
import { authorizedProjectIds, rbacFilterForProjects } from "./projectAccess.js";

async function repoWithGrants(): Promise<MemoryAppRepository> {
  const repo = new MemoryAppRepository();
  await seedSampleProject(repo, 28454); // public sample
  const now = new Date();
  // user_a owns a private project; user_b owns another.
  for (const [pid, owner] of [
    ["proj_a", "user_a"],
    ["proj_b", "user_b"],
  ] as const) {
    await repo.insertProject({
      projectId: pid,
      bucketId: 1,
      name: pid,
      ownerUsername: owner,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });
    await repo.insertProjectGrant({
      projectId: pid,
      principalType: "user",
      principalUsername: owner,
      role: "owner",
      createdAt: now,
    });
  }
  return repo;
}

describe("authorizedProjectIds — RBAC read set", () => {
  it("anonymous (null) sees only public projects (the sample)", async () => {
    const repo = await repoWithGrants();
    expect(await authorizedProjectIds(repo, null)).toEqual([SAMPLE_PROJECT_ID]);
  });

  it("a signed-in user sees public + their own projects, NOT others'", async () => {
    const repo = await repoWithGrants();
    const a = await authorizedProjectIds(repo, "user_a");
    expect(a).toContain(SAMPLE_PROJECT_ID);
    expect(a).toContain("proj_a");
    expect(a).not.toContain("proj_b"); // cross-user isolation
  });
});

describe("rbacFilterForProjects — the $in deny", () => {
  it("emits a projectId $in filter (intersected with scope at GroundX)", () => {
    expect(rbacFilterForProjects(["proj_a", SAMPLE_PROJECT_ID])).toEqual({
      projectId: { $in: ["proj_a", SAMPLE_PROJECT_ID] },
    });
  });

  it("an empty authorized set denies everything ({$in: []})", () => {
    expect(rbacFilterForProjects([])).toEqual({ projectId: { $in: [] } });
  });
});
