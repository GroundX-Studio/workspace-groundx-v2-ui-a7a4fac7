# WF-01b: wireframe fidelity follow-ups

## Why

`WF-01` (archived 2026-05-28) closed the bulk of the F-frame fidelity gap. Three small items were carved out as follow-ups because they were either (a) trivial copy with no spec implication, or (b) wiring on top of a `WF-01` widget contract that already shipped. This change closes them.

This is the **wireframe-fidelity slice only.** S-series surfaces (S1–S3a), Loan + Solar content seed, CF-04, CF-19, and the F2 step-strip auto-advance behavior are all deferred per the 2026-05-28 review.

## What changes

| # | Item | Source |
|---|---|---|
| **A** | F1 IngestView SHALL render the canonical "↳ Sign up triggers F1→F2 transition + loads F6 gate inline in chat" coral mini-pill below the BYO row label | WF-01 punch list row `F1.7` (deferred minor) |
| **B** | F5 InteractView canvas SHALL paint `PdfViewerWidget`'s `litRegions[]` from the citations on the latest assistant turn | WF-01 punch list row `F5.2` (deferred wiring on top of `litRegions` prop shipped in WF-01 C10) |
| **C** | F3/F4 PDF viewer SHALL highlight the source region of the currently selected field via `targetPage` + `highlightBbox` | WF-01 punch list row `F4.1` partial (deferred — provenance panel shipped in C9, the visual cross-link to the PDF was carved out) |

All three reuse widget props already shipped: `PdfViewerWidget`'s `litRegions`, `highlightBbox`, and `targetPage`. No new components.

## Out of scope

- WF-02 / S-series surfaces (S1 Loan JSON, S2 Solar Portfolio, S3 IC brief, S3a Report Builder) — deferred behind content.
- Loan + Solar content seed (PDF ingestion to bucket 28454) — ops task.
- CF-04 (`page_usage_event` reader), CF-19 (`ensureBucketGroup` helper) — separate inflight.
- F2 step-strip auto-advance on Done bubble — held until review.

## Affected

- App: `views/Onboarding/IngestView/IngestView.tsx`, `views/Onboarding/InteractView.tsx`, `views/Onboarding/ExtractView.tsx`.
- Specs: `ui-views` (three ADDED requirements).
