# GroundX Web UI Scaffold

This is the canonical runnable scaffold for GroundX Studio web UI projects. Managed
workspace projects are initialized from this repository, then agents clone the managed
repo, edit locally, commit, push, and publish.

## Quick Start

```bash
npm install
PARTNER_API_KEY=... LLM_SERVICE=... LLM_MODEL_ID=... LLM_API_KEY=... npm run setup:env
npm run dev
npm run verify:preview
```

Open `http://localhost:5173`. The Vite frontend hot reloads on port `5173`, and the
Express middleware restarts through `tsx watch` on port `3001`. Frontend `/api` requests
proxy to the middleware during development.

`npm run setup:env` writes root `.env.local` and `middleware/.env.local`, which are ignored
by git. It does not write `app/.env.local` because browser code must never receive
GroundX, Partner, runner, provider, or LLM secrets. The Partner API key, LLM
service/provider, LLM model ID, and LLM API key belong only in server-side env files.

Local setup enables `MOCK_MODE=true` by default. That keeps Partner, GroundX, and LLM
responses deterministic for near-instant preview while still exercising the same
server-side secret plumbing as production. Set `MOCK_MODE=false` when you want middleware
to call real upstream services with the configured keys.

Default local preview uses `APP_REPOSITORY_MODE=memory`; it must not require or contact
MySQL. `npm run smoke:dev` intentionally runs with bogus MySQL env values while forcing
memory mode, and passes only if the frontend, middleware, Vite `/api` proxy, mock
Partner routes, mock GroundX routes, and mock LLM route all work without a database.

## Project Layout

```text
app/          Vite React + MUI frontend
middleware/   TypeScript Express middleware for sessions and GroundX proxying
```

The default production stack is Vite React, MUI, Express middleware, and MySQL. Local
development starts with in-memory app metadata so preview is immediate. Set
`APP_REPOSITORY_MODE=mysql` and fill MySQL env values in `middleware/.env.local` when a
feature needs a real local database.

## Commands

```bash
npm run dev       # hot-reload frontend + middleware
npm run build     # build frontend and middleware
npm test          # run frontend and middleware unit tests
npm run test:e2e  # run frontend Playwright smoke tests
npm run smoke:dev # verify memory-mode frontend, middleware, /api proxy, mocks, and LLM boot locally
npm run verify:preview # canonical agent preview proof; currently aliases smoke:dev
```

`npm run smoke:dev` and `npm run verify:preview` use a 30-second boot budget by default.
Override with `SMOKE_TIMEOUT_MS=...` when running in an unusually cold environment.

## Production Configuration

Production deployments must provide server-side middleware secrets through the deployment
secret manager, not browser code:

- `GROUNDX_PARTNER_API_KEY`
- `LLM_SERVICE`
- `LLM_MODEL_ID`
- `LLM_API_KEY`
- `SESSION_SECRET`
- `APP_REPOSITORY_MODE=mysql`
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `ALLOWED_ORIGIN`

The frontend should continue to call same-origin `/api`; do not add browser-visible
GroundX, Partner, LLM, runner, GitHub, or GitLab keys.

## Publish

Managed repos inherit `.github/workflows/deploy.yml`. The workspace runner publish
operation dispatches that workflow with project, branch, commit, and environment
metadata. In v1, publish means "build and upload the web UI artifact"; it does not create
or verify a hosted preview URL by default. Replace or extend the deploy step with your
hosting target when you wire production hosting.

