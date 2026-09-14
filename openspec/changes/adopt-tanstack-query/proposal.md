## Why

The app has **no server-state library**. Every remote read is hand-rolled in a per-entity React
Context over the `SdkActionResult` factory, with no caching, no request de-duplication, and no
invalidation. That is the direct cause of the reported bug: switching the Analyze tabs
(Interact ↔ Extract) fully unmounts one viewer widget and mounts the other, and with nothing
cached, each mount re-hits GroundX from scratch — the reload flicker, and the "COULD NOT LOAD
DOCUMENT" when one of those needless refetches fails.

This is a known anti-pattern. React's own state (`useState`/Context) is for *client* state (UI
toggles, forms, preferences); it is not built to cache *server* state, and using Context +
`useEffect` to do so has no caching/deduping/refetch control. The ecosystem-standard fix is a
server-state library. We are adopting one rather than hand-rolling a cache Map (a slice of what
the library already does, done worse).

**Library choice: TanStack Query (React Query) v5** — the most popular and best-maintained option
(~56M weekly npm downloads, ~60–70% market share, React 18/19 support, first-class DevTools).
SWR is lighter but less featured; RTK Query only fits when Redux is already in the stack (it is
not here). This change supersedes the hand-rolled `viewer-read-cache` proposal.

## What Changes

**Adopt TanStack Query v5 as the app's server-state layer.** Add `@tanstack/react-query` (+
devtools), mount a `QueryClient` provider in the app's provider chain, and move remote data
access onto it: **reads → `useQuery`** (keyed, cached, deduped, background-refetched),
**writes → `useMutation`** with query invalidation. `SdkActionResult` stays at the SDK boundary —
a `queryFn` calls the existing SDK method and returns its data or throws, and TanStack Query owns
the cache/loading/error lifecycle on top. The hand-rolled `loadSeq` cancellation each viewer
widget carries is deleted (the library ignores stale results). A `QueryClient` `staleTime` keeps
stable demo documents from refetching within a session; retry replaces the manual X-Ray retry.

Phased so the reported bug is fixed first and the suite stays green throughout:

- **Phase 1 — foundation + viewer reads (user-visible).** Provider + query-keys + config; migrate
  the viewer's five reads (document, X-Ray, extract, workflow, field-geometry) to `useQuery`. This
  alone fixes the Interact ↔ Extract reload and the COULD-NOT-LOAD for **both** the PDF and Extract
  tabs (same key on remount → instant cached data), and lets each region feed `isPending` into the
  shared `<Loading>` boundary (`unified-loader`).
- **Phase 2 — the rest of the data layer.** Migrate the remaining entity-context reads/mutations
  (documents list, templates, etc.) to `useQuery`/`useMutation`, with a guard nudging new server
  reads through the query layer instead of `useEffect` + `fetch`.

In scope: the library, provider, query-keys, config; the read/mutation migration (phased); removal
of per-widget `loadSeq`; the invalidate-on-mutation wiring. Out of scope: the loader visual
(`unified-loader`); changing GroundX endpoints or the `SdkActionResult` boundary shape;
introducing Redux/Zustand (client state stays in the existing contexts).

## Capabilities

### Modified Capabilities

- `app-architecture`: server-state (remote reads/writes) SHALL be owned by TanStack Query — reads
  via `useQuery` (keyed, cached, deduped, invalidated on mutation), writes via `useMutation`,
  behind a `QueryClientProvider` in the app provider chain; `SdkActionResult` remains the
  SDK-boundary result the `queryFn` adapts; hand-rolled per-widget load/cancel state is removed; a
  guard discourages new `useEffect`+fetch server reads.
- `ui-views`: toggling the Analyze sub-pills (Interact ↔ Extract) over the same document SHALL read
  from the query cache and SHALL NOT refetch, flash a loader on the second mount, or surface a
  COULD-NOT-LOAD produced by a needless refetch — for both the PDF and Extract tabs.

## Impact

- **Deps**: `@tanstack/react-query` v5 (+ `@tanstack/react-query-devtools`) in `app/package.json`.
- **App**: a `QueryClient` + `QueryClientProvider` in the App provider chain (load-bearing — the
  App smoke test guards provider order); a `queryKeys` module; migrate viewer reads to `useQuery`.
  Two of the five reads go through the entity context (`DocumentsContext` document/xray/extract);
  the other two go through the FLAT `api.*` client — `api.workflow.getGroundXWorkflow` (no
  `WorkflowsProvider` is mounted in `App.tsx`) and `api.extract.fetchFieldGeometry` — so the
  migration wraps both context and flat-client reads, not "the entity contexts" alone. Rebuild
  Extract's 4-call imperative chain as chained `enabled`-gated queries and re-home its
  `onFileNameResolved` side-effect. Consolidate the PARALLEL fetch chain
  (`hooks/useLiveExtract.ts` + `hooks/liveExtractData.ts` + `hooks/useLiveExtractionSchema.ts` +
  `hooks/liveExtractionSchemaData.ts`) onto the same query hooks so one fetch path serves both
  Extract and `SchemaView`. Migrate mutations (ingest/crawl/copy/update/delete) to `useMutation` +
  `invalidateQueries`; delete the viewer widgets' `loadSeqRef` cancellation; phase-2 migrate
  remaining entity contexts.
- **Contracts/guards**: `docs/agents/data-model.md` updated (server state now via TanStack Query);
  the App provider-chain smoke test extended for `QueryClientProvider`; a guard against new
  raw `useEffect`+fetch server reads; the debug reset clears the `QueryClient` cache
  (exhaustive-reset rule).
