# Design: Review-Only Scaffold Philosophy Audit

## Audit Standard

The audit measures the scaffold against the philosophy captured in:

- `docs/agents/principles.md`
- `docs/agents/discipline.md`
- `docs/agents/hacking-vs-solving.md`
- `docs/agents/real-data-rewire-gap.md`
- `docs/agents/template-scope-results.md`
- `docs/agents/data-model.md`
- `docs/agents/widget-contract.md`
- `docs/agents/testing.md`
- `openspec/wireframes/README.md`

The short form is: solve to the product model, compose production surfaces, keep
real data and round-trips as the bar for done, and track deferred work in GitHub
Issues.

## Review Axes

| Axis | Question | Primary evidence |
|---|---|---|
| Model composition | Are variations values on axes, or forked components? | `AppShell`, `ChatColumn`, `ScopedCanvas`, contexts, viewer/chat widgets |
| Production reuse | Are onboarding and steady using the same production widgets? | `views/Onboarding`, `components/*-widgets`, `/c/:sessionId` |
| Real data | Do visible surfaces read live GroundX/LLM/persistence paths instead of mock manifest data? | frontend API, middleware clients, scenario registry, e2e |
| Round-trip done | Does every persisted byte have write, read, render, and test coverage? | repository interfaces, routes, client hydration, tests |
| Template/scope/results | Do Extract and Report share the template + scope + generated-result lifecycle? | shared types, middleware routes, widgets, SmartReport specs |
| Widget/tool contracts | Do widgets and tools obey slot, README, test, style-token, and app/middleware catalog rules? | widget directories, tool registries, contract tests |
| Source of truth | Are specs, docs, shared types, and GitHub backlog aligned? | OpenSpec, `@groundx/shared`, docs, GitHub issues |
| Wireframe fidelity | Does shipped UI preserve the intended frame/widget shape without copying wireframe-only artifacts? | wireframe JSX, current TSX, browser measurement |
| Test evidence | Do claims have user-visible tests or measured browser evidence? | vitest, Playwright, Chrome DevTools MCP, validation logs |

If `codegraphcontext` MCP is available during execution, use it before broad
manual scanning to map imports, dependency edges, call sites, and concept flows
for the axes above. If it is not exposed, fall back to `rg`, source reads,
TypeScript import searches, contract tests, and browser/runtime inspection.

## Evidence Rules

Each finding MUST include:

- severity: `critical`, `high`, `medium`, or `low`
- status: `confirmed`, `needs-runtime-check`, or `not-a-defect`
- philosophy axis
- source references with file paths and line numbers
- user-visible impact
- recommended follow-up owner: GitHub Issue, future OpenSpec change, or no action

Claims about runtime behavior MUST use measured evidence when feasible:

- DOM dimensions or visibility
- accessibility-tree node
- network request/response
- console error state
- persisted/read data state

Screenshots may support a finding but do not prove it alone.

## Audit Outputs

The executing agent creates:

- `evidence/conformance-report.md` — executive summary, score by axis, top risks,
  and what already conforms.
- `evidence/finding-register.md` — finding-by-finding evidence table.
- `evidence/issue-handoff.md` — GitHub issue mapping for every confirmed finding
  that is not fixed because this change is review-only.

If a confirmed issue is already tracked, the handoff links the existing issue.
If it is not tracked, the executing agent creates or proposes a GitHub Issue
according to `docs/agents/discipline.md` Rule 8.

## Review-Only Guardrails

- Do not modify product code, docs outside this OpenSpec change, tests, or
  generated files as part of this audit.
- Do not fix confirmed defects in place.
- Do not close an audit task until its adversarial review gate has challenged
  the evidence against the real code and the scaffold philosophy.
- Do not treat unimplemented future philosophy as a product defect unless the
  current docs/specs say the behavior is shipped.

## Superpowers Planning Shape

This plan follows the Superpowers workflow in spirit:

1. Brainstorm and scope the audit before execution.
2. Write the OpenSpec plan before product-code work.
3. Execute sequentially.
4. Run an adversarial review after every task.
5. Verify before completion.

Because the user requested OpenSpec as the planning surface, this change stores
the design and execution plan in OpenSpec rather than `docs/superpowers/`.
