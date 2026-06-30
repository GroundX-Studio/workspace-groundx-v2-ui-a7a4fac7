# Tasks — migrate-backlog-to-openspec

This change is administrative — it moves the source of truth from
`backlog.md` to OpenSpec capability specs. There is no failing-test
step in the usual Rule 9 sense; the closure gate is the validate +
archive + reference-scrub pass.

## 1. Author the 13 capability spec deltas

- [x] `specs/app-architecture/spec.md` — ARCH-* active rows
- [x] `specs/chat-routing/spec.md` — CF-* active rows
- [x] `specs/auth-and-sessions/spec.md` — AU-* active rows
- [x] `specs/data-tier/spec.md` — DT-* active rows
- [x] `specs/ui-views/spec.md` — UI-* active rows (excluding UI-01 which lives in `onboarding-schema-editor`)
- [x] `specs/agent-tools/spec.md` — TL-* active rows
- [x] `specs/observability/spec.md` — OB-* active rows
- [x] `specs/security-and-privacy/spec.md` — SC-* active rows
- [x] `specs/ui-runtime/spec.md` — UR-* active rows
- [x] `specs/scenarios/spec.md` — SCEN-* active rows
- [x] `specs/service-limits/spec.md` — SL-* active rows
- [x] `specs/testing-suite/spec.md` — TS-* active rows
- [x] `specs/plugin-loader/spec.md` — PLUG-* active rows

## 2. Validate

- [x] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate migrate-backlog-to-openspec --strict` passes.
- [x] `validate --all --strict` still green across the prior 9 items.

## 3. Archive

- [x] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive migrate-backlog-to-openspec` — moves the change to `changes/archive/` AND writes the 13 spec deltas into `openspec/specs/<capability>/spec.md`.

## 4. Delete the backlog + audit files

- [x] `rm scaffold/docs/agents/backlog.md`
- [x] `rm harness-audit-widget-architecture.md`
- [x] `rm harness-audit-round-trip-contract.md`

## 5. Scrub references

- [x] `scaffold/AGENTS.md` — replace the "Backlog (single source of truth)" link with an OpenSpec pointer.
- [x] `scaffold/app/src/lib/analytics.ts` — replace the `docs/agents/backlog.md` OB-02 reference with `openspec/specs/observability/spec.md` (no row id needed; OB-02 is closed historically).
- [x] `scaffold/middleware/src/services/chatHandler.test.ts` — drop the `docs/agents/backlog.md` comment reference; the test's intent stands on its own.
- [x] `scaffold/docs/agents/widget-contract.md` — drop the "Backlog Epic: ARCH" reference + the `../../../harness-audit-widget-architecture.md` reference. Replace with: "Architecture specs live at `openspec/specs/app-architecture/`."
- [x] `scaffold/docs/agents/discipline.md` — replace `docs/agents/backlog.md` references with `openspec/changes/` for active work + `openspec/specs/` for durable contracts.
- [x] `scaffold/docs/agents/chat-session-model.md` — replace the `docs/agents/backlog.md` reference with a pointer to `openspec/specs/data-tier/` / `chat-routing/`.
- [x] `openspec/config.yaml` — drop the "OpenSpec proposals link to backlog rows" sentence (no longer accurate; backlog is gone).

## 6. Verify the end state

- [x] `grep -r "backlog.md\|harness-audit-" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.yaml" --include="*.json"` (excluding node_modules) returns ZERO hits.
- [x] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs` shows the 13 new capabilities + `onboarding-schema-editor`.
- [x] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` shows the 8 active F3a-realignment changes; `migrate-backlog-to-openspec` is no longer listed (archived).
- [x] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict` is green.
- [x] scaffold's `vitest` + `tsc --noEmit` still green (the source-file scrubs SHALL only touch comments / dead doc strings).
