# CF-19: multi-bucket ensureBucketGroup helper

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
