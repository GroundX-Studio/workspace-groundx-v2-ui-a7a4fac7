/**
 * 2026-06-01-projects-rbac-scope-filter — seed the public sample project.
 *
 * The sample project is the FIRST row in the `projects` table: a single
 * app-owned project (a real `proj_<uuid>` id, never a slug) living in the
 * shared samples bucket, readable by EVERYONE via a `public/viewer` grant. Its
 * id is the value stamped on the sample document's GroundX `filter.projectId`,
 * so the scope→GroundX-filter path resolves to it for both anonymous onboarding
 * and signed-in callers.
 *
 * Idempotent: re-inserts (UPSERT) the same stable id on every boot, so it never
 * duplicates and always reconciles to the canonical shape.
 */
import type { AppRepository } from "../types.js";

/** Stable, unique project id for the seeded Utility sample. Real UUID, namespaced. */
export const SAMPLE_PROJECT_ID = "proj_c7701da7-0e08-482a-a496-df9dfe991613";
export const SAMPLE_PROJECT_NAME = "Utility Bill (sample)";

/**
 * Scenario-slug → real project id, for the seeded sample projects. The scope
 * producer resolves a `sample:<scenarioId>` entity through this so the RAG
 * filter uses the SAME `projectId` value stamped on the doc (a real id), not
 * the slug. Only `utility` is seeded today; add a scenario here when its
 * project + doc are seeded. An unmapped scenario falls back to its slug
 * (unchanged, non-functional-until-seeded behavior).
 */
export const SAMPLE_PROJECT_ID_BY_SCENARIO: Readonly<Record<string, string>> = {
  utility: SAMPLE_PROJECT_ID,
};

export async function seedSampleProject(
  repository: Pick<AppRepository, "insertProject" | "insertProjectGrant">,
  samplesBucketId: number,
): Promise<void> {
  const now = new Date();
  await repository.insertProject({
    projectId: SAMPLE_PROJECT_ID,
    bucketId: samplesBucketId,
    name: SAMPLE_PROJECT_NAME,
    ownerUsername: null, // system-owned; visibility comes from the public grant
    isSample: true,
    createdAt: now,
    updatedAt: now,
  });
  // Everyone (anonymous + every authenticated customer) can READ the sample.
  await repository.insertProjectGrant({
    projectId: SAMPLE_PROJECT_ID,
    principalType: "public",
    principalUsername: null,
    role: "viewer",
    createdAt: now,
  });
}
