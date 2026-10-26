## Why

AGE-394 reports 24 deployed Studio middleware image digests running Node 22.23.2 or 22.23.3, built before the emergency Node certificate update. One of them is main Studio (`groundx-v2-prod-groundx-web-ui-middleware`). Main Studio's `Dockerfile.middleware` uses the floating `node:22-alpine` tag in both stages, so its Node version depends on what the builder happens to have cached. The ticket asks for the base to be pinned to a fixed release and for security builds to pull a fresh base.

## What Changes

- Pin both `FROM node:22-alpine` lines in `Dockerfile.middleware` (lines 3 and 20) to `node:22.23.4-alpine`.
- Add `pull: true` to both image build steps (frontend and middleware) in `.github/workflows/deploy.yml`, so a build asks for a fresh base. The middleware step is at lines 249-256. Existing `no-cache: true` stays.
- Acceptance is shown by one-off `check:` commands in `tasks.md`. No new CI test or guard is added.

This change does not patch any deployed digest. Existing images stay as they are until a new build is deployed.

## Capabilities

### New Capabilities

- `middleware-image-node-base`: the middleware image build selects an explicitly pinned, fixed Node 22 base and requests a fresh base pull on each deploy build.

### Modified Capabilities

None.

## Impact

- Files: `Dockerfile.middleware`, `.github/workflows/deploy.yml`.
- No API, database, environment variable, Helm or contract change. Managed-database CA and secret behavior (AGE-361) is not touched.
- Deploy: this repo's deploy workflow push trigger watches `main`, while the deployed line is `workspace/groundx-v2-ui`. Merging to that branch deploys nothing. A person must run the workflow by manual dispatch on that ref. The rollout steps are in the workspace change's `runbook.md`.
- Unchanged on purpose: `Dockerfile.frontend`, `package.json` engines, CI `node-version`, `scripts/test-deploy-assets.mjs`.
- Other active OpenSpec changes in this repo are not touched.

## Scope

In scope: the two files above.

Out of scope: AWS, EKS and any deployment; customer project repos; a CI guard against old Node; database trust rebinding (AGE-361); groundx-on-prem image trust (GX-134).

## Open design questions

None. The tag `node:22.23.4-alpine` is assumed to exist; the first build confirms it.
