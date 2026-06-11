# Deploy + Helm + EKS

How `git push` becomes a running pod, end-to-end.

## The pipeline

```
git commit + commit_push (MCP)
        │
        ▼
GitHub Actions deploy.yml
        │  (on push to main: prod; workflow_dispatch: dev or prod)
        ├── Configure AWS credentials (OIDC role or access keys)
        ├── Build + push Dockerfile.frontend image
        ├── Build + push Dockerfile.middleware image
        ├── aws eks update-kubeconfig --name <EKS_CLUSTER_NAME> --region <EKS_CLUSTER_REGION>
        ├── kubectl create namespace --dry-run=client | apply -f -
        ├── Render K8s Secret for middleware env vars
        └── helm upgrade --install --atomic --wait
              │
              ▼
        EKS cluster
        ├── frontend Deployment + ClusterIP Service (nginx serving Vite build)
        ├── middleware Deployment + ClusterIP Service (Node + Express)
        ├── Optional Ingress (when publicAccess=ingress)
        └── Optional NetworkPolicy
```

## Workflow inputs — keep them minimal

`workflow_dispatch.inputs` has been trimmed to the two real
choices:

| Input | Required | Default |
|---|---|---|
| `environment` | yes | `dev` |
| Branch picker (built-in "Use workflow from" dropdown) | yes | the current branch |

Everything else (cluster, ingress, image repos, ALB cert, namespace,
public host/domain, public host aliases, TLS secrets) is GitHub `vars` /
`secrets`.

(Three "Harness plumbing" passthrough inputs — `projectId`,
`branch`, `commitSha` — also live in the dispatch form because
the `publish` MCP tool sends them. Workflow body ignores them.
Labeled "(Harness plumbing — leave blank for manual runs)".)

## Per-environment EKS targeting

Set as GitHub `vars` (org / repo / env scope) — env scope wins.

| Variable | Used when env is | Example |
|---|---|---|
| `EKS_CLUSTER_NAME_DEV` | `dev` | `eyelevel_dev` |
| `EKS_CLUSTER_REGION_DEV` | `dev` | `us-west-2` |
| `EKS_CLUSTER_NAME_PROD` | `prod` | `eyelevel_prod` |
| `EKS_CLUSTER_REGION_PROD` | `prod` | `us-east-1` |

The workflow picks the right pair and exposes resolved
`EKS_CLUSTER_NAME` + `EKS_CLUSTER_REGION` to the steps that follow.

## IAM + cluster auth — the 4-layer gate

Every fresh deploy environment hits these in sequence. Set them
up once on each cluster + AWS account:

| Layer | What's needed | Failure looks like |
|---|---|---|
| 1 | `ecr-public:GetAuthorizationToken` + `sts:GetServiceBearerToken` on the OIDC role | `not authorized to perform: ecr-public:GetAuthorizationToken` |
| 2 | `ecr-public:BatchCheckLayerAvailability` / `…:PutImage` / etc. | Push fails after auth |
| 3 | `eks:DescribeCluster` on the cluster ARN | `not authorized to perform: eks:DescribeCluster` |
| 4 | IAM principal mapped in cluster `kube-system/aws-auth` ConfigMap (or EKS access entry) | `the server has asked for the client to provide credentials` |

Layer 4 is the trap — looks like a kubeconfig problem, is actually
K8s RBAC. EKS access entries are preferred:

```bash
ROLE_ARN=arn:aws:iam::<account>:role/<role>
aws eks create-access-entry --cluster-name <name> --region <region> \
  --principal-arn "$ROLE_ARN" --type STANDARD
aws eks associate-access-policy --cluster-name <name> --region <region> \
  --principal-arn "$ROLE_ARN" \
  --access-scope type=cluster \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy
```

(Requires cluster auth mode `API` or `API_AND_CONFIG_MAP`.)

## Image tagging — one stable tag per env

```
prod  →  <repo-name>           e.g. workspace-groundx-v2-ui-a7a4fac7
dev   →  <repo-name>-dev       e.g. workspace-groundx-v2-ui-a7a4fac7-dev
```

The repo name carries the workspace's unique hash, so it
identifies the project across deploys. Same tag is reused on every
push to that env. `imagePullPolicy: Always` (in `values.yaml`)
makes K8s re-pull on each `helm upgrade`.

Tradeoff (intentional): rollback by tag is gone. Rollback by image
digest or by re-running the workflow against an older commit still
works.

## Per-environment middleware secret

The "Apply middleware secret" step in deploy.yml renders a single
K8s Secret containing every middleware env var:

```
NODE_ENV, PORT, LOG_LEVEL, APP_REPOSITORY_MODE,
ALLOWED_ORIGIN,
GROUNDX_BASE_URL, GROUNDX_SAMPLES_BUCKET_ID, GROUNDX_PARTNER_API_KEY,
LLM_SERVICE, LLM_BASE_URL, LLM_MODEL_ID, LLM_AUTH_HEADER_NAME, LLM_AUTH_SCHEME, LLM_API_KEY,
BYO_PAGES_LIMIT,
RATE_LIMIT_AUTH_PER_MIN, RATE_LIMIT_API_PER_MIN, RATE_LIMIT_LLM_PER_MIN,
METRICS_ENABLED,
OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME,
POSTHOG_API_KEY, POSTHOG_HOST,
SENTRY_DSN, SESSION_SECRET,
SSO_ENABLED, DISABLE_AGENT_TURN_LOG,
MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
```

Each value comes from `vars.X || secrets.X || ''` in the workflow.
The middleware deployment mounts the Secret via `envFrom:
secretRef:`. Verify with:

```bash
kubectl -n <ns> exec <middleware-pod> -- printenv | sort
```

`SESSION_SECRET` is preserved across deploys — the workflow reads
the existing value out of the cluster Secret before writing, so a
re-deploy doesn't rotate cookies.

## Public Ingress

Off by default. Turn on by setting:

| Variable | Value |
|---|---|
| `PUBLIC_ACCESS` | `ingress` |
| `INGRESS_CLASS_NAME` | `alb` (AWS) or `nginx` / `traefik` / `contour` |
| `PUBLIC_DOMAIN` | e.g. `groundx.ai` — workflow derives host as `<repo-name>.<domain>` for prod, `<repo-name>-<env>.<domain>` for non-prod |
| `PUBLIC_HOST` | (alternative to PUBLIC_DOMAIN) explicit host like `eyelevel-dev.groundx.ai` |
| `ACM_CERTIFICATE_ARN` | (AWS ALB only) wildcard cert ARN for the public domain |
| `ALB_GROUP_NAME` | (AWS ALB only) shared ALB group label |
| `TLS_SECRET_NAME` | (non-ALB only) K8s TLS secret for the ingress controller |
| `INGRESS_ANNOTATIONS_JSON` | extra annotations as a JSON object |

The frontend Service stays ClusterIP. AWS ALB Ingress uses
`target-type=ip` and points directly at pod IPs — that's why
`kubectl get svc` shows `EXTERNAL-IP: <none>`. **Always check
`kubectl get ingress` for the actual ALB DNS in the `ADDRESS`
column.**

## Ops workflows

Two manual workflows alongside `deploy.yml`:

### `diagnose.yml`

Inputs: `environment`, `podSelector` (name or label), `tailLines`
(default 200). Runs:

```bash
kubectl describe pod <pod>
kubectl logs <pod> -c <container> --tail <n>
kubectl logs <pod> -c <container> --tail <n> --previous   # crash-loop diagnosis
```

Output goes to the GitHub Actions run log. Use this when a pod is
behaving badly and you can't (or don't want to) attach a local
kubectl.

### `uninstall.yml`

Inputs: `environment`, `confirm` (must equal literal "uninstall"). Runs
`helm uninstall` and deletes common release-labeled leftovers if Helm leaves
resources behind. It does not delete namespaces; those are pre-created deploy
configuration. Prefer the managed `deployment_teardown` MCP/API path when
removing only a deployment; `helm_uninstall` / `uninstall.yml` is the lower-level
fallback. The confirm phrase is the safety guard — GitHub Environments'
"required reviewers" is the secondary guard for `prod`.

### `alb-alarms.yml`

Creates / re-asserts the three CloudWatch alarms our compliance
posture requires on the public ALB:

| Alarm | CloudWatch metric | Default threshold |
|---|---|---|
| `<prefix>-alb-latency` | `AWS/ApplicationELB · TargetResponseTime` (Avg / 5 min × 2) | > 1.0 s |
| `<prefix>-alb-unhealthy-hosts` | `AWS/ApplicationELB · UnHealthyHostCount` (Max / 1 min × 2) | ≥ 1 |
| `<prefix>-alb-5xx` | `AWS/ApplicationELB · HTTPCode_Target_5XX_Count` (Sum / 5 min × 1) | > 5 |

Inputs: `environment`, plus optional threshold overrides. The
workflow looks up the ALB DNS from `kubectl get ingress -o
jsonpath='{.status.loadBalancer.ingress[0].hostname}'` in the
environment's namespace, then invokes `scripts/aws/ensure-alb-alarms.sh`.

**Deliberately NOT wired into `deploy.yml`** — a transient AWS API
blip on the alarms call shouldn't block an app deploy. Run this
workflow once after the first deploy of an environment, and again
any time you want to retune thresholds. The script is idempotent
(`aws cloudwatch put-metric-alarm` is an upsert), so re-runs are
safe.

Notifications are optional: set `ALARM_SNS_TOPIC_ARN_DEV` /
`ALARM_SNS_TOPIC_ARN_PROD` as repo / environment vars or secrets
to publish alarm state changes to an SNS topic. Without a topic the
alarms still exist and satisfy the compliance control — they just
don't page anyone.

## MCP-driven loop

```text
mcp__groundx-studio__commit_push      # push commits via the harness git-session token
mcp__groundx-studio__publish          # dispatch deploy.yml
mcp__groundx-studio__sync_status      # ahead/behind/clean check
mcp__groundx-studio__deploy_config    # set GitHub env vars + secrets per environment
```

`publish` always passes `projectId`, `branch`, `commitSha`,
`environment` as workflow inputs. The workflow accepts them as
ignored "Harness plumbing" passthroughs.

After dispatch the harness operation succeeds when the workflow
run is **dispatched** — not when it finishes. To see whether the
deploy actually succeeded, watch the GitHub Actions run.

## When something breaks

Most-common deploy failures, in order of likelihood:

1. **Old workflow file**: dispatched with the wrong "Use workflow
   from" ref. Re-dispatch on `workspace/<branch>`.
2. **AWS IAM gap**: layer 1–3 above.
3. **aws-auth not updated**: layer 4 above. `kubectl auth can-i get pods`
   from the role's kubeconfig surfaces this.
4. **Stale image tag cache**: not an issue with `pullPolicy: Always`,
   but check anyway.
5. **Helm release stuck**: `helm history <release> -n <ns>`; if a
   prior rollout is wedged, `helm rollback` or `uninstall` + retry.
