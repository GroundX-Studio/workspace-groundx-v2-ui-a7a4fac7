# WF-08: live-data rewire — no mock manifest in the onboarding experience

## Why

WF-03 made citation geometry real *in code*, but you can't SEE it locally because the
onboarding views read a **mock manifest** instead of live GroundX. The seed script writes
`extractionSchema` + `sampleExtractionValues` + `sampleChatScript` into the sample doc's
`filter.manifest`; the views (`UnderstandView`/`ExtractView`/`InteractView`/`IntegrateView`)
render from those fixtures, bypassing every real endpoint. So WF-03's `bbox`, WF-05's extract
geometry, and WF-06's attribution never surface against the real doc. (Full analysis:
`docs/agents/real-data-rewire-gap.md`; rule: `memory/feedback_no_onboarding_duplicates.md`.)

"No more mock data" = remove the manifest fixture path and feed the production widgets live
GroundX. This is the user-visible enabler for WF-03/05/06.

## What changes (locked rewire order: PdfViewer → Extract → ChatWithSources → Integrations)

The data layer (entities, contexts, middleware proxy) is already correct. The drift is entirely
in `src/views/Onboarding/<Frame>View.tsx`. For each:

1. **PdfViewer (F2)** — `UnderstandView` mounts the production PDF viewer fed by
   `getGroundXDocumentXray(documentId)` (real `documentPages[].pageUrl` + `sourceUrl`), not a
   manifest silhouette. Already renders page images; just point it at live X-Ray.
2. **Extract (F3)** — `ExtractView` mounts the Extract widget fed by
   `getGroundXWorkflow(filter.workflow_id)` (schema) + `getGroundXDocumentExtract(documentId)`
   (values), not `manifest.extractionSchema`/`sampleExtractionValues`.
3. **ChatWithSources (F5)** — `InteractView` seeds `turns` from live chat, not
   `manifest.sampleChatScript`. The chat infra is already live (`sendChatMessage` → real
   `chatRouter`); the view just stops seeding fakes (filename-as-documentId, no bbox) so the
   first paint + `litRegions` reflect real citations.
4. **Integrations (F7)** — `IntegrateView` mounts the Integrations widget with real data.

Each: lift the UX shell into a production widget (or thin the view), replace mock reads with
entity/context calls, add the `mode: "onboarding" | "steady"` lock prop, move/rewrite tests.

5. **Strip the mock manifest** — `middleware/scripts/scenarios/utility.json` (+ others) drop
   `extractionSchema` / `sampleExtractionValues` / `sampleChatScript`; keep `hero` /
   `thinkingScript` / `chatSeeds` (Option A — starter chips feed the *real* chat). Re-seed.

6. **Live mode is the default for the demo** — the experience runs against real GroundX
   (`MOCK_MODE=false` + `WORKSPACE_API_KEY` + LLM creds + egress). `MOCK_MODE` remains a
   local-only fallback when GroundX is unreachable, but it is NOT the demo path.

## Scope note (sequencing)

This is the ~2-day rewire from `real-data-rewire-gap.md`. It runs **before** WF-05/WF-06's live
verification (their geometry only surfaces once the views are live) and absorbs WF-03's deferred
live Chrome-DevTools bbox measurement. The locked internal order (PdfViewer → Extract → Chat →
Integrations) lets each slice ship + verify independently.

## Out of scope

- The Report widget (F7) — greenfield, UI-02/TL-05..07 territory; tracked separately.
- Re-authoring the GroundX extraction workflow (schema is whatever the workflow defines).
- The three genuinely onboarding-specific surfaces (sign-up, onboarding nav, F1 picker) — they stay.

## Affected

- App: `src/views/Onboarding/{Understand,Extract,Interact,Integrate}View.tsx` → thin wrappers;
  production widgets under `src/components/widgets/` (or in-place de-mock) fed by
  `getGroundXDocumentXray` / `getGroundXWorkflow` / `getGroundXDocumentExtract` / live chat; the
  `mode`/lock prop; test rewrites.
- Middleware: `scripts/scenarios/*.json` slim manifest + re-seed.
- Specs: `ui-views` (views mount live-fed production widgets, not manifest fixtures),
  `scenarios` (slim manifest — no schema/values/script fixtures).
