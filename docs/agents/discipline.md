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
- **When you close one item, write the follow-on backlog id
  FIRST.** If your closure creates new pending work, that work
  goes in `docs/agents/backlog.md` with a real id before you
  add the inline `TODO(<id>)` and before you mark the parent
  closed. Inline TODOs without a backlog-id resolution are
  forbidden.
- **Per-status client error mapping, real readers, real
  prompts.** These are not "polish" — they're the user-visible
  layer that determines whether the seam is doing anything.

## 8. Single backlog, no tombstones, verify before flagging

Pending work lives in exactly one file:
[`docs/agents/backlog.md`](backlog.md). Rules at the top of
that file are part of this discipline.

Operational rules:

- **One backlog.** Do not create new top-level tracking files
  (no `chat-fix-list.md`, no `open-work.md`, no
  `phase-X-tracker.md`). Memory's "Still open" section points at
  the backlog. The backlog is the truth.
- **No tombstones.** When you remove a file, delete it. Don't
  leave a one-line stub saying "this file was merged into Y."
  Single-agent project; the audit trail is in git.
- **Verify before flagging `not-started`.** Before adding any
  item with `not-started` status, grep for the seam first:
  `grep -rn "<feature-name>" middleware/src app/src`. If a
  component / hook / file matching the name exists, the item is
  likely `in-progress`, not `not-started`. The UR-02 false
  positive (drag-to-resize divider, listed `not-started` while
  the component + hook + mount + test all existed) caused this
  rule.
- **Audits use the full discovery checklist** (14 methods at the
  bottom of `backlog.md`), not just `grep TODO`. Past audits
  missed work because they used one method.
- **Closure deletes the inline TODO.** A `TODO(<id>)` in source
  pointing at a closed item is a drift signal. Grep should never
  find one.
- **WIP cap = 3 per epic.** Before opening a 4th `in-progress`
  in any one epic, close one to genuine done OR move one back
  to `not-started`.
