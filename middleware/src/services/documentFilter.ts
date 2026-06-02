/**
 * 2026-06-02-flatten-document-filter — the single `DocumentFilter` definition +
 * `stampDocumentFilter` helper. This is the FLAT, GroundX-matchable map stamped
 * on every uploaded document: the `projectId` data-org/RBAC scoping key (+ the
 * extraction `workflow_id` when known). It carries NO app/UI metadata (the
 * scenario manifest lives app-side in `scenarios/sampleScenarios.ts`).
 *
 * Middleware-only (the FE never stamps documents). Callers: the seed
 * (`scripts/seed-bucket.ts`) now; the BYO-upload path when it lands.
 */
export interface DocumentFilter {
  /** The app project id (`proj_<uuid>`) — the GroundX search-`filter` scoping key. */
  projectId: string;
  /** The extraction workflow id (Extract widget schema discovery), when known. */
  workflow_id?: string;
}

export function stampDocumentFilter(input: { projectId: string; workflowId?: string }): DocumentFilter {
  return {
    projectId: input.projectId,
    ...(input.workflowId ? { workflow_id: input.workflowId } : {}),
  };
}
