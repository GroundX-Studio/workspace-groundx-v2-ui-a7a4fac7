# Tasks — adopt-tanstack-query

Adopt TanStack Query v5 as the server-state layer. TDD (failing test first), adversarial-review
gate after each task, suite green at every step. Two phases: Phase 1 delivers the user-visible
toggle fix; Phase 2 migrates the rest of the data layer.

## Phase 1 — foundation + viewer reads (user-visible bug fix)

- [x] 1.1 Add deps (TDD/smoke) — `@tanstack/react-query` v5 + `@tanstack/react-query-devtools` in
      `app/package.json`; typecheck + install green.
- [x] 1.2 `QueryClient` + `QueryClientProvider` in the App provider chain (TDD) — extend the App
      provider-chain smoke test (order is load-bearing) so it still mounts with the new provider.
      Configure `staleTime` (long enough that stable demo docs don't refetch within a session)
      and `gcTime`.
- [x] 1.2a Retry as a PREDICATE, not a blanket count (TDD) — the manual X-Ray retry
      (`DocumentsProvider.tsx:114–130`) is deliberately NETWORK-ONLY: it retries the *fetch* 2×
      with backoff but parses ONCE outside the loop because a malformed payload is a CONSISTENT
      error that must fail fast (no re-fetch). A blanket `retry: 2` on the whole `queryFn` would
      wrongly re-fetch parse errors and 4xx. Design a `retry` predicate: retry only transient
      network/5xx failures (≤2×, matching the current backoff), and DO NOT retry parse/validation
      errors or 4xx. Tag the parse failure so the predicate can distinguish it (e.g. a typed
      error the Zod `.parse` throws, non-retryable). Test: a network blip re-fetches ≤2×; a
      parse error fails fast on the first attempt (no re-fetch); a 4xx fails fast.
- [x] 1.3 `queryKeys` module (TDD) — stable keys for `document`, `xray`, `extract`, `workflow`,
      `fieldGeometry`. Test the key builders are stable + collision-free.
- [x] 1.4 Move the supported viewer reads under TanStack Query (TDD). `document`, X-Ray,
      extract, and workflow have reusable hooks; the Extract workbench's keyed query owns its
      document, workflow, extract, and field-geometry calls. `SdkActionResult` stays at the
      boundary. The remaining direct cache-behavior regression is tracked in 1.7.
- [x] 1.5 Replace Extract's imperative fetch chain with one document-keyed `useQuery` around a
      pure, ordered loader (TDD). The query is disabled for placeholder ids, derives schema,
      instances, confidence, and geometry from its result, and replaces the four `useState`
      sinks plus `loadSeqRef`. PdfViewer uses the X-Ray query hook and reports the filename from
      an effect on resolved data. Failed or empty live reads retain the manifest fallback.
- [ ] 1.5g Consolidate the remaining parallel query functions (TDD) —
      `app/src/hooks/useLiveExtract.ts`,
      `hooks/liveExtractData.ts`, `hooks/useLiveExtractionSchema.ts`,
      `hooks/liveExtractionSchemaData.ts` now use TanStack Query but retain separate composed
      keys for `SchemaView` and `ProposeSchemaFieldCard`. Move them onto the same cached readers
      as the Extract workbench, or grandfather a genuinely distinct result with a written reason.
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
