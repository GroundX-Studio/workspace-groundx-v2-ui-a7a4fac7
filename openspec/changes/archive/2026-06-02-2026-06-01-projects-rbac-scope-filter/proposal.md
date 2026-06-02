# Projects + RBAC as the app-owned filter layer behind ContentScope

## Why

DL-1 root cause (confirmed live): onboarding chat scopes to bucket 28454 with a
`{projectId:["utility"]}` filter, but the seeded doc's GroundX `filter` carries
`scenarioId:"utility"` + a `manifest` blob and **no `projectId`** — so the search
pre-filter matches nothing → 0 snippets, even though the doc indexes as prose
(no-filter search returns 6 strong results incl. "Amount Due $ 7,613"). The
scope→filter MECHANISM is correct (that's why we refactored to
`ContentScope`/`compileScopeFilter`); the **filter DATA on the doc is wrong and
there is no system of record that maintains it.**

Fixing only the seed would leave the real gap: we have no app-owned model for
**what a "project" is**, **who can read it**, or **how that becomes a GroundX
search filter**. "project" (and portfolio/fund/folder) is locked as a *filter
field on documents within a bucket* (WF-07; `project_groundx_types`), used for
**both data organization AND RBAC**. This change builds that layer correctly,
once, as the universal basis every RAG query already flows through.

## Ownership reconciliation (anti-duplication — the explicit ask)

Per `reference_harness_conventions` ("don't add a MySQL table without checking
GroundX/Partner first — GroundX owns customers, buckets, groups, documents,
projects, workflows") and the live wiring (`ProjectsContext` +
`partnerProjectsEntity` already proxy GroundX **Partner Projects**, which group
whole *buckets*):

| Concept | Owner | Notes |
|---|---|---|
| Account / identity (the authenticated user) | **GroundX customer** (`session.ownerUserId`) | NOT a new MySQL table — referencing it would duplicate GroundX identity. |
| Bucket (workspace), group, document, search, workflow | **GroundX** | unchanged; never mirrored in MySQL. |
| Partner Project (groups *buckets*, numeric id) | **GroundX** | a COARSER concept; NOT our filter-project. Left as-is. |
| **App "project"** = a filter-VALUE on docs *within* a bucket (WF-07) | **App / MySQL** | GroundX does not model this granularity → the only net-new resource table. |
| **RBAC grants / sharing** over app-projects | **App / MySQL** | GroundX has no per-app share graph at this granularity. |
| Team/org account grouping (multiple customers) | **deferred** | earn-the-axis: no consumer yet; principal = a single customerId or `public` for now. |

Net new MySQL: **`projects`** + **`project_grants`** only. No `accounts` table
(principal = GroundX customerId); a team-grouping table is a tracked follow-up
when a teams feature has a real consumer.

## What changes

- **`projects`** (app-owned): `project_id` (`proj_<uuid>`) · `bucket_id` ·
  `name` · `owner_customer_id` (NULL for system/sample) · `is_sample` · ts.
- **`project_grants`** (app-owned RBAC/ACL): `project_id` · `principal_type`
  (`public`|`user`) · `principal_id` (GroundX customerId; NULL for public) ·
  `role` (`owner`|`editor`|`viewer`) · PK(project_id,principal_type,principal_id).
- **Shared (`@groundx/shared`, one Zod source, FE+MW):** keep `ContentScope` +
  `ScopeFilter` as the universal RAG input (unchanged). ADD only:
  - `DocumentFilter` — the flat map stamped on every doc at upload
    (`{ projectId, workflow_id? }`); both the seed and the future BYO-upload
    stamp it (≥2 callers → earns its shared home).
  - `Role` enum (`owner`|`editor`|`viewer`) — referenced by MW now; by the FE
    only when a project/sharing UI exists.
- **NO new FE data structures for RAG.** The FE keeps building a `ContentScope`
  (`scope.filter.projectId`); it never sees grants/rows. A shared **`Project`
  view** (`{projectId,name,bucketId,role}`, a PROJECTION — not the raw tables)
  is added *only* when a FE surface (project switcher / sharing) consumes it —
  tracked, not built now (no dead stub).
- **`compileRagFilter(caller, scope)` (middleware):** the universal translation
  — `authorizedProjectIds(caller)` (grant graph) ∩ requested projectIds, emitted
  as the `rbacFilter` `{projectId:{$in:…}}` that `searchGroundX` already composes
  via `$and`. One path for chat + report. RBAC stays server-side.
- **Seed fix:** one seeded `projects` row (`is_sample`) + one
  `project_grants(public,viewer)` row; re-stamp the sample doc's filter to a
  flat `{projectId, workflow_id}` (drop the `manifest` pollution).

## Relationship to other changes

- **Supersedes the root-cause + fix of `2026-06-01-rag-retrieval-correctness`**
  (that change's "scope→filter mismatch (a)" IS this). Its ground-truth
  regression suite rides on this fix and stays as the verification layer; this
  plan owns the structural fix. Reconcile/refile on kickoff.
- Reuses the **existing `searchGroundX` `rbacFilter` `$and` seam** — no new
  search path (composable, not forked).

## Conformance to core architectural decisions

- **Composable, not forked (1):** new behavior is values on the existing
  `ScopeFilter`/`rbacFilter` axes + the existing `$and` compose seam — no new
  RAG path. Every new abstraction names its ≥2nd caller (`DocumentFilter`: seed
  + BYO; `Project` view: deferred until a UI consumes it, so NOT built).
- **TDD (2):** Task 1 is a failing test asserting the live filter mismatch via a
  recorded fixture; Task-1.0 first proves a flat `{projectId}` filter actually
  matches in GroundX (today even `scenarioId` returns 0).
- **Done = user-visible + round-trip (5):** closeout re-verifies the live chat
  "amount due" answer cites a chunk; every persisted column has a read site
  (the grant columns feed `authorizedProjectIds`; drift-guarded).
- **One source of truth (6):** shared types are `@groundx/shared` Zod→infer
  (`DocumentFilter`, `Role`); DB rows are middleware-internal and NEVER shared to
  the FE; the FE's contract stays `ContentScope`. No twin types, no
  `Record<string,unknown>` placeholders.
- **No dup / no dead stub (the explicit ask):** the FE gains ZERO new types for
  this change; RBAC resolution is middleware-only; a `Project` view is added only
  on its first real FE consumer.

### Out of scope (tracked)
- Team/org accounts (multi-customer grouping) — until a teams feature exists.
- BYO upload UI + its project-create path — stamps `DocumentFilter` when built.
- A FE project switcher / sharing UI — adds the shared `Project` view then.
