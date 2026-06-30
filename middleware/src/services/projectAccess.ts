/**
 * 2026-06-01-projects-rbac-scope-filter Task 4 — server-side RBAC resolution.
 *
 * Turns the caller's grant graph into the `rbacFilter` that `searchGroundX`
 * composes (`$and`) with the scope filter, so a caller can only ever read
 * documents in projects they hold a grant on. Resolution is SERVER-SIDE only —
 * the frontend never sees grants; it builds a `ContentScope`, and this filter
 * intersects it with the authorized set at GroundX.
 */
import { randomUUID } from "node:crypto";

import type { AppRepository, ProjectGrantRecord, ProjectRecord, ProjectRole } from "../types.js";

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

// ──────────────────────────────────────────────────────────────────────────
// Writers — 2026-06-01-authed-project-create-grant.
//
// The FIRST production writers of a `user` grant (only the public sample grant
// was ever written before). These are PURE repo-only operations: authorization
// (who may share, sign-in gating) is policy decided at the route composition
// root, NOT here — keeping the service mechanism testable without HTTP or the
// partner client.
// ──────────────────────────────────────────────────────────────────────────

/** A real, namespaced project id (`proj_<uuid>`), never a slug. */
export function newProjectId(): string {
  return `proj_${randomUUID()}`;
}

/**
 * Write a `user` grant. Shared by BOTH the owner-grant-on-create path
 * (`createProjectWithOwner`) and the share path (the route) — its two real
 * callers. `insertProjectGrant` is an UPSERT on `(project_id, principal_type,
 * principal_username)`, so re-granting a principal updates their role.
 */
export async function writeUserGrant(
  repository: Pick<AppRepository, "insertProjectGrant">,
  input: { projectId: string; principalUsername: string; role: ProjectRole },
): Promise<ProjectGrantRecord> {
  const grant: ProjectGrantRecord = {
    projectId: input.projectId,
    principalType: "user",
    principalUsername: input.principalUsername,
    role: input.role,
    createdAt: new Date(),
  };
  await repository.insertProjectGrant(grant);
  return grant;
}

/**
 * Create an app-owned project and grant its creator `owner`. The owner grant is
 * what puts the project in the creator's `authorizedProjectIds` read set.
 */
export async function createProjectWithOwner(
  repository: Pick<AppRepository, "insertProject" | "insertProjectGrant">,
  input: { name: string; bucketId: number; ownerUsername: string },
): Promise<ProjectRecord> {
  const now = new Date();
  const project: ProjectRecord = {
    projectId: newProjectId(),
    bucketId: input.bucketId,
    name: input.name,
    ownerUsername: input.ownerUsername,
    isSample: false,
    createdAt: now,
    updatedAt: now,
  };
  await repository.insertProject(project);
  await writeUserGrant(repository, {
    projectId: project.projectId,
    principalUsername: input.ownerUsername,
    role: "owner",
  });
  return project;
}

/**
 * The caller's role on a SINGLE project, or `null` if they hold no `user` grant
 * on it. Used by the route to enforce owner-only sharing. Public grants are
 * intentionally ignored — this answers "what is THIS user's own role", not
 * "can anyone read it".
 */
export async function roleOnProject(
  repository: Pick<AppRepository, "listGrantsForPrincipal">,
  username: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const grants = await repository.listGrantsForPrincipal(username);
  const grant = grants.find(
    (g) => g.projectId === projectId && g.principalType === "user" && g.principalUsername === username,
  );
  return grant?.role ?? null;
}
