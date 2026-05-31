# CF-19: multi-bucket ensureBucketGroup helper

**STATUS: BACKLOGGED (2026-05-30) — needs rework before it can run; NOT in the active set.**

> This proposal is broken as written. The GroundX group API, the entity
> data model, the scope discriminant, and the credential path are all
> described incorrectly below. See **Rework checklist** before any work
> resumes. Do not implement until the checklist is cleared and the
> proposal body is rewritten to match.

## Rework checklist (before un-backlogging)

Verified defects (each checked against real code / the GroundX API on
2026-05-30) that MUST be fixed before this change can run:

1. **Wrong endpoint.** Group creation is GroundX **`POST /v1/group`**
   (singular), not `/v1/groups`. Every reference in this proposal +
   tasks.md is wrong.
2. **Empty group on create.** `POST /v1/group` creates an EMPTY group
   (it only takes `name`, plus an optional single `bucketName` to
   auto-create one bucket). To actually search across N existing
   buckets you MUST then call **`group_addbucket`
   (`POST /v1/group/{groupId}/bucket/{bucketId}`)** once per bucket.
   The proposal never adds the buckets, so the group would be useless.
3. **False idempotency claim.** `POST /v1/group` has NO documented
   name-dedup — each call creates a new group. The "treats POST as
   idempotent on the deterministic name (returns the existing group
   id)" claim is false. The helper must **find-or-create explicitly**
   (list groups, match by name, create only on miss).
4. **False data model.** `ChatSessionEntityRecord`
   (`middleware/src/types.ts` ~95-130) has **NO `bucketIds` array**.
   It carries singular `bucketId: number | null`, plus a separate
   `groupId: number | null`, `projectIdsJson`, and `documentIdsJson`.
   The "entity with `bucketIds: [B1, B2]`" framing has no basis in the
   real record. Rework must decide where a multi-bucket list actually
   comes from before wiring anything.
5. **Retired scope shape.** The proposal/tasks use `{ kind: "group", … }`.
   `ContentScope` (`shared/src/index.ts`) now uses the **`type:`**
   discriminant (`type: "bucket" | "group" | "documents"`). `kind:` is
   retired for scopes.
6. **Wrong credential.** Groups are created with the **CUSTOMER key**
   (`X-API-Key` via `GroundXClient.forward`), NOT the Partner client.
   The proposal/tasks repeatedly say "via the Partner client" — wrong.
7. **Wrong line number.** The `TODO(CF-19)` marker is at
   **`chatRouter.ts` ~911** (verified), not `852`. The tasks.md
   `852-862` range is also wrong.

## Why

`middleware/src/services/chatRouter.ts:852` has a long-standing
`TODO(CF-19)` marker. The chat router's RAG search supports five
GroundX request shapes (bucket / bucket+1-project / bucket+N-projects
/ group / documents), but only the GROUP shape works when the caller
has multiple bucket ids — and only when the caller can supply an
existing `groupId`. There's no helper that takes a list of bucket ids,
finds-or-creates a GroundX Group, and returns the id.

Today this means:

- An entity with `bucketIds: [B1, B2]` falls through to the
  `{kind: "unknown"}` scope.
- The middleware logs `rag search dispatched with kind=unknown —
  falling back to /v1/search/documents` and the search misses the
  user's docs.
- The "no snippets" branch fires and the LLM apologizes for not
  finding anything — even though the docs exist in the user's
  buckets.

The `chat-routing` capability spec already carries the
**"Multi-bucket pivots SHALL resolve via a cached ensureBucketGroup
helper"** requirement (durable, but currently labeled "held pending an
upstream caller"). CF-19 finally implements it.

## What changes

- ADD `ensureBucketGroup(bucketIds: number[]): Promise<number>` to
  the middleware service layer. Cache key is the sorted-id list
  serialized as `"B1,B2,..."`. On first call: `POST /v1/groups` via
  the Partner client with a deterministic name
  (`gx-studio-auto-${cacheKey}` is sufficient); cache the returned id.
  Subsequent calls return the cached id without an API roundtrip.
- THREAD the helper into `deriveRagContentScope` in `chatHandler.ts`:
  when an active entity carries `bucketIds.length > 1`, call
  `ensureBucketGroup` and return `{ kind: "group", groupId }`.
- KEEP the single-bucket path unchanged
  (`bucketIds.length === 1` → `{ kind: "bucket", bucketId }`).
- ADD a unit test that mocks the Partner client to verify:
  first multi-bucket pivot issues exactly one POST; second call
  with the same ids issues zero POSTs.
- DELETE the `TODO(CF-19)` comment from `chatRouter.ts`.

The durable chat-routing requirement loses its "held pending an
upstream caller" sentence once the helper is wired — the spec delta
MODIFIES that requirement.

## Out of scope

- **Group invalidation / cleanup.** Groups never get deleted in this
  change. If the user removes a bucket from an entity, the group
  stays. A future change can add lifecycle management when there's a
  forcing function.
- **Persistence across restarts.** The cache is in-memory only.
  A restart re-issues `POST /v1/groups`, which the GroundX API
  treats as idempotent on the deterministic name (returns the
  existing group id). Future work can move the cache to a DB row
  for cost savings on cold starts.
- **TTL / size limits.** The cache is unbounded for this v1.
  In practice the number of unique multi-bucket combinations a
  single tenant uses is small.

## Affected

- Middleware: `services/chatRouter.ts` (delete TODO),
  `services/chatHandler.ts` (`deriveRagContentScope` wiring), one new
  helper module (likely `services/ensureBucketGroup.ts`), and a new
  unit test.
- Specs: `chat-routing` (MODIFIES the existing requirement to drop
  the "held pending" language).
