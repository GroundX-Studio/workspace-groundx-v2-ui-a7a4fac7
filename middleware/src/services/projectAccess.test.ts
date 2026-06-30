/**
 * 2026-06-01-projects-rbac-scope-filter Task 4 — RBAC resolution + cross-user
 * isolation. Seeds grants in the in-memory repo and asserts the authorized set
 * + the rbac filter enforce read isolation between GroundX usernames.
 */
import { describe, expect, it } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import { seedSampleProject, SAMPLE_PROJECT_ID } from "../db/seedSampleProject.js";
import {
  authorizedProjectIds,
  createProjectWithOwner,
  rbacFilterForProjects,
  roleOnProject,
  writeUserGrant,
} from "./projectAccess.js";

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

describe("createProjectWithOwner — the first production user-grant writer", () => {
  it("inserts a project + an owner user-grant, in the creator's read set only", async () => {
    const repo = new MemoryAppRepository();
    const project = await createProjectWithOwner(repo, {
      name: "Q1 Filings",
      bucketId: 42,
      ownerUsername: "alice",
    });

    expect(project.projectId).toMatch(/^proj_/);
    expect(project.ownerUsername).toBe("alice");
    expect(project.isSample).toBe(false);
    expect(await repo.getProject(project.projectId)).toMatchObject({
      name: "Q1 Filings",
      bucketId: 42,
      ownerUsername: "alice",
      isSample: false,
    });

    // The owner grant lands in the RBAC read set; nobody else sees it.
    expect(await authorizedProjectIds(repo, "alice")).toContain(project.projectId);
    expect(await authorizedProjectIds(repo, "bob")).not.toContain(project.projectId);
    expect(await roleOnProject(repo, "alice", project.projectId)).toBe("owner");
    expect(await roleOnProject(repo, "bob", project.projectId)).toBeNull();
  });
});

describe("writeUserGrant — the share writer (cross-account)", () => {
  it("writes a user grant that lands in the grantee's authorized read set", async () => {
    const repo = new MemoryAppRepository();
    const project = await createProjectWithOwner(repo, { name: "P", bucketId: 1, ownerUsername: "alice" });

    await writeUserGrant(repo, { projectId: project.projectId, principalUsername: "carol", role: "viewer" });

    expect(await authorizedProjectIds(repo, "carol")).toContain(project.projectId);
    expect(await roleOnProject(repo, "carol", project.projectId)).toBe("viewer");
    // The grant does not bleed to an unrelated user.
    expect(await authorizedProjectIds(repo, "dave")).not.toContain(project.projectId);
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
