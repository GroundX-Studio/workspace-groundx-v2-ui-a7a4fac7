# Tasks — adopt-tanstack-query

Adopt TanStack Query v5 as the server-state layer. TDD (failing test first), adversarial-review
gate after each task, suite green at every step. Two phases: Phase 1 delivers the user-visible
toggle fix; Phase 2 migrates the rest of the data layer.

## Phase 1 — foundation + viewer reads (user-visible bug fix)

- [ ] 1.1 Add deps (TDD/smoke) — `@tanstack/react-query` v5 + `@tanstack/react-query-devtools` in
      `app/package.json`; typecheck + install green.
- [ ] 1.2 `QueryClient` + `QueryClientProvider` in the App provider chain (TDD) — extend the App
      provider-chain smoke test (order is load-bearing) so it still mounts with the new provider.
      Configure `staleTime` (long enough that stable demo docs don't refetch within a session)
      and `gcTime`.
- [ ] 1.2a Retry as a PREDICATE, not a blanket count (TDD) — the manual X-Ray retry
      (`DocumentsProvider.tsx:114–130`) is deliberately NETWORK-ONLY: it retries the *fetch* 2×
      with backoff but parses ONCE outside the loop because a malformed payload is a CONSISTENT
      error that must fail fast (no re-fetch). A blanket `retry: 2` on the whole `queryFn` would
      wrongly re-fetch parse errors and 4xx. Design a `retry` predicate: retry only transient
      network/5xx failures (≤2×, matching the current backoff), and DO NOT retry parse/validation
      errors or 4xx. Tag the parse failure so the predicate can distinguish it (e.g. a typed
      error the Zod `.parse` throws, non-retryable). Test: a network blip re-fetches ≤2×; a
      parse error fails fast on the first attempt (no re-fetch); a 4xx fails fast.
- [ ] 1.3 `queryKeys` module (TDD) — stable keys for `document`, `xray`, `extract`, `workflow`,
      `fieldGeometry`. Test the key builders are stable + collision-free.
- [ ] 1.4 Migrate the viewer's five reads to `useQuery` (TDD) — `getDocument`, `getDocumentXray`,
      `getDocumentExtract`, `api.workflow.getGroundXWorkflow` (flat `api.*` client — no
      `WorkflowsProvider` is mounted), `api.extract.fetchFieldGeometry` (flat `api.*` client).
      `queryFn` calls the existing SDK/entity method, returns data or throws; `SdkActionResult`
      stays at the boundary. Test: two mounts of the same key → one network call; concurrent
      callers share one in-flight request; a failed read is not served stale.
- [ ] 1.5 Rebuild Extract's imperative fetch chain as chained `useQuery`s (TDD) — this is the
      LARGEST task. Extract (`app/src/components/viewer-widgets/Extract/Extract.tsx:~382–443`)
      today runs a 4-call imperative chain inside a `useScopeAdapter` callback
      (`getDocument` → derive `filter.workflow_id` → `api.workflow.getGroundXWorkflow` →
      `getDocumentExtract` → `api.extract.fetchFieldGeometry`), driving FOUR `useState` sinks
      (`liveSchema`, `liveValues`, `liveGeometry`, `liveConfidences`) plus the `loadSeqRef`
      cancellation guard. Break it into per-read subtasks, each a `useQuery` whose `enabled`
      chains on the prior result's data (so a read only fires once its dependency resolved):
  - [ ] 1.5a `document` query keyed by `liveDocId` (skip placeholder ids — `enabled` gated by
        `isResolvedDocumentId`). Derives `filter.workflow_id`.
  - [ ] 1.5b `workflow` query keyed by the derived `workflow_id`, `enabled` on 1.5a's data;
        `workflowToSchema` maps it to `liveSchema` (was `setLiveSchema`).
  - [ ] 1.5c `extract` query keyed by `liveDocId`, `enabled` on 1.5b's schema; `extractToValues`
        / `extractToConfidences` derive `liveValues` + `liveConfidences` (was two `useState`s).
  - [ ] 1.5d `fieldGeometry` query keyed by `liveDocId` + a stable hash of the derived queries,
        `enabled` on 1.5c's values; derives `liveGeometry` (was `setLiveGeometry`).
  - [ ] 1.5e Replace the four `useState` sinks with values derived from the query data (no
        imperative `setState`); delete `loadSeqRef` and the `isStale()` guard (TanStack Query
        discards superseded keys). Re-home the `onFileNameResolved` side-effect
        (`PdfViewerWidget.tsx:~245`) as an effect-on-`data` (fire when the `document` query
        resolves), not inside a fetch callback.
  - [ ] 1.5f Wire PdfViewer to its `document`/`xray` query hooks; delete its `loadSeqRef`;
        loading/error come from the query. Preserve `data-loading` + `aria-label` on both
        widgets. Keep the manifest fallback (a failed/empty live read still renders the
        manifest schema, matching today's `catch`).
- [ ] 1.5g Consolidate the PARALLEL fetch chain (TDD) — `app/src/hooks/useLiveExtract.ts`,
      `hooks/liveExtractData.ts`, `hooks/useLiveExtractionSchema.ts`,
      `hooks/liveExtractionSchemaData.ts` run the SAME `getDocument → workflow → extract` chain
      for `SchemaView`'s standalone/`ProposeSchemaFieldCard` mounts. Either migrate them onto the
      SAME `useQuery` hooks from 1.4/1.5 (preferred — one fetch path, shared cache) or, if a
      reader genuinely can't yet, grandfather it in the 2.2 guard with a written reason. No two
      fetch paths for the same data may survive Phase 1.
- [ ] 1.6 Viewer mutations → `useMutation` + `invalidateQueries` (TDD) — ingest / crawl / copy /
      update / delete invalidate the affected document keys. Test: a mutation forces a refetch of
      the affected keys; unrelated keys stay cached.
- [ ] 1.7 User-visible toggle test (TDD) — Interact → Extract → Interact over one document: one
      fetch per key, never COULD-NOT-LOAD on the second mount, for BOTH tabs (PDF and Extract).
- [ ] 1.8 Debug reset clears the `QueryClient` cache (TDD) — extend `lib/resetExperience.ts` + its
      test (exhaustive-reset rule). NOTE: `resetExperience.ts:79` already does a hard
      `window.location.assign("/onboarding")` that destroys the in-memory `QueryClient` on
      remount, so a naked `queryClient.clear()` line would be a dormant no-op the guards can't
      see. Resolve one of two ways, and encode the choice in the test so it is not seam-only:
      (a) add `queryClient.clear()` as belt-and-suspenders BEFORE the navigate, and assert in the
      test that the cache is empty AFTER `resetExperience` runs with the navigate seam stubbed
      (proves the clear, not the reload, emptied it); OR (b) document in the file + the reset test
      that the hard nav structurally satisfies the invariant (no in-memory cache survives the
      remount) and add a test asserting a fresh mount post-reset has an empty cache. Prefer (a) —
      it keeps a real assertion tied to the clear.

## Phase 2 — migrate the rest of the data layer

- [ ] 2.1 Migrate remaining entity-context reads to `useQuery` and writes to `useMutation` +
      invalidation (documents list, templates, and other server reads) (TDD), one context at a
      time, suite green per step. Contexts become thin wrappers exposing query/mutation hooks.
- [ ] 2.2 Guard (TDD) — a test discouraging NEW server reads via `useEffect`+fetch (server data
      goes through the query layer). Enumerate + grandfather any not-yet-migrated readers.
- [ ] 2.3 `docs/agents/data-model.md` updated (server state via TanStack Query; `SdkActionResult`
      at the boundary). Full suite + typecheck green; `OPENSPEC_TELEMETRY=0 openspec validate
      --all --strict`; adversarial review vs. this proposal AND the real code (not the seam).

## Verification

- [ ] 3.1 Live preview (chrome-devtools MCP) — toggle the Analyze sub-pills, incl. behind the
      calendly overlay; confirm no reload flash and no COULD-NOT-LOAD for both tabs; React Query
      DevTools shows cache hits on remount.
