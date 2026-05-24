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
