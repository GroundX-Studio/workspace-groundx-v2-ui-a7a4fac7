# Design: Comprehensive Architecture And Design Review

## Review Standard

The review measures the current scaffold against these source references:

- `AGENTS.md`
- `docs/agents/principles.md`
- `docs/agents/discipline.md`
- `docs/agents/architecture.md`
- `docs/agents/data-model.md`
- `docs/agents/template-scope-results.md`
- `docs/agents/widget-contract.md`
- `docs/agents/testing.md`
- `docs/agents/hacking-vs-solving.md`
- `docs/agents/design-bundle.md`
- `docs/agents/real-data-rewire-gap.md`
- `openspec/specs/app-architecture/spec.md`
- `openspec/specs/testing-suite/spec.md`
- `openspec/wireframes/source/*.jsx`
- Archived OpenSpec plans that claimed architecture/design cleanup.

The short form: solve to the model, compose production surfaces, prove behavior
with user-visible tests or measured runtime evidence, and track deferred work in
GitHub Issues rather than hidden TODOs or dormant code.

## Audit Axes

| Axis | Review question | Primary evidence |
|---|---|---|
| Composition | Are variations explicit values on axes rather than forked structures? | routes, providers, contexts, widgets, `ContentScope`, catalog APIs |
| Production reuse | Do onboarding and steady mode share production surfaces where the philosophy says they should? | `AppShell`, `ChatColumn`, viewer widgets, onboarding views, steady routes |
| State ownership | Is state owned at the intended layer and exposed through composable context/API boundaries? | provider tree, `ChatStore`, `ViewerSession`, `OnboardingSession`, frontend `Api` |
| Data contracts | Are cross-layer concepts sourced from one schema/contract? | `@groundx/shared`, app types, middleware types, DB mappers, spec matrix |
| Round-trip done | Does persisted or server-owned state have write, read, render, and test proof? | repositories, routes, client hydration, runtime surfaces, tests |
| TDD posture | Do changes have failing user-visible tests, meaningful regression coverage, and no seam-only closeout? | tests, drift guards, archived tasks, recent commits, validation logs |
| Widget/tool contracts | Do widgets/tools obey slot, README, sibling-test, role/mode/scope, catalog, and middleware mirror rules? | `components/*-widgets`, `app/src/tools`, `SERVER_TOOL_CATALOG`, contract tests |
| Design fidelity | Does implementation preserve wireframe intent using the product design system rather than wireframe-only artifacts? | wireframe JSX, current TSX/CSS, tokens, Chrome measurements |
| Runtime/a11y | Do visible claims survive real browser inspection? | Chrome DevTools MCP, DOM dimensions, console/network, a11y tree |
| Security/ops | Do auth, RBAC, secrets, telemetry, and environment seams follow agent docs? | middleware config, auth routes, project access, observability, secret scan |
| Planning hygiene | Is work tracked in OpenSpec/GitHub with no orphaned tasks or stale TODOs? | `openspec list`, archives, GitHub issues, source TODO search |

## Evidence Rules

Every finding MUST include:

- stable id: `ADR-###`
- severity: `critical`, `high`, `medium`, or `low`
- status: `confirmed`, `needs-runtime-check`, `not-a-defect`, or `already-tracked`
- audit axis
- exact file references with line numbers, command output, or runtime evidence
- user-visible impact
- expected model from the agent references/OpenSpec
- handoff state: `existing-issue`, `new-issue`, `blocked-draft`, or `no-action`

Runtime claims MUST be measured when feasible. Screenshots may corroborate but
do not prove a finding alone. Acceptable runtime proof includes:

- DOM rectangle dimensions and visibility
- computed style/token evidence
- accessibility tree node/state
- console messages
- network requests/responses
- persisted write/read state
- browser storage state when it is the claimed behavior

## Tool Strategy

- Prefer Chrome DevTools MCP for runtime inspection.
- Prefer GitHub tooling or `gh` for issue state and handoff.
- Prefer GroundX Studio Harness references when a GroundX product/architecture
  decision is implicated.
- If a context graph MCP is exposed during execution, use it for dependency and
  call-site mapping before broad manual scans.
- If no graph tool is exposed, use `rg`, TypeScript imports, test discovery, and
  focused source reads as the fallback.

## Review-Only Guardrails

- Do not edit product code, tests, generated files, or agent docs during this
  review.
- Do not fix defects inline.
- Do not count a future target as a current defect unless a current spec/doc
  claims it is shipped or required.
- Do not mark a task complete until its adversarial review entry passes.
- Do not archive the change until every confirmed finding has issue handoff or
  a no-action rationale.

## Output Schema

`evidence/conformance-report.md` SHALL include:

- executive verdict
- score table by audit axis
- what conforms
- confirmed gaps by severity
- not-a-defect judgments
- recommended next decision order

`evidence/finding-register.md` SHALL include one row per candidate finding:

| id | severity | status | axis | evidence | impact | expected model | handoff |
|---|---|---|---|---|---|---|---|

`evidence/issue-handoff.md` SHALL include:

- existing issues matched
- new issues created
- blocked issue drafts, if permissions fail
- no-action findings with rationale

`evidence/adversarial-reviews.md` SHALL include one entry per task:

- task number and title
- claims made
- counterevidence searched
- files/commands/runtime checks reviewed
- verdict
- corrections required before proceeding
