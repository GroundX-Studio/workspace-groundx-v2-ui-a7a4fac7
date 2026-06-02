# Flatten the GroundX document filter (move the scenario manifest app-side)

## Why

`2026-06-01-projects-rbac-scope-filter` fixed DL-1 and stamps `filter.projectId`
on the sample doc — but **additively**, alongside the legacy
`manifest`/`scenarioId`/`kind` blob, because the scenario registry
(`middleware/src/scenarios/registry.ts`) still builds the onboarding scenario
list by reading those fields OFF the live GroundX doc filters. That leaves
app/UI metadata living inside the GroundX **search** filter — untidy, and it
couples the onboarding picker to GroundX document metadata.

This is cosmetic/architectural cleanup (NOT a functional fix — the additive
filter works: search matches `projectId`, the registry reads `manifest`). It is
split out of projects-rbac deliberately because it rewrites a **live-critical
surface** (the onboarding picker) and needs a live re-stamp + re-verify — safer
as its own scoped change than bolted onto the DL-1 fix.

## What changes

- **Relocate the scenario registry's source app-side.** The registry reads
  scenario `manifest`s from the app-owned scenario JSON configs (already exist;
  the seed reads them), and resolves each scenario's documents from the bucket by
  matching `filter.projectId` (the join key) instead of `filter.scenarioId`.
- **Flatten the doc filter.** Drop `manifest`/`scenarioId`/`kind` from the GroundX
  doc `filter` → flat `{ projectId, workflow_id }`. Introduce the single
  `DocumentFilter` type + `stampDocumentFilter` helper (middleware-side — no FE
  dead stub) used by the seed (and the future BYO upload). Re-stamp the sample
  doc (live `document_update` → poll to `complete`).
- **Live re-verify** the onboarding picker still lists scenarios and chat still
  matches `{projectId}`.

## Conformance

- Composable: the registry stays one mechanism (read config + match by
  projectId), no per-scenario fork. `DocumentFilter` is built WITH its consumers
  (seed now; BYO tracked) — middleware-only (FE never stamps docs).
- TDD: failing-first registry test (lists scenarios from JSON configs, matches
  docs by projectId) before the rewrite; live re-verify = done-able.
- One source of truth: scenario manifests live in the JSON configs only (not
  duplicated in the GroundX filter).

### Out of scope
- The RBAC layer, projects/grants tables, producer (shipped in projects-rbac).
