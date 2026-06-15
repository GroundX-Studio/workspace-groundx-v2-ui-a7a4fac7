# Design — fix-citation-highlight-switch

## Root cause

A citation's IDENTITY (for "is this the same citation the user is re-clicking?")
was approximated by its first region's `{page, bbox}`. Pre-multi-region this was
a faithful identity — one citation, one box. Post-multi-region it is not: the
first region is often a shared container box (the X-Ray chunk that many cited
values fall inside), so distinct citations collide on it.

Two gates relied on that approximation:

| Gate | File | Old comparison | Failure |
|---|---|---|---|
| `highlightCitation` toggle-off | `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx` (~149) | `{documentId, page, bbox}` JSON-equality | clicking a different citation with the same first box → CLEARS instead of switching |
| `gotoDocViewer` re-click short-circuit | `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx` (~1670) | `page \| first-bbox \| tier \| region COUNT` | two citations with same first box + same count → mutation suppressed → highlight frozen on prior citation |

Both had to be fixed: a regression test that clicked a second citation sharing
the first box failed first on the toggle, then (after fixing the toggle) on the
short-circuit.

## Fix

Compare the WHOLE region set at both gates via a compact per-region signature
(`${page}:${x},${y},${w},${h}:${tier}` per region). Legacy single-box citations
synthesize a one-region signature from `{page, bbox, tier}`, so their toggle and
short-circuit behavior is byte-identical to before.

- Toggle (`CanvasOrchestratorContext`): build `currentRegions` from the active
  highlight (`.regions ?? [{page,bbox,tier}]`) and `incomingRegions` from the
  intent (`.regions ?? [{page,bbox,tier}]`), pass their signatures to the shared
  `togglesOffOnRepeat` predicate. This is the SAME shape the `showCitations`
  toggle already uses — one consistent identity rule across both citation
  surfaces.
- Short-circuit (`ChatStoreContext.gotoDocViewer`): the cheap `sig()` now joins a
  per-region key instead of using `regions.length` as a proxy.

### Why whole-region-set, not a citation index/id

`sourceCitationIndex` (the per-answer `[N]`) is not globally unique — two answers
in one conversation each have a citation "1" on the same document. The region set
IS the citation's content identity: a true re-click produces an identical set; a
different citation produces a different set. It is also cheap to compare —
regions are small after dedupe (3–4 per citation; ~4 KB for a 6-citation answer
measured live).

## Tests

- New failing-first regression test in
  `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.test.tsx`
  ("switches to a different citation sharing the first box but with different
  regions"): citeA and citeB share the first box + region count but differ in the
  second region; asserts click B SWITCHES (highlight defined, B's distinct region
  present) and a re-click of B DISMISSES. It exercises BOTH gates (it failed once
  per gate during the fix).
- Existing toggle/agent/legacy-bbox scenarios remain green (legacy fallback
  preserves single-box behavior).

## Verification

- 157 tests green across the touched suites (orchestrator 45, ChatStore 35,
  CiteChip 8, PdfViewer 49 + tools); `tsc --noEmit` clean; no browser console
  errors.
- Live (preview browser, real GroundX + DB): clicking through citation chips now
  switches the overlay to each citation's regions; re-clicking the active chip
  dismisses. No more on/off flicker.
