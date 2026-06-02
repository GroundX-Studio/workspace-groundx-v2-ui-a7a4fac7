# Authenticated project-create + cross-account share — the first production `user`-grant writer

## What

Two authed-customer endpoints that write `project_grants(principal_type='user')`
rows for the first time in production (only the public sample grant was ever
written before):

1. **`POST /api/projects`** — an authenticated customer creates an app-owned
   project. Inserts a `projects` row (`owner_username` = the creator's GroundX
   username, `is_sample=false`) **and** a `project_grants(principal_type='user',
   principal_username=<creator>, role='owner')` row.
2. **`POST /api/projects/:projectId/grants`** — the project **owner** shares it
   with another GroundX username at `viewer|editor` (the cross-account RBAC
   sharing the grant schema already supports). The target username is validated
   against the Partner API (`getCustomer`) before the grant is written.

## Why

`2026-06-01-projects-rbac-scope-filter` built the RBAC resolver
(`authorizedProjectIds → rbacFilterForProjects → searchGroundX`) and unit-tested
the `user`-grant branch (`projectAccess.test.ts` proves cross-user isolation),
but that branch has **no production writer** — only the public sample grant is
seeded. Until a real customer can create a project and be granted `owner` on it,
the only readable project is the public sample. This change ships that writer,
unblocking real (non-sample) projects + RBAC sharing.

## Scope

**In:**
- A pure, repo-only service layer for the writers (`projectAccess.ts`):
  `createProjectWithOwner`, `writeUserGrant`, `roleOnProject` (+ `newProjectId`).
- The two routes above, gated `requireAuthenticatedUser`, with HTTP error
  mapping done at the route (the composition root), consistent with existing
  inline ownership checks.
- `bucketId` is client-supplied (register provisions no bucket; customers create
  buckets via the existing `/api/bucket` Partner proxy, then point a project at
  one). No GroundX bucket-ownership check — the read path is already gated by the
  grant **and** the caller's own GroundX API key, so a project pointing at a
  foreign bucket is inert (its docs are not stamped with the new `projectId` and
  the caller's key cannot read the foreign bucket). Documented, not enforced.
- Self-share guard (sharing with yourself would UPSERT-downgrade your own owner
  grant → lockout) → 400.

**Out (tracked, not built — avoids dormant plumbing per discipline §8):**
- **BYO document upload + `filter.projectId` stamping.** There is no app-owned
  upload/ingest endpoint today (BYO docs go through the raw `/api/v1` GroundX
  proxy, which cannot stamp). `stampDocumentFilter` (`services/documentFilter.ts`)
  is the ready seam; the ingest-and-stamp endpoint that calls it is the tracked
  follow-up (`tasks.md` ticket §T6). Building stamp wiring with no caller now
  would be dormant plumbing.
- A FE `Project` view type in `@groundx/shared` — added only when a project /
  sharing UI consumes it (per `project_projects_rbac_filter`). The routes return
  an inline JSON projection, not a shared type.
- `principal_type='account'` / team grants — earn-the-axis; no second caller yet.

## Conformance to core architectural decisions

- **Composable-not-forked (principle 1):** no new component/fork. The writers are
  small functions on the existing `projectAccess.ts` mechanism, parameterized by
  value (`role`, `principalUsername`). `writeUserGrant` is shared by BOTH the
  owner-grant-on-create path and the share path (its **two real callers** — the
  axis is earned). Authorization is policy at the route composition root; the
  service stays pure mechanism. No new abstraction without a second caller.
- **Done-able (principle 5):** user-visible round-trip — after create+share, the
  sharee's `authorizedProjectIds` includes the project, so their chat/search is
  RBAC-scoped to it (the read path the prior change wired). Asserted end-to-end.
- **One source of truth (principle 6):** reuses `ProjectRecord` /
  `ProjectGrantRecord` / `ProjectRole` from `types.ts`, the `AppRepository`
  methods, and the existing `requireAuthenticatedUser` / `sessionUsername`
  accessors. No twin types; no new repository methods (the existing
  `insertProject` / `insertProjectGrant` / `getProject` / `listGrantsForPrincipal`
  suffice).
- **No secrets (principle 0):** no Partner `*username` key fields persisted; the
  share validation reads `getCustomer` only to confirm existence.
