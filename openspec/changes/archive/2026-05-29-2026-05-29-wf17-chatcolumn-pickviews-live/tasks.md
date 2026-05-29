# Tasks — WF-17 F2 pick-view pills from live schema

- [x] **Shared live-schema source decided:** a cached `useLiveExtractionSchema(documentId)` hook
      (`app/src/api/useLiveExtractionSchema.ts`) — self-fetching (works at F2 before ExtractView
      mounts), per-doc Promise cache (dedupes the 278KB workflow blob), returns null for placeholder
      ids / failures. Chosen over "ExtractView populates a slot" (not mounted at F2) and over a
      server-side scenario field (no middleware change needed).
- [x] **Failing tests (TDD):** `useLiveExtractionSchema.test.ts` (`fetchLiveSchema`: documentId →
      filter.workflow_id → workflow → schema; null when no workflow_id) + ChatColumn WF-17 test
      (a live-only `charges` category appears as a pill, overriding the manifest).
- [x] Rewired `derivePickViews(scenario, liveSchema)` — live schema wins, manifest is the fallback
      (placeholder/pre-resolve/BYO/until WF-08 strips it). Hook runs unconditionally before the gate
      early-return (Rules of Hooks).
- [x] App suite **1057/1057**; tsc **0**; drift guards green; OpenSpec validate.
- [x] **Live-verified (2026-05-29):** F2 pick-a-view shows **Statement · Meters · Charges** from the
      live workflow — the manifest had only Statement + Meters, so the **Charges** pill proves live
      sourcing.
- [x] Archive.

Unblocks WF-08 §5 (the last `manifest.extractionSchema` reader is now on a live source).
