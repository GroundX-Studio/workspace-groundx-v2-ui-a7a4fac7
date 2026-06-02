/**
 * 2026-06-01-projects-rbac-scope-filter — projects + grants round-trip and the
 * sample-project seed (the first DB row + a public/viewer grant readable by
 * everyone).
 */
import { describe, expect, it } from "vitest";

import { MemoryAppRepository } from "./memoryRepository.js";
import { SAMPLE_PROJECT_ID, seedSampleProject } from "./seedSampleProject.js";

describe("projects + project_grants repository", () => {
  it("round-trips a project and its grants", async () => {
    const repo = new MemoryAppRepository();
    const now = new Date();
    await repo.insertProject({
      projectId: "proj_x",
      bucketId: 99,
      name: "X",
      ownerCustomerId: "cust_a",
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });
    await repo.insertProjectGrant({
      projectId: "proj_x",
      principalType: "user",
      principalId: "cust_a",
      role: "owner",
      createdAt: now,
    });

    expect((await repo.getProject("proj_x"))?.bucketId).toBe(99);
    expect((await repo.listProjectsForBucket(99)).map((p) => p.projectId)).toEqual(["proj_x"]);
    // Owner can read; a different customer cannot; anon cannot.
    expect((await repo.listGrantsForPrincipal("cust_a")).map((g) => g.projectId)).toContain("proj_x");
    expect((await repo.listGrantsForPrincipal("cust_b")).map((g) => g.projectId)).not.toContain("proj_x");
    expect((await repo.listGrantsForPrincipal(null)).map((g) => g.projectId)).not.toContain("proj_x");
  });

  it("seeds the sample project as a public/viewer grant readable by everyone", async () => {
    const repo = new MemoryAppRepository();
    await seedSampleProject(repo, 28454);

    const project = await repo.getProject(SAMPLE_PROJECT_ID);
    expect(project?.isSample).toBe(true);
    expect(project?.bucketId).toBe(28454);
    expect(project?.ownerCustomerId).toBeNull();

    // Anonymous AND any authenticated customer can read the sample.
    for (const caller of [null, "cust_anyone"]) {
      const grants = await repo.listGrantsForPrincipal(caller);
      expect(grants.map((g) => g.projectId)).toContain(SAMPLE_PROJECT_ID);
    }
  });

  it("seed is idempotent (re-running does not duplicate)", async () => {
    const repo = new MemoryAppRepository();
    await seedSampleProject(repo, 28454);
    await seedSampleProject(repo, 28454);
    expect((await repo.listProjectsForBucket(28454)).length).toBe(1);
    expect((await repo.listGrantsForPrincipal(null)).filter((g) => g.projectId === SAMPLE_PROJECT_ID).length).toBe(1);
  });
});
