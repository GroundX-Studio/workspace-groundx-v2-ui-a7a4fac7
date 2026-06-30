# data-tier Specification (delta)

## ADDED Requirements

### Requirement: Authenticated customers SHALL create projects and share them via `user` grants

The middleware SHALL expose authenticated endpoints that write
`project_grants(principal_type='user')` rows — the production writers of the
RBAC graph the `2026-06-01-projects-rbac-scope-filter` resolver reads:

- **`POST /api/projects`** (gated to a signed-in GroundX customer) SHALL insert
  a `projects` row with `owner_username` = the creator's GroundX username and
  `is_sample=false`, AND a `project_grants` row
  `{principal_type:'user', principal_username:<creator>, role:'owner'}`. The
  project id SHALL be a real `proj_<uuid>`, never a slug. `bucket_id` is supplied
  by the caller.
- **`POST /api/projects/:projectId/grants`** (gated to a signed-in customer)
  SHALL let the project **owner** grant another GroundX username `viewer` or
  `editor`. The endpoint SHALL reject a non-owner caller (403), a self-share
  (400 — it would UPSERT-downgrade the owner's own grant), an unknown project
  (404), and a target username that does not exist in GroundX (404, validated
  via the Partner `getCustomer` lookup). The owner check SHALL run BEFORE the
  target-existence lookup so a non-owner cannot probe username existence.

RBAC resolution remains server-side only; these endpoints SHALL NOT return the
grant graph to the frontend (they return an inline project/grant projection, not
a shared FE type).

#### Scenario: An authenticated customer creates a project and is granted owner

- **GIVEN** a signed-in customer with GroundX username `gx-user`
- **WHEN** they `POST /api/projects {name, bucketId}`
- **THEN** a `projects` row (`owner_username='gx-user'`, `is_sample=false`) and a
  `project_grants{principal_type:'user', principal_username:'gx-user',
  role:'owner'}` row are persisted, the response is 201 with the project's
  `proj_<uuid>` id, and `authorizedProjectIds(repo, 'gx-user')` includes it

#### Scenario: A project owner shares with another GroundX username

- **GIVEN** `gx-user` owns `proj_x` and `gx-other` exists in GroundX
- **WHEN** `gx-user` does `POST /api/projects/proj_x/grants {principalUsername:'gx-other', role:'viewer'}`
- **THEN** a `project_grants{principal_type:'user', principal_username:'gx-other',
  role:'viewer'}` row is persisted and `authorizedProjectIds(repo, 'gx-other')`
  now includes `proj_x` — so the sharee's chat/search is RBAC-scoped to it

#### Scenario: Sharing is owner-only and validates the target

- **GIVEN** `proj_x` owned by `gx-user`
- **WHEN** a non-owner attempts the share → **THEN** 403; **WHEN** `gx-user`
  shares with a username GroundX does not know → **THEN** 404; **WHEN** `gx-user`
  shares with themselves → **THEN** 400
