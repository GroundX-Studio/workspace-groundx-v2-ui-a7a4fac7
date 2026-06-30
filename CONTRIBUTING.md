# Contributing

A focused checklist for landing changes in this repo. Most of the
discipline lives in [`docs/agents/discipline.md`](docs/agents/discipline.md) —
this file is the 5-minute "what does a good commit + PR look like."

## Before you start

1. Read [`AGENTS.md`](AGENTS.md) — the table of contents for every other doc.
2. Read [`docs/agents/discipline.md`](docs/agents/discipline.md) — TDD,
   secret hygiene, definition of done, OpenSpec planning, round-trip
   contract (Rule 9).
3. Run `npm test` from the repo root. Everything should be green
   before you start touching code.

## The flow

```
failing test  →  implementation  →  refactor  →  drift guards  →  commit
```

1. **Failing test first** (Rule 1). No exceptions for "small" changes.
   - App: `app/src/**/*.test.tsx` with `renderWithOnboardingProviders`
   - Middleware: `middleware/src/**/*.test.ts` with vitest +
     supertest
   - Round-trip closure tests live in
     `middleware/src/apiRouteContract.test.ts`
2. **Plan via OpenSpec** if the change is cross-cutting. New
   capability or behavior contract → open a change proposal under
   [`openspec/changes/<change-id>/`](openspec/changes/) with
   `proposal.md` + `tasks.md` + spec deltas. Validate with
   `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
   before pushing.
3. **Implement** against the test.
4. **Drift guards must stay green**:
   - `widget-contract.test.ts` (every chat/viewer widget has README +
     sibling test + `mode` prop)
   - `no-hardcoded-styles.test.ts` (no color/radius/breakpoint literals
     outside the allowlist)
5. **Closure (Rule 9 — every persisted byte gets a read)**:
   - Round-trip test exists
   - Dead-column check: every new DB column has a non-test read site
   - Dead-endpoint check: every new server route has a non-test client
   - Dead-context check: every new context field has a non-test consumer

## Commit messages

Honest, multiline, single-purpose. Title summarizes the *why* in <70
chars, body fills in *what* + *test status* + tradeoffs.

```text
<title — what + why, under 70 chars>

<paragraph: why this change exists, the failure mode it closes,
non-obvious context. Wrap at ~72 cols.>

<bullets: what landed, key tradeoffs, tests touched>

<test count delta if applicable>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Honest titles only. A change that wires a seam but leaves three
sub-cases pending is `seam + 3 of 7 wired`, not `done`. Per
[`discipline.md`](docs/agents/discipline.md) §7.

## Never commit

- Secrets (`.env*` values, Partner API `*username` fields — the
  `*username` is the *key value*, not an identifier; see
  [`docs/agents/gotchas.md`](docs/agents/gotchas.md))
- `/tmp/` paths in committed docs
- Hardcoded `/Users/<you>/...` paths
- A change marked "done" if Rule 9 closure isn't passing — mark it
  `seam-only` and own that status

## Pre-push checklist

```bash
npm run scan:secrets          # no secrets in commit set
npx tsc --noEmit              # in both app/ and middleware/
npx vitest run                # in both app/ and middleware/
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict
```

`npm test` from the repo root wraps most of this. e2e
(`npm run test:e2e`) is on-demand — too slow for the inner loop.

## PR description template

```markdown
## What

<1-2 sentences>

## Why

<the failure mode this closes, or the user-visible behavior it adds>

## Test plan

- [ ] Failing test added first (Rule 1)
- [ ] Drift guards green (widget-contract, no-hardcoded-styles)
- [ ] Rule 9 closure passes (round-trip + dead-column + dead-endpoint + dead-context)
- [ ] `npm test` green
- [ ] OpenSpec validate clean (if change touches `openspec/`)

## Screenshots / clips

<if visible UI change>
```

That's it. Everything else is in [`docs/agents/`](docs/agents/).
