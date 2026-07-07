# Design — adopt-tanstack-query

## Why a library, not a hand-rolled cache

React deliberately does not solve server-state caching — `useState`/Context are for client state
(UI toggles, forms, preferences). Caching remote reads in a Context with `useEffect` is a known
anti-pattern: no caching, no de-duplication, no invalidation, and a remount refetches from
scratch (exactly the Interact ↔ Extract reload + COULD-NOT-LOAD). A server-state library solves
this by design: it caches by key, so a component that remounts and requests the same key gets the
cached data **instantly** with no refetch; it de-dupes concurrent requests; and it invalidates on
mutation. Hand-rolling a cache Map in a Context reinvents a slice of that, worse.

## Library choice — TanStack Query v5

| | TanStack Query | SWR | RTK Query |
| --- | --- | --- | --- |
| Weekly npm downloads | ~56M | ~7.7M | (in Redux Toolkit) |
| Market share (2025–26) | ~60–70% | ~15–20% | ~10–15% |
| Fit here | best features + DevTools, no Redux needed | lighter, fewer features | needs Redux (not in stack) |

The app has no Redux/Zustand/SWR today (verified in `app/package.json`), so TanStack Query is the
clean pick — the most popular, best-maintained, and modern choice, React 18/19 compatible.

## How it fits the existing architecture

Keep the `SdkActionResult` discriminated result at the SDK boundary. A `queryFn` calls the
existing SDK/entity method and either returns the data or throws on failure; TanStack Query owns
the cache/loading/error lifecycle above it. So the entity layer is not rewritten from scratch —
its methods become the `queryFn` bodies, and the per-entity Contexts become thin wrappers that
expose query/mutation hooks (or components call the hooks directly).

- **Query keys:** a `queryKeys` module (e.g. `['document', id]`, `['xray', id]`, `['extract', id]`,
  `['workflow', workflowId]`, `['fieldGeometry', id, queriesHash]`). Stable keys are what make a
  remount a cache hit.
- **Config:** `QueryClient` with a `staleTime` long enough that stable demo documents don't
  refetch within a session and a `gcTime` for retention.
- **Retry is a PREDICATE, not a blanket count.** The manual X-Ray retry
  (`DocumentsProvider.tsx:114–130`) is deliberately network-only: it retries the *fetch* 2× with
  backoff but parses ONCE outside the loop, because a malformed payload is a CONSISTENT error that
  must fail fast (a comment says so). A blanket `retry: 2` on the whole `queryFn` would wrongly
  re-fetch parse errors and 4xx. So the `retry` config is a predicate: retry transient
  network/5xx (≤2×, current backoff), never parse/validation or 4xx. The `queryFn` tags the parse
  failure (the Zod `.parse` throw) as non-retryable so the predicate can distinguish it. This
  preserves the exact network-only retry the hand-rolled loop had.

## Failed reads are not cached (toggle self-heal, not a regression)

TanStack Query caches *successful* data, not errors. So the no-refetch guarantee applies to reads
that SUCCEEDED; a read whose first load FAILED re-runs on the next mount. That is the desired
behavior — a broken first load should get a genuine retry when the user toggles back, not a cached
error frozen in place. The `ui-views` spec states this explicitly so it isn't mistaken for a
regression of the "toggle issues one fetch per key" rule (which is scoped to succeeded reads).

## Debug reset — the clear is belt-and-suspenders

`resetExperience.ts:79` hard-navigates (`window.location.assign`), which destroys the in-memory
`QueryClient` on remount. A naked `queryClient.clear()` would therefore be a dormant no-op the
guards can't see. The exhaustive-reset invariant is satisfied by adding `queryClient.clear()`
BEFORE the navigate AND asserting in the reset test — with the navigate seam stubbed — that the
cache is empty after `resetExperience` runs, proving the clear (not the reload) emptied it.
- **Mutations:** ingest/crawl/copy/update/delete become `useMutation` that
  `invalidateQueries` the affected document keys — the idiomatic replacement for the hand-rolled
  eviction the `viewer-read-cache` proposal described.
- **Cancellation:** delete each viewer widget's `loadSeqRef` monotonic-sequence guard — TanStack
  Query already discards stale results for a superseded key.

## The toggle bug is fixed as a side effect

Both viewer tabs read their data by stable query key. Toggling Interact → Extract → Interact
remounts the widgets, but each read is a cache hit → no network call, no loader flash, no
COULD-NOT-LOAD. This covers **both** tabs (including Extract's workflow + field-geometry reads,
which a `DocumentsContext`-only hand-rolled cache would have missed) because every read — wherever
it lives — goes through the same query cache.

## Loader synergy (`unified-loader`)

`useQuery` returns `isPending`/`isFetching`; a region feeds that straight into the shared
`<Loading>` boundary. So the two changes compose: TanStack Query answers "am I loading?", the
`<Loading>` boundary renders the shared mark in that region's place. No hand-rolled loading
booleans.

## Relationship to other changes

- **Supersedes `viewer-read-cache`** (deleted). The library is the cache; a bespoke Map is not
  added.
- **`unified-loader`** is orthogonal (loader presentation) and consumes `isPending`. Either order
  works; doing this first means the loader wires to real query state rather than hand-rolled flags.
- **`analyze-and-chat-ux`** touches chat/Extract but not the data-fetching layer — independent.

## Blast radius + phasing

The App provider chain is load-bearing (guarded by the App smoke test) — add
`QueryClientProvider` there and extend the smoke test. Migrate in two phases so the suite stays
green: Phase 1 (foundation + the five viewer reads) delivers the user-visible bug fix; Phase 2
migrates the remaining entity contexts. This is a Vite SPA, so SSR/hydration concerns do not
apply. A guard discourages new `useEffect`+fetch server reads so the migration doesn't regress.

## Test strategy (TDD)

- Provider + config mount; the App smoke chain still passes with `QueryClientProvider`.
- A viewer read via `useQuery`: two mounts of the same key → one network call; a failed read is
  not served stale; concurrent callers share one in-flight request (built-in dedup).
- A mutation invalidates the right keys; unrelated keys stay cached.
- User-visible: Interact → Extract → Interact issues one fetch per key and never shows
  COULD-NOT-LOAD on the second mount, for **both** tabs.
- Guard: no new server read uses `useEffect`+fetch; debug reset clears the `QueryClient`.
