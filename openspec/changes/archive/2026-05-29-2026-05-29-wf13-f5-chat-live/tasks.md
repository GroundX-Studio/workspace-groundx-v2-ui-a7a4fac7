# Tasks — WF-13 F5 Interact live chat

- [x] **Failing tests (TDD):** `InteractView` does not seed `turns` from `manifest.sampleChatScript`;
      hydrates from the live persisted thread (with citations); `litRegions` derive from the live
      reply's real `bbox` (not the fallback band). 3 new tests; 12/12 green.
- [x] Removed the `manifest.sampleChatScript` seed + its re-seed effect. F5 `turns` start empty and
      hydrate via `listChatMessages(chatSessionId)` on mount — same RT-01 pattern as ChatColumn, so
      F2 ↔ F5 share one persisted thread.
- [x] Threaded `bbox` through the live-send citation mapping (was dropped → fallback band; now real
      WF-03 geometry reaches `litRegionsFromCitations`).
- [x] App suite **1047/1047**; tsc **0**; drift guards (`no-hardcoded-styles`, `widget-contract`,
      `check-tool-references`, `check-tool-quality`) green; OpenSpec validate 28/28.
- [x] **Live-verified (2026-05-29, real app + GroundX + gpt-5.5):**
      - No fake "$9,418"/DTI seed on F5.
      - F5 hydrated real prior turns from the live thread (F2↔F5 continuity).
      - Fresh send → grounded reply "The total amount due is **$7,613.20**" + **2 CiteChips** on the
        real doc `c3bfff49-…` + a **litRegion painted from real bbox** (`left:55.8% top:41.4%`),
        not the fallback band.
- [x] Archive.

## Adjacent live findings (already ticketed — not WF-13)
- Hydrated (persisted) turns carry no citation chips yet → **WF-16** (citation persistence). The
  live-send path attaches them correctly; only the stored rows lack `citations_json` so far.
- The canvas PDF page image loads from the contaminated `85a12674` X-Ray
  (`…/58a442bd…/85a12674-…/1.jpg`) → **WF-14** (re-ingest + scourge the stray doc).
