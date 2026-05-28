# OpenSpec Changes

Each subdirectory here is an in-flight proposal (per the OpenSpec methodology):

```
openspec/changes/<change-id>/
  proposal.md      # what + why + scope (in/out)
  design.md        # source of truth, drift prevention (optional; only for cross-cutting changes)
  tasks.md         # checklist starting with a failing user-visible test
  specs/
    <capability>/spec.md  # spec delta — ADDED / MODIFIED / REMOVED requirements
```

Validate the active proposals at any time with:

```bash
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json
```

When a change ships, archive it with:

```bash
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive <change-id> --yes
```

`archive` merges the change's spec deltas into `openspec/specs/<capability>/spec.md`
and moves the proposal folder under `openspec/changes/archive/<YYYY-MM-DD>-<id>/`
so the planning history stays browsable without cluttering the active list.

## Closure rule

Each change MUST close with `validate --all --strict --json` passing AND the
scaffold's vitest suites (`scaffold/app`, `scaffold/middleware`) green AND
the durable spec at `openspec/specs/<capability>/spec.md` updated whenever
a requirement's wording or contract is mutated. Per the scaffold's
discipline (`scaffold/docs/agents/discipline.md` Rule 9), each change's
`tasks.md` MUST start with a failing user-visible test before any
implementation step.

## History

Historical changes live under `archive/`. The current durable spec for
each capability lives at `openspec/specs/<capability>/spec.md`.
