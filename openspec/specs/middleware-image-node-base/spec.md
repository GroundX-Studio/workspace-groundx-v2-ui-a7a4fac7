# middleware-image-node-base Specification

## Purpose
TBD - created by archiving change age-394-groundx-studio-patch-node-in-24-deployed-middleware-images. Update Purpose after archive.
## Requirements
### Requirement: Middleware image pins a fixed Node 22 base
`Dockerfile.middleware` SHALL build every Node stage (`deps` and `runtime`) from `node:22.23.4-alpine`. It SHALL NOT use the floating `node:22-alpine` tag in any stage.

#### Scenario: Both Node stages use the pinned tag (finalize success)
- **WHEN** `Dockerfile.middleware` is read after this change
- **THEN** both `FROM node:` lines name `node:22.23.4-alpine`

#### Scenario: No floating tag remains (reject the old behavior)
- **WHEN** `Dockerfile.middleware` is searched for `node:22-alpine`
- **THEN** there is no match, so the Node version no longer depends on what the builder has cached

### Requirement: Deploy builds pull a fresh base
Both image build steps in `.github/workflows/deploy.yml` (frontend and middleware) SHALL set `pull: true`. The existing `no-cache: true` on both steps SHALL stay.

#### Scenario: Both build steps pull a fresh base (finalize success)
- **WHEN** the deploy workflow builds the frontend and the middleware image
- **THEN** each `docker/build-push-action` step carries `pull: true` and `no-cache: true`

### Requirement: Nothing outside the two files changes
This change SHALL edit only `Dockerfile.middleware` and `.github/workflows/deploy.yml` among tracked source files. `Dockerfile.frontend`, `package.json` engines, the CI `node-version` and `scripts/test-deploy-assets.mjs` SHALL stay as they are, and no new CI guard is added.

#### Scenario: Unrelated files are left alone (skip unrelated repair path)
- **WHEN** the diff against the base branch is listed, ignoring `openspec/`
- **THEN** it names exactly `.github/workflows/deploy.yml` and `Dockerfile.middleware`

