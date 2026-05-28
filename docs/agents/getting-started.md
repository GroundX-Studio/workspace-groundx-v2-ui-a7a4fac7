# Getting Started

Shortest path from clone to "I can make a change."

## Prereqs

- Node 22 (matches the Dockerfile + scaffold engines).
- npm 10+.
- (For deploys) a GitHub workspace token via the `groundx-studio` MCP server.

## First clone

The project is a managed scaffold cloned via the
`groundx-studio` MCP. If you're starting fresh, do NOT clone the
upstream `groundx-web-ui-scaffold` repo by hand — that's an
escape hatch. Use `harness-publish`'s flow:

```text
project_create → git_session → clone_project → setup_env → dev_start
```

If you already have the repo locally, skip ahead.

## Local env setup

`middleware/.env.local` and `app/.env.local` are gitignored.
Bootstrap them with:

```bash
PARTNER_API_KEY=<…> \
LLM_SERVICE=openai \
LLM_MODEL_ID=gpt-4o \
LLM_API_KEY=<…> \
npm run setup:env
```

This writes the env files + verifies the keys.

The `PARTNER_API_KEY` value above is the user's **single Partner API
key** (one identity per user; OAuth path is the future). After
setup, it lands at `scaffold/.env.local` →
`GROUNDX_PARTNER_API_KEY` (and the same value in
`scaffold/middleware/.env.local`). That's also the value you re-read
on every `mcp__groundx-studio__*` call — `.env.local` is a workaround
home for it, not the canonical one. See `docs/agents/mcp-tools.md` →
"Where `PARTNER_API_KEY` lives" for the persistence shape, recovery
commands, and why this needs to move out of `.env.local` long-term.

## The inner loop

```bash
npm run dev              # Start app + middleware on 5173 + 3001
npm test                 # Vitest across app + middleware
npm run scan:secrets     # Static scan for committed secrets
npm run test:e2e         # Playwright (slow; demand-driven)
npm run verify:preview   # Smoke test that the dev preview actually serves
```

`npm test` runs `test:alias` + `test:setup-env` + `test:deploy` +
app unit + middleware unit. Anything you break shows up here.

## Adding a frame view

Workflow (for any new view under `app/src/views/Onboarding/`):

1. Write the failing test (`<View>.test.tsx`) with the assertions
   that describe the wanted behavior. Use
   `renderWithOnboardingProviders` from `app/src/test/`.
2. Implement the view.
3. Wire into `OnboardingShell.tsx`'s `canvasContent` switch if it's
   a new frame.
4. Verify in browser via `npm run dev`.

Useful patterns to lift from existing views:
- `IngestView` (F1): scenario picker grid, BYO tile.
- `UnderstandView` (F2): scan animation, LIVE PARSE row, page thumbnails.
- `ChatColumn`: header + sample switcher + bubbles + Pick-a-view pills.

## Adding a middleware endpoint

1. Write the failing test in `middleware/src/apiRouteContract.test.ts`
   (supertest pattern is already there for every existing endpoint).
2. Add the route in `middleware/src/app.ts`.
3. If it touches the repo, extend `AppRepository` interface +
   `MemoryAppRepository` + `MySqlAppRepository`.
4. Re-run `npm test`. Green = done.

## Pushing changes

Always via the MCP:

```text
mcp__groundx-studio__commit_push
  cwd: scaffold/
  message: "…"
```

The MCP handles git-session credentials and the GitHub-App
`workflows` scope. Plain `git push` against the managed-repo
remote will be rejected.

After push, trigger deploy:

```text
mcp__groundx-studio__publish
  projectId: groundx-v2-ui
  environment: dev
```

See [deploy.md](deploy.md) for what happens then.

## When you get stuck

In order:
1. Re-read `docs/agents/gotchas.md` — your bug is probably listed.
2. Re-read the wireframe spec under [`openspec/wireframes/source/`](../../openspec/wireframes/source/) (or open `openspec/wireframes/Onboarding Spec _standalone_.html` in a browser for the visual).
3. Read the relevant `docs/agents/*.md` reference.
4. Ask the user — surface 2–3 possible causes + the one you'd pick.
   Don't dump a wall of speculation.
