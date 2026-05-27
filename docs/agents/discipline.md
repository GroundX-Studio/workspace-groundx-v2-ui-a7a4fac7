# Discipline

Hard-locked rules. If you only read one file in `docs/agents/`,
read this one.

## 1. TDD — failing test first, every change

No exceptions for "small" changes. Write the failing test, then
implement, then refactor. If you can't write the test first, that's
a signal the change is poorly scoped — back off and re-scope.

Test layers:
- App: `vitest run` under `app/`.
- Middleware: `vitest run` under `middleware/`.
- Contract: `npm run test:deploy` (Helm chart + deploy workflow
  shape) and `npm run scan:secrets`.
- E2E: `npm run test:e2e` (Playwright; only on demand — too slow
  for inner loop).

The full inner loop is `npm test`, which runs everything except
e2e. Always green before pushing.

## 2. Never commit secrets

Hard-locked after a real leak on 2026-05-23. Before writing or
editing any committed file:

1. Is the value also in a `.env*` file? → STOP.
2. Does it match a UUID pattern AND not have a clear identifier
   role? → STOP.
3. Did it come from a Partner API response field whose name ends
   in `username`? → **STOP.** The Partner API returns the API key
   value in `customerUsername` / `partnerUsername` /
   `requestUsername` fields. Those are NOT safe identifiers.

If you redact something via a follow-up commit, that does NOT fix
a leak — the value remains in git history at the original commit
hash. Tell the user immediately, push the redaction commit, and
state explicitly that the key must be rotated.

`.mcp.json` (where present) is gitignored — never `git add` it.

## 3. Response style

- Tight. Tables + bullets. No prose where a table works.
- Ask before novels. If a change has real architectural tradeoffs,
  surface them in 3–5 lines and ask — don't write a 500-line
  proposal.
- Save in real time. Don't batch a session's worth of work into
  one mega-commit. Each chunk = one passing test + one commit.

## 4. Pre-response consult

Before any meaningfully visible response or visible code change,
mentally consult:
- The `groundx-studio-harness:harness-web-ui` skill (and `harness-publish` if managing project lifecycle).
- The shared design standards (`product-brand-design-standards` for
  visible work).
- `docs/agents/gotchas.md` for already-known traps.

## 5. Improve, don't preserve drift

When touching legacy code (hardcoded colors, inline media queries,
missing wrappers): write the new bit against the canonical tokens
and patterns. Don't copy the older style.

The rule of thumb: fewer tokens crossed into the component, more
configuration up in the theme = right answer.

## 6. Don't substitute the stack

The standard stack is the scaffold:
- App: Vite + React + MUI v5 + Emotion.
- Middleware: TypeScript Express, in-memory for local preview,
  MySQL for production.
- Deploy: Helm to EKS.

Don't bring in Next.js, SQLite, Postgres, Prisma, or Drizzle
without explicit user direction. Don't add new top-level deps
without thinking about scaffold scope.

## 7. Definition of done = user-visible test

A feature is done when a test exercising **real user-visible
behavior** passes. A seam test (interface compiles, dispatcher
dispatches, mock returns) is `in-progress`, not done. If the
implementation behind the seam is a stub or a frank "not wired"
response, the item stays `in-progress` until the real
implementation lands.

Concrete corollaries:

- **No "P0 done" commit titles for seam-only work.** Honest
  titles look like "X: seam + 3 of 7 sub-cases wired" — a
  `git log --oneline` reader should be able to tell what's
  shippable.
- **When you close one item, file the follow-on work FIRST.** If
  your closure creates new pending work, open the relevant OpenSpec
  change (or extend the matching capability spec under
  `openspec/specs/<capability>/`) before you add an inline `TODO`
  and before you mark the parent closed. Inline TODOs without a
  matching OpenSpec requirement are forbidden.
- **Per-status client error mapping, real readers, real
  prompts.** These are not "polish" — they're the user-visible
  layer that determines whether the seam is doing anything.

## 8. Planning via OpenSpec, no tombstones, verify before flagging

Pending work lives in OpenSpec at the repo root:

- `openspec/specs/<capability>/spec.md` — durable requirements
  (what behavior MUST hold)
- `openspec/changes/<change-id>/` — in-flight proposals
  (proposal.md, tasks.md, spec deltas)

Useful commands:

```bash
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list             # active changes
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs     # durable capabilities
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict
```

Operational rules:

- **One planning surface.** Do not create new top-level tracking
  files (no `chat-fix-list.md`, `open-work.md`, `phase-X-tracker.md`).
  OpenSpec is the truth.
- **No tombstones.** When you remove a file, delete it. Don't leave
  a one-line stub saying "this file was merged into Y." Single-agent
  project; the audit trail is in git.
- **Verify before flagging a requirement as pending.** Before adding
  a Requirement marked as not-yet-shipped, grep for the seam first:
  `grep -rn "<feature-name>" middleware/src app/src`. If a component
  / hook / file matching the name exists, the requirement is likely
  partially shipped — annotate that in the requirement body. Past
  drift: the UR-02 false positive (drag-to-resize divider, marked
  not-started while the component + hook + mount + test all existed)
  caused this rule.
- **Audits use the full discovery checklist**, not just `grep TODO`.
  Past audits missed work because they used one method.
- **Closure deletes the inline TODO.** A `TODO(<id>)` in source
  pointing at a closed item is a drift signal. Grep should never
  find one.
- **WIP cap = 3 per epic.** Before opening a 4th `in-progress`
  in any one epic, close one to genuine done OR move one back
  to `not-started`.

## 9. Round-trip contract — every persisted byte gets read

Rule 7 ("done = user-visible test") is the principle. This is the
operational checklist that prevents the failure mode it was written
against: write-side wired, read-side missing, item marked done.

The failure pattern (audited 2026-05-27 across 7 features):

> **Phase H** added DB tables + repository write methods. **Phase I**
> added handler code that *reads* those tables for LLM context
> bundling. **Phase J** marked the work done. The chat handler reads
> `viewer_events`, `chat_session_entities`, and `current_intent`
> every turn — but nothing outside tests ever WRITES to them, so the
> reads always return `[]`/null. Three of the four LLM context axes
> were dark for weeks before anyone noticed.

The same pattern in reverse killed chat history: `POST /api/chat/
messages` persists user + assistant rows on every turn, but **no
GET endpoint exists** and the UI's `liveTurns` is component state
that never hydrates. The DB has the conversation. The user sees
"" after every refresh.

Both failures pass Rule 7's wording ("a test exercising user-
visible behavior") *if* you read "user-visible" charitably as "the
seam is exercised." Operationally, the rule needs a checklist that
forces the agent to demonstrate the byte's full journey.

### Pre-closure checklist

Before marking any item closed, run all four:

1. **Round-trip test.** There exists a single test that:
   (a) issues a user-shaped action through the public API,
   (b) restarts the process / clears component state / forces a
       fresh request,
   (c) re-reads via a different public API call,
   (d) asserts the user-visible state matches the original action.

   If this test doesn't exist, the item is `in-progress`.

2. **Dead-column check.** For every DB column the change writes,
   grep for non-test reads:
   ```
   grep -rn "<column_name>\b" middleware/src app/src \
     | grep -v "\.test\.\|/tests?/"
   ```
   At least one application-code read site must exist. A column
   that's only read by test fixtures is a dead column — the item
   is `in-progress`.

3. **Dead-endpoint check.** For every server route the change
   adds, grep for non-test callers in the app:
   ```
   grep -rn '"/api/<new-route>' app/src \
     | grep -v "\.test\.\|/tests?/"
   ```
   At least one client call site outside tests must exist. A route
   that's only hit by supertest is a dead endpoint — the item is
   `in-progress`.

4. **Dead-context check.** For every context field the change
   exposes, grep for consumers:
   ```
   grep -rn "\.<fieldName>\b\|: { <fieldName>" app/src \
     | grep -v "\.test\.\|/tests?/"
   ```
   At least one component / view / hook outside the context's own
   file must read it. A field with zero consumers is dead.

### Mark as seam-only, don't lie

If any of the four checks fails AND the work landed anyway (e.g.,
plumbing for a future phase), the row gets status **`seam-only`**
(new status, added 2026-05-27 alongside this rule). `seam-only` is
explicitly NOT `closed`. The honest commit title is "X: write side
wired, read side blocked on Y."

`seam-only` rows count against the WIP cap. They are visible in
`/v/p1` triage. They block the parent epic from being declared
"done at altitude" until they convert to `closed`.

### What this catches (and doesn't)

It catches: tables that get writes but no reads (or vice versa),
endpoints with no callers, contexts with no consumers, persisted
state that vanishes on refresh.

It doesn't catch: writes that go to the wrong column, reads that
return a value the UI ignores, persistence that races with
hydration. Those are correctness bugs — Rule 1 (TDD) is the
defense.
