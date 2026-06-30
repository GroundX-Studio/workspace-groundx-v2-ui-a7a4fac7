# WF-07: lock the GroundX ↔ product domain vocabulary

## Why

The product↔GroundX resource mapping was **right in one place and contradicted in another, with
no single source of truth** — which let an agent (me) mislabel a bucket as "probably a group" and
nearly bake it into the plans:

- `project_groundx_types.md` says `Workspace = GroundX bucket` ✅ — but buried in a type comment.
- `project_decisions_stack.md` decision #2 left it **unresolved**: "Phase 0 must map Workspace to
  *bucket, project, bucket+project, or group*."
- `project_decisions_stack.md` decision #31 then locked a **contradictory** mapping:
  "Solar **project view = group**."
- No OpenSpec capability defines the vocabulary, so there was nothing durable to check.

The correct, now-confirmed model:

| Product term | GroundX resource |
|---|---|
| **Workspace** | a **bucket** (1:1) |
| **Project / Portfolio / Fund / Folder** | a **filter field on documents** within the bucket (`filter:{projectId}` etc.) — NOT a separate resource |
| **Group** | ONLY a cross-bucket (cross-workspace) search construct (e.g. CF-19's multi-bucket pivot) |

The chat router already supports the `bucket+project` request shape, so the implementation was
fine; only the decision-doc mapping for the Solar scenario ("project view = group") was wrong.

(Operational footnote worth locking: MCP `bucket_get` can 400 "no access" under a
partner/cross-customer credential context even for a real bucket. `document_get` returning a
`bucketId` is the reliable existence signal — do not infer "not a bucket" from a `bucket_get` 400.)

## What changes

1. **Lock the vocabulary** as a durable `app-architecture` requirement (the table above), so there
   is one authoritative source instead of a buried comment + a contradictory decision.
2. **Reconcile the Solar ContentScope** in `scenarios`: Solar portfolio view = the Solar workspace
   **bucket** (bucket-wide); Solar project view = the SAME bucket **+ `filter:{projectId}`** — NOT a
   GroundX group. Verify the Solar scenario fixture's `ContentScope` in code and correct it if it
   uses `{ type: "group" }` for a project view.
3. **Drift guard**: a test asserting the Solar project-view `ContentScope` resolves to
   `bucket + projectId filter`, and that no scenario uses a `group` for a single-workspace project view.

## Out of scope

- CF-19 stays as-is — its `group` usage is the *correct* one (genuine multi-bucket search), not the
  project mechanism. WF-07 just confirms that boundary.
- Re-provisioning real customer buckets (Phase 0 provisioning is decision #2, already locked to bucket).

## Affected

- Memory (already corrected this session): `project_decisions_stack.md` #2 + #31,
  `project_groundx_types.md`, `project_groundx_search_geometry.md`.
- App/middleware: the Solar scenario fixture `ContentScope` (verify/correct), a drift-guard test.
- Specs: `app-architecture` (vocabulary lock), `scenarios` (Solar ContentScope reconciliation).
