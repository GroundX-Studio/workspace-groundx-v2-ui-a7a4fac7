# WF-10: Loan + Solar scenario content seed (all three scenarios live)

> **STATUS: BACKLOGGED (2026-05-30).** Parked — NOT in the active run set. Also blocked on source assets
> (real Loan/Solar PDFs). Revisit when prioritized + assets exist. Kept on the planning surface — not
> archived (not done) and not deleted (valid future work).

## Why

Only `utility.json` is seeded — `middleware/scripts/scenarios/` contains the Utility scenario
alone. The spec requires **three** sample scenarios (Utility single-doc, Loan 12-doc packet, Solar
142-doc portfolio), and the F1 picker is meant to surface all three. Today Loan and Solar have no
real ingested documents, so they are either absent from F1 or would render entirely empty/broken
if selected. They are unbuilt content, which is its own flavor of "not real."

## What changes

Loan and Solar SHALL each be backed by **real ingested GroundX documents** (layout/full
processLevel so search + X-Ray carry geometry), with a seed script + scenario JSON mirroring
`utility.json` (slim manifest — `hero` / `thinkingScript` / `chatSeeds` only, per WF-08). Loan ships
its 12-doc packet; Solar ships its portfolio with the Portfolio → Fund → Project filter fields on
the docs (project = a filter field per WF-07, not a group). The F1 picker then surfaces all three
live scenarios.

## Out of scope

- The onboarding-view rewire (WF-08) — once the docs exist, the live views read them.
- Authoring the extraction workflows beyond what each scenario needs (schema = whatever the
  workflow defines via `filter.workflow_id`).

## Affected

- Middleware: new `scripts/scenarios/loan.json` + `solar.json` + seed wiring; real PDFs ingested
  with layout processLevel; per-doc `filter.workflow_id` + scenario filter fields.
- Specs: `scenarios` (all three scenarios backed by real ingested docs).
