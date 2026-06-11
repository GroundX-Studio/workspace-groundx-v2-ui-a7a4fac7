import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function commandExists(command) {
  return spawnSync(command, ["version"], { stdio: "ignore" }).status === 0;
}

function countRenderedKinds(rendered, kind) {
  return rendered.split(/^---$/m).filter((doc) => new RegExp(`kind:\\s*${kind}\\b`).test(doc)).length;
}

for (const file of [
  ".dockerignore",
  "Dockerfile.frontend",
  "Dockerfile.middleware",
  "deploy/helm/groundx-web-ui/Chart.yaml",
  "deploy/helm/groundx-web-ui/values.yaml",
  "deploy/helm/groundx-web-ui/templates/frontend-deployment.yaml",
  "deploy/helm/groundx-web-ui/templates/middleware-deployment.yaml",
  "deploy/helm/groundx-web-ui/templates/middleware-service.yaml",
  "deploy/helm/groundx-web-ui/templates/ingress.yaml",
  "deploy/nginx/default.conf.template",
]) {
  assert(existsSync(join(root, file)), `${file} must exist`);
}

const frontendDockerfile = read("Dockerfile.frontend");
assert(frontendDockerfile.includes("npm --workspace app run build"), "frontend image must build the Vite app");
assert(frontendDockerfile.includes("/etc/nginx/templates/default.conf.template"), "frontend image must install nginx proxy template");

const dockerignore = read(".dockerignore");
for (const pattern of ["node_modules", "app/dist", "middleware/dist", ".git", ".env.*"]) {
  assert(dockerignore.includes(pattern), `.dockerignore must exclude ${pattern}`);
}

const middlewareDockerfile = read("Dockerfile.middleware");
assert(middlewareDockerfile.includes("npm --workspace middleware run build"), "middleware image must build TypeScript");
assert(middlewareDockerfile.includes('"npm", "--workspace", "middleware", "run", "start"'), "middleware image must run the middleware start script");

// ── @groundx/shared workspace wiring (B1) — keep dev / prod / container
// resolution intact. The shared wire-contract package must be built before
// its consumers (no `prepare` — that breaks `npm ci --omit=dev` where tsc is
// omitted, as the container build caught). These static assertions fail fast
// in `npm test`; the CI docker-build job (below) is the end-to-end guard.
const rootPkg = JSON.parse(read("package.json"));
assert(
  Array.isArray(rootPkg.workspaces) && rootPkg.workspaces.includes("shared"),
  "root workspaces must include 'shared'",
);
for (const script of ["build", "dev", "test"]) {
  assert(
    rootPkg.scripts[script]?.includes("npm --workspace @groundx/shared run build"),
    `root '${script}' script must build @groundx/shared first (dev/test/prod must resolve it without relying on a prepare hook)`,
  );
}
const sharedPkg = JSON.parse(read("shared/package.json"));
assert(
  sharedPkg.main === "./dist/index.js" && sharedPkg.types === "./dist/index.d.ts",
  "@groundx/shared must publish its built dist (main + types) for node/tsc resolution",
);
assert(
  !sharedPkg.scripts?.prepare,
  "@groundx/shared must NOT have a 'prepare' script — it runs during `npm ci --omit=dev` (container runtime stage) where tsc is absent and fails the build",
);
for (const [name, df] of [
  ["frontend", frontendDockerfile],
  ["middleware", middlewareDockerfile],
]) {
  assert(df.includes("COPY shared/package*.json shared/"), `${name} image deps stage must COPY shared/package*.json for the workspace install`);
  assert(df.includes("COPY shared shared"), `${name} image build stage must COPY the shared package`);
  assert(df.includes("npm --workspace @groundx/shared run build"), `${name} image must build @groundx/shared before the app/middleware build`);
}
assert(
  middlewareDockerfile.includes("COPY --from=build /workspace/shared/dist shared/dist"),
  "middleware runtime stage must ship shared/dist for the @groundx/shared symlink to resolve at runtime",
);
const ciWorkflow = read(".github/workflows/ci.yml");
assert(
  /docker build/.test(ciWorkflow) && ciWorkflow.includes("Dockerfile.middleware") && ciWorkflow.includes("Dockerfile.frontend"),
  "CI must build BOTH Docker images (the container-build regression guard for the @groundx/shared wiring)",
);

const nginxTemplate = read("deploy/nginx/default.conf.template");
assert(nginxTemplate.includes("location /api/"), "nginx must proxy /api/*");
assert(nginxTemplate.includes("proxy_pass ${MIDDLEWARE_SERVICE_URL};"), "nginx must proxy to middleware service URL");

const middlewareService = read("deploy/helm/groundx-web-ui/templates/middleware-service.yaml");
assert(/type:\s*ClusterIP/.test(middlewareService), "middleware Service must be ClusterIP");

const ingress = read("deploy/helm/groundx-web-ui/templates/ingress.yaml");
assert(ingress.includes('eq .Values.publicAccess "ingress"'), "Ingress must only render in public ingress mode");
assert(!ingress.includes("middleware"), "Ingress must never route directly to middleware");
assert(ingress.includes(".Values.ingressAnnotations"), "Ingress must support generic controller annotations");
assert(ingress.includes("alb.ingress.kubernetes.io/certificate-arn"), "Ingress must support ALB ACM certificate annotation");
assert(ingress.includes("alb.ingress.kubernetes.io/group.name"), "Ingress must support shared ALB group annotation");
assert(ingress.includes("alb.ingress.kubernetes.io/target-type"), "Ingress must support ALB IP targets for ClusterIP services");
assert(ingress.includes(".Values.publicHosts"), "Ingress must support additional public host aliases");

const workflow = read(".github/workflows/deploy.yml");
assert(workflow.includes("branches:\n      - main"), "deploy workflow must run on merge/push to main");
assert(workflow.includes("workflow_dispatch:"), "deploy workflow must support manual runs");
assert(workflow.includes("type: choice") && workflow.includes("- dev") && workflow.includes("- prod"), "manual deploy environment must be dev|prod");
assert(workflow.includes("runs-on: ${{ vars.DEPLOY_RUNNER || 'ubuntu-latest' }}"), "deploy runner must be configurable for private/on-prem clusters");
assert(workflow.includes('kubectl create namespace "$K8S_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -'), "namespace creation must be idempotent");
assert(workflow.includes("Dockerfile.frontend") && workflow.includes("Dockerfile.middleware"), "workflow must build both Docker images");
assert(workflow.includes("lowercase()"), "workflow must define an image repository lowercase helper");
assert(workflow.includes("slugify_tag()"), "workflow must define a Docker tag slug helper");
assert(workflow.includes("slugify_k8s_name()"), "workflow must define a Kubernetes name slug helper");
assert(workflow.includes('image_tag="$repo_tag"'), "prod deploys must tag as <repo-name>");
assert(workflow.includes('image_tag="${repo_tag}-${DEPLOY_ENVIRONMENT}"'), "non-prod deploys must tag as <repo-name>-<env>");
assert(!/\bchannel_tag\b/.test(workflow), "old channel_tag/image_tag split must be gone — one tag per env");
assert(!/short_sha|run_attempt/.test(workflow), "old per-commit immutable tag fragments must be gone");
assert(workflow.includes('namespace="${K8S_NAMESPACE_INPUT:-${repo_k8s_name}-${DEPLOY_ENVIRONMENT}}"'), "default namespace must be repo/environment scoped");
assert(workflow.includes('release_name="$(slugify_k8s_name "${HELM_RELEASE_NAME_INPUT:-${repo_k8s_name}-${DEPLOY_ENVIRONMENT}}")"'), "default Helm release name must be repo/environment scoped");
assert(workflow.includes('middleware_secret_name="$(slugify_k8s_name "${MIDDLEWARE_SECRET_NAME_INPUT:-${release_name}-middleware}")"'), "default middleware secret name must be release scoped");
assert(workflow.includes('public_host="${repo_k8s_name}.${public_domain}"'), "prod public host must default to repo-name.public-domain");
assert(workflow.includes('public_host="${repo_k8s_name}-${DEPLOY_ENVIRONMENT}.${public_domain}"'), "non-prod public host must default to repo-name-environment.public-domain");
assert(workflow.includes('helm upgrade --install "${{ steps.deploy-vars.outputs.release_name }}"'), "Helm release must not be fixed across scaffold repos");
assert(workflow.includes('--set-string middleware.existingSecret="${{ steps.deploy-vars.outputs.middleware_secret_name }}"'), "Helm must use the computed middleware secret name");
assert(workflow.includes('--set-string publicHost="${{ steps.deploy-vars.outputs.public_host }}"'), "Helm must use the computed public host");
assert(workflow.includes('--set-literal publicHosts="$PUBLIC_HOSTS_INPUT"'), "Helm must receive additional public host aliases without splitting commas");
assert(workflow.includes('--set-json ingressAnnotations="$INGRESS_ANNOTATIONS_JSON_INPUT"'), "Helm must accept generic ingress annotations as JSON");
assert(workflow.includes('--set-string acmCertificateArn="$ACM_CERTIFICATE_ARN_INPUT"'), "Helm must receive the ACM certificate ARN");
assert(workflow.includes('--set-string albGroupName="$ALB_GROUP_NAME_INPUT"'), "Helm must receive the ALB group name");
assert(
  workflow.includes('frontend_repo="$(lowercase "${FRONTEND_IMAGE_REPOSITORY_INPUT:-${configured_registry}/${GITHUB_REPOSITORY}/frontend}")"'),
  "workflow must lowercase the frontend image repository before Docker build",
);
assert(
  workflow.includes('middleware_repo="$(lowercase "${MIDDLEWARE_IMAGE_REPOSITORY_INPUT:-${configured_registry}/${GITHUB_REPOSITORY}/middleware}")"'),
  "workflow must lowercase the middleware image repository before Docker build",
);
assert(workflow.includes("secrets.FRONTEND_IMAGE_REPOSITORY"), "workflow must allow frontend image repository from org secrets");
assert(workflow.includes("secrets.MIDDLEWARE_IMAGE_REPOSITORY"), "workflow must allow middleware image repository from org secrets");
assert(workflow.includes("secrets.K8S_NAMESPACE"), "workflow must allow namespace from org secrets");
assert(workflow.includes("vars.PUBLIC_DOMAIN"), "workflow must allow default public hosts from an org public domain");
assert(workflow.includes("vars.PUBLIC_HOSTS"), "workflow must allow additional public host aliases from org variables");
assert(workflow.includes("vars.ACM_CERTIFICATE_ARN"), "workflow must allow ALB ACM certificate ARN from org variables");
assert(workflow.includes("vars.ALB_GROUP_NAME"), "workflow must allow ALB group name from org variables");
assert(workflow.includes("vars.INGRESS_ANNOTATIONS_JSON"), "workflow must allow generic ingress annotations from org variables");
assert(workflow.includes("MYSQL_PASSWORD: ${{ secrets.MYSQL_PASSWORD }}"), "workflow must source MYSQL_PASSWORD from GitHub secrets");
assert(workflow.includes("aws-actions/amazon-ecr-login@v2"), "workflow must support Amazon ECR Public login");
assert(workflow.includes("registry-type: public"), "workflow must use public ECR registry mode");
// Unified AWS_REGION drives both EKS and ECR; the ECR Public auth flow
// inside aws-actions/amazon-ecr-login@v2 forces us-east-1 internally,
// so we no longer need a separate ECR_AWS_REGION env var.
// EKS targeting is per-environment. The workflow exposes
// EKS_CLUSTER_REGION_DEV / EKS_CLUSTER_REGION_PROD and
// EKS_CLUSTER_NAME_DEV / EKS_CLUSTER_NAME_PROD as org/repo/env vars,
// then resolves each pair into a single EKS_CLUSTER_REGION /
// EKS_CLUSTER_NAME at job-env time based on the chosen environment.
assert(/EKS_CLUSTER_REGION_DEV/.test(workflow), "workflow must source dev region from EKS_CLUSTER_REGION_DEV");
assert(/EKS_CLUSTER_REGION_PROD/.test(workflow), "workflow must source prod region from EKS_CLUSTER_REGION_PROD");
assert(/EKS_CLUSTER_NAME_DEV/.test(workflow), "workflow must source dev cluster from EKS_CLUSTER_NAME_DEV");
assert(/EKS_CLUSTER_NAME_PROD/.test(workflow), "workflow must source prod cluster from EKS_CLUSTER_NAME_PROD");
assert(/^\s+EKS_CLUSTER_REGION:/m.test(workflow), "workflow must compute a resolved EKS_CLUSTER_REGION env var");
assert(/^\s+EKS_CLUSTER_NAME:/m.test(workflow), "workflow must compute a resolved EKS_CLUSTER_NAME env var");
assert(!/^\s+AWS_REGION:/m.test(workflow), "workflow must not define a single AWS_REGION — EKS_CLUSTER_REGION is per-env");
assert(!/ECR_AWS_REGION/.test(workflow), "ECR_AWS_REGION must be gone — EKS_CLUSTER_REGION covers EKS, ECR Public auth forces us-east-1 internally");
// EKS kubeconfig is generated dynamically per job. We no longer ship a
// static kubeconfig as KUBE_CONFIG_DATA.
assert(workflow.includes("aws eks update-kubeconfig"), "workflow must generate the kubeconfig from EKS dynamically");
assert(!/KUBE_CONFIG_DATA/.test(workflow), "KUBE_CONFIG_DATA must not appear — dynamic kubeconfig replaces the static secret");
assert(workflow.includes("kubectl -n \"$K8S_NAMESPACE\" get secret \"$MIDDLEWARE_SECRET_NAME\" -o jsonpath='{.data.SESSION_SECRET}'"), "workflow must preserve existing SESSION_SECRET");
assert(workflow.includes("openssl rand -base64 48"), "workflow must generate SESSION_SECRET on first deploy");
for (const key of [
  "GROUNDX_DEPLOY_COMMIT_SHA",
  "GROUNDX_DEPLOY_ENVIRONMENT",
  "GROUNDX_DEPLOY_IMAGE_TAG",
  "GROUNDX_DEPLOY_NAMESPACE",
  "GROUNDX_DEPLOY_RELEASE_NAME",
]) {
  assert(workflow.includes(`printf '${key}=%s\\n'`), `workflow must write ${key} into middleware runtime env`);
}
assert(workflow.includes("append_optional_env 'GROUNDX_DEPLOY_PUBLIC_HOST'"), "workflow must write public host provenance when present");
assert(workflow.includes("${{ steps.deploy-vars.outputs.frontend_repo }}:${{ steps.deploy-vars.outputs.image_tag }}"), "frontend build must push the per-env image tag");
assert(workflow.includes("${{ steps.deploy-vars.outputs.middleware_repo }}:${{ steps.deploy-vars.outputs.image_tag }}"), "middleware build must push the per-env image tag");

// With a stable per-env tag (instead of per-commit immutable), k8s won't
// know to re-pull unless pullPolicy is Always. Pin it in values.yaml.
const valuesYaml = read("deploy/helm/groundx-web-ui/values.yaml");
assert(/pullPolicy:\s*Always/.test(valuesYaml), "frontend/middleware pullPolicy must be Always so a same-tag re-push gets pulled");
assert(!/pullPolicy:\s*IfNotPresent/.test(valuesYaml), "no image may use IfNotPresent — stable per-env tag requires Always");

for (const key of [
  "LOG_LEVEL",
  "GROUNDX_SAMPLES_BUCKET_ID",
  "BYO_PAGES_LIMIT",
  "RATE_LIMIT_AUTH_PER_MIN",
  "RATE_LIMIT_API_PER_MIN",
  "RATE_LIMIT_LLM_PER_MIN",
  "METRICS_ENABLED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_SERVICE_NAME",
  "POSTHOG_HOST",
  "SSO_ENABLED",
  "DISABLE_AGENT_TURN_LOG",
]) {
  assert(workflow.includes(`append_optional_env '${key}'`), `workflow must forward optional v2 middleware variable ${key}`);
}

for (const key of ["POSTHOG_API_KEY", "SENTRY_DSN"]) {
  assert(workflow.includes(`${key}: \${{ secrets.${key} }}`), `workflow must source ${key} from GitHub environment secrets`);
  assert(workflow.includes(`append_optional_env '${key}'`), `workflow must forward optional v2 middleware secret ${key}`);
}

const dispatchInputs = workflow.match(/workflow_dispatch:\n    inputs:\n(?<body>[\s\S]*?)\n\npermissions:/)?.groups?.body ?? "";
const dispatchInputNames = [...dispatchInputs.matchAll(/^ {6}([A-Za-z0-9_]+):/gm)].map((match) => match[1]);
const forbiddenInputNames = dispatchInputNames.filter((name) => {
  if (/SecretName$/.test(name)) return false;
  return /(password|token|credential|kube|config)/i.test(name);
});
assert(forbiddenInputNames.length === 0, `workflow_dispatch inputs must not accept secret values: ${forbiddenInputNames.join(", ")}`);

// The manual-run form must stay short. Cluster/Ingress/image-repo overrides
// belong in org variables and secrets, not on every dispatch. Only the
// genuinely per-run choices live here.
// `environment` is the one input a human operator cares about. The
// other three are harness-plumbing passthroughs: the `publish` MCP tool
// always passes them, so the workflow has to accept them, but the
// workflow body ignores them. They show up at the bottom of the manual
// dispatch form — leave blank when running manually; GitHub uses the
// "Use workflow from" picker for the ref.
const allowedDispatchInputs = new Set([
  "environment", // dev | prod  (only field humans fill in)
  "projectId",   // harness passthrough — workspace project id
  "branch",      // harness passthrough — workspace runner ref
  "commitSha",   // harness passthrough — workspace runner commit
]);
const actualDispatchInputs = new Set(dispatchInputNames);
const unexpectedInputs = [...actualDispatchInputs].filter((n) => !allowedDispatchInputs.has(n));
const missingInputs = [...allowedDispatchInputs].filter((n) => !actualDispatchInputs.has(n));
assert(
  unexpectedInputs.length === 0 && missingInputs.length === 0,
  `workflow_dispatch input set drifted — unexpected: [${unexpectedInputs.join(", ")}], missing: [${missingInputs.join(", ")}]`,
);

// Ops-side helper workflows for log inspection and teardown. They share
// the same per-env EKS targeting pattern as deploy.yml so an operator
// can run them from the Actions tab without needing a local kubeconfig.
for (const name of ["diagnose", "uninstall"]) {
  const path = `.github/workflows/${name}.yml`;
  const wf = read(path);
  assert(wf.includes("workflow_dispatch:"), `${name} must be manually triggerable`);
  assert(/EKS_CLUSTER_NAME_DEV/.test(wf), `${name} must source dev cluster from EKS_CLUSTER_NAME_DEV`);
  assert(/EKS_CLUSTER_NAME_PROD/.test(wf), `${name} must source prod cluster from EKS_CLUSTER_NAME_PROD`);
  assert(wf.includes("aws eks update-kubeconfig"), `${name} must generate kubeconfig dynamically`);
}
const diagnoseWf = read(".github/workflows/diagnose.yml");
assert(diagnoseWf.includes("kubectl logs"), "diagnose must tail pod logs");
assert(diagnoseWf.includes("kubectl describe"), "diagnose must describe pods");
assert(/--previous/.test(diagnoseWf), "diagnose must also pull previous-container logs (for crash loops)");
const uninstallWf = read(".github/workflows/uninstall.yml");
assert(uninstallWf.includes("helm uninstall"), "uninstall must run helm uninstall");
assert(uninstallWf.includes("Delete release-owned leftovers"), "uninstall must fall back to deleting release-owned Kubernetes resources");
assert(uninstallWf.includes('selector="app.kubernetes.io/instance=$rel"'), "uninstall fallback must scope cleanup to the Helm release label");
assert(
  uninstallWf.includes('kubectl -n "$ns" delete deployment,replicaset,pod,service,ingress,configmap,horizontalpodautoscaler,job,cronjob -l "$selector"'),
  "uninstall fallback must delete common release-scoped resources when Helm leaves leftovers",
);
assert(/inputs\.confirm/.test(uninstallWf), "uninstall must require explicit confirmation input");
assert(!/deleteNamespace/.test(uninstallWf), "uninstall must not expose namespace deletion");
assert(!/kubectl delete namespace/.test(uninstallWf), "uninstall must not delete namespaces");

if (commandExists("helm")) {
  execFileSync("helm", ["lint", "deploy/helm/groundx-web-ui"], { cwd: root, stdio: "inherit" });

  const devTemplate = execFileSync(
    "helm",
    [
      "template",
      "groundx-web-ui",
      "deploy/helm/groundx-web-ui",
      "--namespace",
      "gx-dev",
      "--set-string",
      "environment=dev",
      "--set-string",
      "publicAccess=none",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert(countRenderedKinds(devTemplate, "Ingress") === 0, "internal-only mode must render no Ingress");
  assert(countRenderedKinds(devTemplate, "Namespace") === 0, "default Helm render must leave namespace creation to the workflow");
  assert(/name:\s*groundx-web-ui-middleware[\s\S]*type:\s*ClusterIP/.test(devTemplate), "rendered middleware Service must be ClusterIP");

  const prodTemplate = execFileSync(
    "helm",
    [
      "template",
      "groundx-web-ui",
      "deploy/helm/groundx-web-ui",
      "--namespace",
      "gx-prod",
      "--set-string",
      "environment=prod",
      "--set-string",
      "publicAccess=ingress",
      "--set-string",
      "publicHost=ui.example.com",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert(countRenderedKinds(prodTemplate, "Ingress") === 1, "public mode must render exactly one frontend Ingress");
  assert(/kind:\s*Ingress[\s\S]*name:\s*groundx-web-ui-frontend/.test(prodTemplate), "Ingress must target the frontend only");
  assert(!prodTemplate.includes("alb.ingress.kubernetes.io"), "generic Ingress render must not include ALB annotations by default");

  const multiHostTemplate = execFileSync(
    "helm",
    [
      "template",
      "groundx-web-ui",
      "deploy/helm/groundx-web-ui",
      "--namespace",
      "gx-prod",
      "--set-string",
      "environment=prod",
      "--set-string",
      "publicAccess=ingress",
      "--set-string",
      "publicHost=workspace-app.groundx.ai",
      "--set-literal",
      "publicHosts=dev.studio.groundx.ai,studio.groundx.ai",
      "--set-string",
      "tlsSecretName=wildcard-studio-groundx-ai",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert(/host:\s*["']?workspace-app\.groundx\.ai["']?/.test(multiHostTemplate), "multi-host render must keep the primary public host");
  assert(/host:\s*["']?dev\.studio\.groundx\.ai["']?/.test(multiHostTemplate), "multi-host render must include the dev studio alias");
  assert(/host:\s*["']?studio\.groundx\.ai["']?/.test(multiHostTemplate), "multi-host render must include the prod studio alias");
  assert(/hosts:\s*\n\s*-\s*["']?workspace-app\.groundx\.ai["']?\s*\n\s*-\s*["']?dev\.studio\.groundx\.ai["']?\s*\n\s*-\s*["']?studio\.groundx\.ai["']?/.test(multiHostTemplate), "TLS hosts must cover the primary host and aliases");

  const genericIngressTemplate = execFileSync(
    "helm",
    [
      "template",
      "groundx-web-ui",
      "deploy/helm/groundx-web-ui",
      "--namespace",
      "gx-onprem",
      "--set-string",
      "environment=prod",
      "--set-string",
      "publicAccess=ingress",
      "--set-string",
      "publicHost=ui.groundx.ai",
      "--set-string",
      "ingressClassName=nginx",
      "--set-string",
      "tlsSecretName=wildcard-groundx-ai",
      "--set-json",
      'ingressAnnotations={"cert-manager.io/cluster-issuer":"letsencrypt-prod","nginx.ingress.kubernetes.io/proxy-body-size":"50m"}',
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert(/ingressClassName:\s*nginx/.test(genericIngressTemplate), "generic render must support non-ALB IngressClass names");
  assert(/cert-manager\.io\/cluster-issuer:\s*letsencrypt-prod/.test(genericIngressTemplate), "generic render must pass through cert-manager annotations");
  assert(/nginx\.ingress\.kubernetes\.io\/proxy-body-size:\s*50m/.test(genericIngressTemplate), "generic render must pass through nginx annotations");
  assert(/secretName:\s*wildcard-groundx-ai/.test(genericIngressTemplate), "generic render must support Kubernetes TLS secrets");
  assert(!genericIngressTemplate.includes("alb.ingress.kubernetes.io"), "generic non-ALB render must not include AWS ALB annotations");

  const albTemplate = execFileSync(
    "helm",
    [
      "template",
      "groundx-web-ui",
      "deploy/helm/groundx-web-ui",
      "--namespace",
      "gx-prod",
      "--set-string",
      "environment=prod",
      "--set-string",
      "publicAccess=ingress",
      "--set-string",
      "publicHost=ui.groundx.ai",
      "--set-string",
      "ingressClassName=alb",
      "--set-string",
      "acmCertificateArn=arn:aws:acm:us-west-2:123456789012:certificate/example",
      "--set-string",
      "albGroupName=groundx-studio",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert(/ingressClassName:\s*alb/.test(albTemplate), "ALB render must set the IngressClass");
  assert(/alb\.ingress\.kubernetes\.io\/certificate-arn:\s*["']?arn:aws:acm:us-west-2:123456789012:certificate\/example["']?/.test(albTemplate), "ALB render must set the ACM certificate ARN");
  assert(/alb\.ingress\.kubernetes\.io\/group\.name:\s*["']?groundx-studio["']?/.test(albTemplate), "ALB render must join the shared ALB group");
  assert(/alb\.ingress\.kubernetes\.io\/scheme:\s*["']?internet-facing["']?/.test(albTemplate), "ALB render must default to an internet-facing ALB");
  assert(/alb\.ingress\.kubernetes\.io\/target-type:\s*["']?ip["']?/.test(albTemplate), "ALB render must target pod IPs behind ClusterIP services");
  assert(/alb\.ingress\.kubernetes\.io\/ssl-redirect:\s*["']?443["']?/.test(albTemplate), "ALB render must redirect HTTP to HTTPS when using ACM");

  const namespaceTemplate = execFileSync(
    "helm",
    [
      "template",
      "groundx-web-ui",
      "deploy/helm/groundx-web-ui",
      "--namespace",
      "gx-managed",
      "--set",
      "namespace.create=true",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert(countRenderedKinds(namespaceTemplate, "Namespace") === 1, "chart must support opt-in Namespace rendering");
} else {
  console.warn("helm not found; static deploy asset checks passed, Helm render checks skipped locally");
}
