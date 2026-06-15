# Tasks — fix-citation-highlight-switch

- [x] **T1 — Failing regression test first.**
  Add "switches to a different citation sharing the first box but with different
  regions (does NOT toggle off)" to
  `CanvasOrchestratorContext.test.tsx`: citeA and citeB share the first region
  box + region count, differ in the second region; assert clicking B switches
  (highlight defined, B's page-3 region present) and re-clicking B dismisses.
  Confirmed RED.
  - ↳ Review: failed on `top.highlight` undefined — the toggle cleared instead
    of switching. Bug reproduced at the spec level.

- [x] **T2 — Fix the `highlightCitation` toggle identity.**
  `CanvasOrchestratorContext` compares the citation's whole region set (compact
  per-region signature, legacy single-box fallback) via `togglesOffOnRepeat`,
  mirroring the `showCitations` toggle. Existing toggle/agent/legacy tests stay
  green.
  - ↳ Review: test advanced — highlight now defined, but `regions[1].page` was
    still the prior citation's → a SECOND gate caught (the short-circuit).

- [x] **T3 — Fix the `gotoDocViewer` re-click short-circuit identity.**
  `ChatStoreContext.gotoDocViewer`'s `sig()` joins a per-region key instead of
  `region count`, so a switch to a different citation sharing the first box +
  count is not suppressed.
  - ↳ Review: regression test GREEN; full file 45/45; ChatStore 35, CiteChip 8,
    PdfViewer 49 green; `tsc --noEmit` clean.

- [x] **T4 — Live verification.**
  Preview browser against real GroundX + DB: clicking through citation chips
  switches the overlay to each citation's regions; re-click dismisses; no on/off
  flicker. Data layer re-confirmed (6 cites, 3–4 regions, multi-page, 0 dupes,
  4.2 KB).
  - ↳ Review: confirmed via DOM highlight-element counts (screenshot tool was
    degraded after repeated reloads; counts are authoritative).

- [x] **T5 — Spec delta + adversarial review.**
  `ui-runtime` MODIFIED requirement: Toggle clause → whole-region-set identity,
  short-circuit folded in, new shared-first-box switch scenario. `openspec
  validate --strict` clean.
  - ↳ Review: legacy single-box fallback preserves prior behavior; agent-source
    gate unchanged; no third first-box-identity gate; no `undefined` bbox access
    (region bbox required; legacy fallback only inside the bbox-truthy branch).
