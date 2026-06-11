# GroundX Web UI Scaffold

This is the canonical runnable scaffold for GroundX Studio web UI projects. Managed
workspace projects are initialized from this repository, then agents clone the managed
repo, edit locally, commit, push, and publish.

## For agents (read first)

If you're an AI agent picking up work on this project, the entry point is
[`AGENTS.md`](AGENTS.md) — a table of contents that links to:

- **Discipline rules** (TDD, secret hygiene, definition of done, round-trip contract)
- **OpenSpec** for planning + active changes + capability specs (at [`openspec/`](openspec/))
- **Architecture** (shell, contexts, ViewerSession, middleware shape)
- **Widget contract** (5-tier component tree + drift guards)
- Onboarding flow (F1–F7), chat session model, testing layers, deploy, observability,
  MCP tool surface, gotchas, airgap audit, real-data rewire plan

Default discipline: failing test first, OpenSpec for planning (no rival tracking
files), round-trip closure before declaring "done." See
[`docs/agents/discipline.md`](docs/agents/discipline.md).

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

The middleware always calls the real Partner, GroundX, and LLM upstreams — there is no
mock mode. Supply real keys in the generated server-side env files to exercise the live
data path locally. Tests achieve deterministic behavior by injecting `Fake*` clients at
the dependency seam (a standard test double), not via any runtime flag.

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
`prod`; manual workflow runs pick `dev` or `prod`. The only field a human
fills in is **Deployment environment** (`dev` or `prod`). The branch comes
from GitHub's built-in "Use workflow from" dropdown above the form.

There are three additional optional inputs (`projectId`, `branch`,
`commitSha`) that the harness's `publish` MCP tool passes through for
workspace-project correlation. Leave them blank when dispatching manually —
the workflow body does not read them.

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
  for `dev`; `PUBLIC_HOSTS` may add comma- or whitespace-separated aliases such
  as `dev.studio.groundx.ai` or `studio.groundx.ai`
- the workflow creates the namespace idempotently before `helm upgrade --install`

Secrets are not workflow dispatch inputs. Shared credentials live as GitHub
organization secrets: `GROUNDX_PARTNER_API_KEY` and `MYSQL_PASSWORD`. For AWS,
prefer GitHub OIDC with `AWS_ROLE_TO_ASSUME` as an organization variable;
otherwise use `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as organization
secrets.

EKS targeting is per-environment. Set four variables (org, repo, or
GitHub-environment scope works for all of them):

| Variable | Used when `environment` is | Example |
|---|---|---|
| `EKS_CLUSTER_NAME_DEV` | `dev` | `eyelevel-dev` |
| `EKS_CLUSTER_REGION_DEV` | `dev` | `us-east-1` |
| `EKS_CLUSTER_NAME_PROD` | `prod` | `eyelevel-prod` |
| `EKS_CLUSTER_REGION_PROD` | `prod` | `us-east-1` |

The workflow picks the right pair based on the chosen environment, then
generates the kubeconfig per job via `aws eks update-kubeconfig` — no static
`KUBE_CONFIG_DATA` secret. The IAM principal behind `AWS_ROLE_TO_ASSUME` must
1. have `eks:DescribeCluster` on the target cluster, **and**
2. be mapped in the cluster's `kube-system/aws-auth` ConfigMap (or in an EKS
   access entry) so the K8s API authorizes it.

ECR Public auth uses the same AWS credentials; the action internally forces
`us-east-1` regardless of `EKS_CLUSTER_REGION`, so a non-us-east-1 EKS region
does not break ECR Public push.

Non-secret deploy settings are better as organization variables. The workflow supports
the shared variables `FRONTEND_IMAGE_REPOSITORY`, `MIDDLEWARE_IMAGE_REPOSITORY`,
`K8S_NAMESPACE`, `PUBLIC_ACCESS`, `PUBLIC_DOMAIN`, `INGRESS_CLASS_NAME`,
`PUBLIC_HOSTS`, `INGRESS_ANNOTATIONS_JSON`, `ACM_CERTIFICATE_ARN`, `ALB_GROUP_NAME`,
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
Set `PUBLIC_HOSTS=dev.studio.groundx.ai` in the dev environment and
`PUBLIC_HOSTS=studio.groundx.ai` in prod when the generated workspace hostname
should remain live alongside the branded alias.

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
