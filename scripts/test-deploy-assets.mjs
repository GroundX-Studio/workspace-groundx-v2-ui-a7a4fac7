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
assert(workflow.includes("channel_tag=\"$repo_tag\""), "prod deploys must publish a stable repo-name channel tag");
assert(workflow.includes('channel_tag="${repo_tag}-${DEPLOY_ENVIRONMENT}"'), "dev deploys must publish a stable repo-name-dev channel tag");
assert(workflow.includes('namespace="${K8S_NAMESPACE_INPUT:-${repo_k8s_name}-${DEPLOY_ENVIRONMENT}}"'), "default namespace must be repo/environment scoped");
assert(workflow.includes('release_name="$(slugify_k8s_name "${HELM_RELEASE_NAME_INPUT:-${repo_k8s_name}-${DEPLOY_ENVIRONMENT}}")"'), "default Helm release name must be repo/environment scoped");
assert(workflow.includes('middleware_secret_name="$(slugify_k8s_name "${MIDDLEWARE_SECRET_NAME_INPUT:-${release_name}-middleware}")"'), "default middleware secret name must be release scoped");
assert(workflow.includes('public_host="${repo_k8s_name}.${public_domain}"'), "prod public host must default to repo-name.public-domain");
assert(workflow.includes('public_host="${repo_k8s_name}-${DEPLOY_ENVIRONMENT}.${public_domain}"'), "non-prod public host must default to repo-name-environment.public-domain");
assert(workflow.includes('helm upgrade --install "${{ steps.deploy-vars.outputs.release_name }}"'), "Helm release must not be fixed across scaffold repos");
assert(workflow.includes('--set-string middleware.existingSecret="${{ steps.deploy-vars.outputs.middleware_secret_name }}"'), "Helm must use the computed middleware secret name");
assert(workflow.includes('--set-string publicHost="${{ steps.deploy-vars.outputs.public_host }}"'), "Helm must use the computed public host");
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
assert(workflow.includes("vars.ACM_CERTIFICATE_ARN"), "workflow must allow ALB ACM certificate ARN from org variables");
assert(workflow.includes("vars.ALB_GROUP_NAME"), "workflow must allow ALB group name from org variables");
assert(workflow.includes("vars.INGRESS_ANNOTATIONS_JSON"), "workflow must allow generic ingress annotations from org variables");
assert(workflow.includes("MYSQL_PASSWORD: ${{ secrets.MYSQL_PASSWORD }}"), "workflow must source MYSQL_PASSWORD from GitHub secrets");
assert(workflow.includes("aws-actions/amazon-ecr-login@v2"), "workflow must support Amazon ECR Public login");
assert(workflow.includes("registry-type: public"), "workflow must use public ECR registry mode");
assert(workflow.includes("ECR_AWS_REGION:"), "workflow must use the ECR-specific AWS region setting");
assert(workflow.includes("aws-region: ${{ env.ECR_AWS_REGION }}"), "ECR auth must use ECR_AWS_REGION");
assert(!/^\s+AWS_REGION:/m.test(workflow), "workflow must not use ambiguous AWS_REGION for ECR auth");
assert(workflow.includes("kubectl -n \"$K8S_NAMESPACE\" get secret \"$MIDDLEWARE_SECRET_NAME\" -o jsonpath='{.data.SESSION_SECRET}'"), "workflow must preserve existing SESSION_SECRET");
assert(workflow.includes("openssl rand -base64 48"), "workflow must generate SESSION_SECRET on first deploy");
assert(workflow.includes("${{ steps.deploy-vars.outputs.frontend_repo }}:${{ steps.deploy-vars.outputs.channel_tag }}"), "frontend build must push the channel tag");
assert(workflow.includes("${{ steps.deploy-vars.outputs.middleware_repo }}:${{ steps.deploy-vars.outputs.channel_tag }}"), "middleware build must push the channel tag");

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
const allowedDispatchInputs = new Set([
  "environment", // dev | prod
  "branch",      // workspace runner publish metadata (passthrough)
]);
const actualDispatchInputs = new Set(dispatchInputNames);
const unexpectedInputs = [...actualDispatchInputs].filter((n) => !allowedDispatchInputs.has(n));
const missingInputs = [...allowedDispatchInputs].filter((n) => !actualDispatchInputs.has(n));
assert(
  unexpectedInputs.length === 0 && missingInputs.length === 0,
  `workflow_dispatch input set drifted — unexpected: [${unexpectedInputs.join(", ")}], missing: [${missingInputs.join(", ")}]`,
);

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
