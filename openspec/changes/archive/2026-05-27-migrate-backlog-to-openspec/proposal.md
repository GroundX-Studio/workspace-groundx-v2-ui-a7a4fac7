# Migrate backlog to OpenSpec

## Why

`scaffold/docs/agents/backlog.md` is currently the single source of truth
for pending product work. It grew organically (~340 lines, 14 epics,
~50 active items) and lives outside any tooling that can validate or
cross-reference it. The harness's preferred planning system is
OpenSpec (`docs/contributing/openspec.md` in the harness), which is
already initialised at this repo's root via this change set.

Carrying both `backlog.md` AND OpenSpec means:

- Two places to update on every change → drift → mismatched truth.
- Backlog row ids (`UI-04`, `CF-12`, …) are unstructured strings; OpenSpec
  requirements are structured + validatable.
- Past attempts to keep the backlog clean (the 2026-05-25 / 27 sweeps)
  show it's expensive maintenance without help from validators.

Audit memos at the repo root
(`harness-audit-widget-architecture.md`, `harness-audit-round-trip-contract.md`)
are similarly orphaned — they captured one-shot findings that already
landed as scaffold rules (`scaffold/docs/agents/widget-contract.md`,
`scaffold/docs/agents/discipline.md` Rule 9) and no longer need to
exist on their own.

## What changes

- ADD 13 capability specs covering each backlog epic
  (`app-architecture`, `chat-routing`, `auth-and-sessions`, `data-tier`,
  `ui-views`, `agent-tools`, `observability`, `security-and-privacy`,
  `ui-runtime`, `scenarios`, `service-limits`, `testing-suite`,
  `plugin-loader`). Closed items are dropped (git history is the record);
  blocked / not-started / partial / seam-only items become Requirements
  with their status preserved in the body. Each Requirement carries
  exactly one Scenario derived from the backlog row's "Closure test"
  column.
- DELETE `scaffold/docs/agents/backlog.md`.
- DELETE `harness-audit-widget-architecture.md` and
  `harness-audit-round-trip-contract.md` (root of repo).
- SCRUB references to `docs/agents/backlog.md`, `backlog.md`, and
  `harness-audit-*.md` from:
  - `scaffold/AGENTS.md`
  - `scaffold/app/src/lib/analytics.ts`
  - `scaffold/middleware/src/services/chatHandler.test.ts`
  - `scaffold/docs/agents/widget-contract.md`
  - `scaffold/docs/agents/discipline.md`
  - `scaffold/docs/agents/chat-session-model.md`
  - `openspec/config.yaml` (the one new reference in the file I created)
- REPLACE each reference with the matching OpenSpec capability id where
  one exists, or drop it where the reference was purely navigational.

## Out of scope

- The 8 existing F3a wireframe-realignment changes (`realign-f3a-*`,
  `add-pinned-samples-row`, etc.) stay as active OpenSpec changes —
  they're future work, not backlog content to migrate.
- Migrating user-facing memory files
  (`~/.claude/projects/.../memory/*.md`) — those are auto-persisted
  agent memory, distinct from the project's pending-work log.
- Re-doing the closure analysis on already-shipped backlog items
  (UI-01, UI-05, AU-04, RT-01..06, etc.). They remain documented in
  git history.

## Closure semantics

Per OpenSpec convention, after this change is archived its spec deltas
roll into durable capability specs under `openspec/specs/<capability>/`.
The change folder itself moves to `openspec/changes/archive/`. From
that point forward, `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1
list --specs` is the canonical "what work exists" view, replacing the
backlog.

## Affected

- Scaffold source: 6 files lose backlog/audit references.
- Docs: `backlog.md` deleted; `widget-contract.md` / `discipline.md` /
  `chat-session-model.md` / `AGENTS.md` updated.
- Repo root: 2 audit files deleted.
- OpenSpec: 13 new capability specs created via the archive step.
