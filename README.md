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
- `GROUNDX_SAMPLES_BUCKET_ID` when onboarding sample documents are enabled
- `LLM_SERVICE`
- `LLM_MODEL_ID`
- `LLM_API_KEY`
- `SESSION_SECRET`
- `APP_REPOSITORY_MODE=mysql`
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `ALLOWED_ORIGIN`
- optional runtime controls such as `LOG_LEVEL`, `BYO_PAGES_LIMIT`, rate limits,
  `METRICS_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `POSTHOG_API_KEY`,
  `POSTHOG_HOST`, `SENTRY_DSN`, `SSO_ENABLED`, and `DISABLE_AGENT_TURN_LOG`

The frontend should continue to call same-origin `/api`; do not add browser-visible
GroundX, Partner, LLM, runner, GitHub, or GitLab keys.

## Publish

Managed repos inherit `.github/workflows/deploy.yml`. A push to `main` deploys
`prod`; manual workflow runs pick `dev` or `prod`. The manual-run form has
exactly one field — **Deployment environment** (`dev` or `prod`). The branch
to deploy is selected via GitHub's built-in "Use workflow from" dropdown above
the form; no need to type it.

Everything else — cluster, ingress, image repos, public host/domain, ALB
certificates, namespace, TLS secrets, image tag override — comes from GitHub
organization / repository variables and secrets. See "Configuration" below.

Deployment uses standard Kubernetes resources through Helm:

- frontend and middleware images are built from `Dockerfile.frontend` and
  `Dockerfile.middleware`
- the frontend serves static assets with nginx and proxies `/api/*` to the private
  middleware `ClusterIP` Service
- middleware is never exposed by Ingress
- frontend Ingress is optional with `publicAccess=ingress`; when `PUBLIC_DOMAIN`
  is set and `PUBLIC_HOST` is not, hosts are derived as
  `<repo-name>.PUBLIC_DOMAIN` for `prod` and `<repo-name>-dev.PUBLIC_DOMAIN`
  for `dev`
- the workflow creates the namespace idempotently before `helm upgrade --install`

Secrets are not workflow dispatch inputs. For shared organization-level deployment,
keep true shared credentials as GitHub organization secrets: `KUBE_CONFIG_DATA`,
`GROUNDX_PARTNER_API_KEY`, and `MYSQL_PASSWORD`. For ECR, prefer GitHub OIDC with
`AWS_ROLE_TO_ASSUME` as an organization variable; otherwise use
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` as organization secrets. Set
`ECR_AWS_REGION` as an organization variable for ECR auth; ECR Public normally uses
`us-east-1`.

Non-secret deploy settings are better as organization variables. The workflow supports
the shared variables `FRONTEND_IMAGE_REPOSITORY`, `MIDDLEWARE_IMAGE_REPOSITORY`,
`K8S_NAMESPACE`, `PUBLIC_ACCESS`, `PUBLIC_DOMAIN`, `INGRESS_CLASS_NAME`,
`INGRESS_ANNOTATIONS_JSON`, `ACM_CERTIFICATE_ARN`, `ALB_GROUP_NAME`,
`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, and `MYSQL_USER`. The deployment
itself is standard Kubernetes: a kubeconfig in `KUBE_CONFIG_DATA`, `kubectl`,
Helm, `Deployment`, `ClusterIP` `Service`, `Secret`, optional `NetworkPolicy`,
and optional `networking.k8s.io/v1` `Ingress`.

For nginx, Traefik, HAProxy, Contour, cert-manager, or on-prem clusters, leave
`ACM_CERTIFICATE_ARN` and `ALB_GROUP_NAME` unset, set `INGRESS_CLASS_NAME` to the
cluster's IngressClass, use `TLS_SECRET_NAME` when the controller reads a
Kubernetes TLS Secret, and use `INGRESS_ANNOTATIONS_JSON` for controller-specific
annotations. Example:
`{"cert-manager.io/cluster-issuer":"letsencrypt-prod"}`.

For the shared AWS ALB path, set `PUBLIC_ACCESS=ingress`,
`PUBLIC_DOMAIN=groundx.ai`, `INGRESS_CLASS_NAME=alb`, `ACM_CERTIFICATE_ARN` to
the wildcard `*.groundx.ai` certificate ARN, and `ALB_GROUP_NAME` to a shared
group such as `groundx-studio`. `AWS_REGION` may describe the EKS/RDS region, but
ECR auth intentionally reads `ECR_AWS_REGION` to avoid mixing those concerns.

`DEPLOY_RUNNER` can select a self-hosted GitHub Actions runner when a private
EKS, private cloud, or on-prem Kubernetes API is not reachable from GitHub-hosted
runners. If it is unset, the workflow uses `ubuntu-latest`.

`TLS_SECRET_NAME` is only for ingress controllers that read Kubernetes TLS
Secrets, such as nginx. For AWS ALB with ACM, use `ACM_CERTIFICATE_ARN` instead.

Per-app or per-environment LLM settings should be provisioned by the agent or scaffold
deployment flow, not as shared org defaults. Use deploy-config to set `LLM_API_KEY` as
a GitHub environment secret and `LLM_SERVICE`, `LLM_MODEL_ID`, and optional
`LLM_BASE_URL` as environment variables. Telemetry secrets such as `POSTHOG_API_KEY`
and `SENTRY_DSN` can be configured there too when needed.

The workflow preserves an existing Kubernetes `SESSION_SECRET` and generates one on
first deploy when none is configured. Configure `SESSION_SECRET` explicitly only when
you need to force a known value.

If all scaffold apps share one namespace, keep `HELM_RELEASE_NAME` unset so each repo
gets its own repo/environment-scoped Helm release. Setting one org-wide
`HELM_RELEASE_NAME` would make scaffold apps replace each other. Keep
`MIDDLEWARE_SECRET_NAME` unset for the same reason; the workflow derives a
release-scoped Kubernetes Secret name by default.

Each deploy pushes one image tag per service: `<repo-name>` for `prod`,
`<repo-name>-dev` for `dev`. The repo name carries the workspace's unique
hash, so it identifies the project across deploys. The tag is reused on every
push to that environment — `imagePullPolicy: Always` (set in `values.yaml`) is
what makes Kubernetes re-pull on each `helm upgrade`. Rollback by tag is not
possible with this scheme; roll back by image digest, or re-run the workflow
against an older commit.
