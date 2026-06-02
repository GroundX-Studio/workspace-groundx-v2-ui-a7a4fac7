/**
 * 2026-06-01-projects-rbac-scope-filter Task 4 — server-side RBAC resolution.
 *
 * Turns the caller's grant graph into the `rbacFilter` that `searchGroundX`
 * composes (`$and`) with the scope filter, so a caller can only ever read
 * documents in projects they hold a grant on. Resolution is SERVER-SIDE only —
 * the frontend never sees grants; it builds a `ContentScope`, and this filter
 * intersects it with the authorized set at GroundX.
 */
import type { AppRepository } from "../types.js";

/**
 * The set of project ids the caller may READ: every project with a `public`
 * grant, plus (for a signed-in customer) every project granted to their
 * `username`. `null` username = anonymous → public projects only.
 */
export async function authorizedProjectIds(
  repository: Pick<AppRepository, "listGrantsForPrincipal">,
  username: string | null,
): Promise<string[]> {
  const grants = await repository.listGrantsForPrincipal(username);
  return [...new Set(grants.map((g) => g.projectId))];
}

/**
 * The RBAC search filter for an authorized project set. Composed via `$and`
 * with the scope filter in `searchGroundX`, so it INTERSECTS the requested
 * scope: a caller asking for a project not in their set yields no results
 * (implicit deny), and an empty set (`{$in: []}`) denies everything.
 */
export function rbacFilterForProjects(projectIds: string[]): Record<string, unknown> {
  return { projectId: { $in: projectIds } };
}
