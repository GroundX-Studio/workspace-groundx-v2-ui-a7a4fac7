# GroundX Web UI Scaffold

This is the canonical runnable scaffold for GroundX Studio web UI projects. Managed
workspace projects are initialized from this repository, then agents clone the managed
repo, edit locally, commit, push, and publish.

## Quick Start

```bash
npm install
PARTNER_API_KEY=... LLM_API_KEY=... npm run setup:env
npm run dev
```

Open `http://localhost:5173`. The Vite frontend hot reloads on port `5173`, and the
Express middleware restarts through `tsx watch` on port `3001`. Frontend `/api` requests
proxy to the middleware during development.

`npm run setup:env` writes `middleware/.env.local`, which is ignored by git. The Partner
API key and LLM API key belong only in middleware env files. Browser code must never
receive GroundX, Partner, runner, provider, or LLM secrets.

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
npm run smoke:dev # verify frontend, middleware, and Vite /api proxy boot locally
```

## Production Configuration

Production deployments must provide server-side middleware secrets through the deployment
secret manager, not browser code:

- `GROUNDX_PARTNER_API_KEY`
- `LLM_API_KEY`
- `SESSION_SECRET`
- `APP_REPOSITORY_MODE=mysql`
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `ALLOWED_ORIGIN`

The frontend should continue to call same-origin `/api`; do not add browser-visible
GroundX, Partner, LLM, runner, GitHub, or GitLab keys.

## Publish

Managed repos inherit `.github/workflows/deploy.yml`. The workspace runner publish
operation dispatches that workflow with project, branch, and commit metadata.
