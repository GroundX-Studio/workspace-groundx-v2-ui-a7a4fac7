# Tasks — WF-08 live-data rewire (no mock manifest)

Locked internal order: **PdfViewer (F2) → Extract (F3) → ChatWithSources (F5) → Integrations (F7)**.
Each slice is TDD + ships + verifies independently (incl. a live Chrome-DevTools measurement).

## 0. Audit + decide widget home — DONE (2026-05-29)

- [x] **Audit finding:** the rewire-gap doc is partly STALE. The view→wrapper conversion already
      happened in WF-01/ARCH. Decision: **de-mock in place** (views already thin; no need to extract
      a `src/components/widgets/` tree). Data layer is ready: `DocumentsContext` exposes
      `getDocument` / `getDocumentXray` / `getDocumentExtract`; `getGroundXWorkflow(id)` is an entity.
- [x] Live-mode env path confirmed: `MOCK_MODE=false` + `WORKSPACE_API_KEY` + `LLM_*` + egress;
      `GROUNDX_SAMPLES_BUCKET_ID=28454` already set.

## 1. PdfViewer (F2) — live X-Ray — DONE (already live)

- [x] **Verified already live:** `UnderstandView` is a thin wrapper passing `documentId` + `mode`;
      `PdfViewerWidget` fetches `DocumentsContext.getDocumentXray(documentId)` and renders
      `documentPages[].pageUrl`. No manifest read. Works against live GroundX (MOCK_MODE only fakes
      the backend). No code change needed — this slice was completed by prior epics.

## 2. Extract (F3) — live workflow schema + extract values  → SHIPPED as WF-12

- [x] Done + archived as **WF-12** (`workflowToSchema`/`extractToValues` in `extractLiveData.ts`;
      ExtractView/SchemaView/ChatColumn all consume the live workflow schema; live-verified F3 shows
      the 36-field schema + real Windom values `addressee="KWIK TRIP (1147)"`/`balance_payable=7613.2`).

## 3. ChatWithSources (F5) — live chat, real citations  → SHIPPED as WF-13

- [x] Done + archived as **WF-13** (InteractView no longer seeds `manifest.sampleChatScript`;
      hydrates live turns; `litRegions` from real reply citations + bbox; live-verified). Citation
      persistence across refresh fixed in **WF-16**.

## 4. Integrations (F7) — live data

- [x] **No mock manifest to remove.** `IntegrateView` reads only the scenario *id* (for "Utility"/
      "Loan"/"Solar" copy) + renders a static connector catalog + agent download — it never reads
      `extractionSchema`/`sampleExtractionValues`/`sampleChatScript`. Not part of the mock-manifest
      problem. (A real Integrations *data* widget is greenfield, tracked separately like the Report widget.)

## 5. Strip the mock manifest + re-seed — DONE (2026-05-29)

- [x] Removed `extractionSchema` / `sampleExtractionValues` / `sampleChatScript` from
      `middleware/scripts/scenarios/utility.json`; kept `hero` / `thinkingScript` / `chatSeeds` /
      `id` (Option A — starter chips feed the real chat). (Only `utility.json` exists; Loan/Solar = WF-10.)
- [x] Re-seeded (`npm run seed` → drift detected → manifest update). Live doc `c3bfff49`'s
      `filter.manifest` is now `{chatSeeds, hero, id, thinkingScript}`; `workflow_id` preserved.
- [x] **Live-verified:** `/api/scenarios` serves the slim manifest `[chatSeeds, hero, id,
      thinkingScript]` AND F3 still renders 36 live fields with real values (no manifest fallback) —
      the experience runs purely on live data. App readers keep a harmless `liveSchema ?? manifest`
      fallback (now resolves to liveSchema). The MOCK_MODE `memoryRepository` fixture keeps its
      manifest — that's the explicit local-only fallback path, not the demo.

## Closure

- [x] App **1057/1057** + middleware **476/476**; tsc 0 both sides; drift guards green; OpenSpec validate.
- [x] Live Chrome-DevTools pass across F2/F3/F5 against real GroundX (no mock) — done across
      WF-12/13/15/16/17 + this slim-manifest verification.
- [x] Archive.

## Live verification findings (2026-05-29) — each split into its own ticket

Drove F1→F3→chat live (`localhost:5173`, MOCK_MODE=false, real OpenAI + GroundX). The 5 findings
are now discrete tickets (not folded into this umbrella). **WF-08's own slices 2 + 3 + the
re-ingest part of slice 5 are SUPERSEDED by these — WF-08 now owns only F2 (done), F7 (slice 4),
and the manifest-strip part of slice 5.**

- [x] **WF-03 PROVEN LIVE.** POST `/api/chat/messages` (real `gpt-5.5`, `/search/28454`, doc
      `c3bfff49`) returned citations WITH `bbox` (page 1 `{0.088,0.201,0.855,0.319}`, page 2
      `{0.095,0.029,0.851,0.17}`). Deferred live measurement satisfied.
- → **WF-12** — F3 extract values are MOCK (`$18,742` / acct `1023456` / `4128`), not the real
      Windom extract. (was slice 2)
- → **WF-13** — F5 canvas shows the seeded `sampleChatScript` "$9,418" mock turn. (was slice 3)
- → **WF-14** — page images reference the scourged duplicate `85a12674`; re-ingest the Utility doc
      so its X-Ray is self-referential. (was the re-ingest part of slice 5)
- → **WF-15** — startup 406 flash (viewer fetches placeholder `scenario:utility`).
- → **WF-16** — citations don't survive refresh (`GET /messages` → `citations: []`).

## Follow-ups (new tickets, not deferred informally)

- **Report widget (F7)** — greenfield; file when UI-02 lands.
- Per-control mode-lock specs (F3 schema editor locked / F7 connectors locked) if not covered here.
