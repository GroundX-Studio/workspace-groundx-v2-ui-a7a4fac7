# Workspace Deployment Operations Plan

Canonical OpenSpec change:
`/Users/benjaminfletcher/git/groundx-studio-harness/openspec/changes/add-workspace-deploy-ops-endpoints/`.
Implementation checklist:
`/Users/benjaminfletcher/git/groundx-studio-harness/openspec/changes/add-workspace-deploy-ops-endpoints/execution-plan.md`.

## Scaffold Scope

The scaffold remains a managed project template. It should not own the public workspace
API, but its workflows may need to emit structured evidence for the runner's deployment
operations.

## Workflow Updates To Evaluate

- Keep `.github/workflows/deploy.yml`, `diagnose.yml`, and `uninstall.yml` backward
  compatible with the current runner diagnostics endpoints.
- The deploy workflow injects non-secret provenance into the middleware runtime env, and
  `/api/healthz` exposes it when present: commit SHA, image tag, environment, namespace,
  release name, and public host.
- Extend `diagnose.yml` only if the runner cannot collect required evidence directly
  from GitHub, deploy environment variables, scaffold health provenance, and public
  health checks.
- Prefer structured JSON artifacts for workflow-derived evidence, including workflow
  run, branch, commit SHA, image tag, Helm release, namespace, ingress host, and public
  health result.
- Do not add secrets or raw kubeconfig output to workflow artifacts.
- Do not add destructive remediation workflows unless the runner calls them through an
  allowlisted, confirmed, audited repair action.
- Use the managed deployment teardown endpoint for release removal. `uninstall.yml`
  remains the Helm fallback and deletes only release-labeled leftovers; namespaces are
  pre-created deployment configuration and are never deleted by the scaffold teardown
  path.
- Preserve enough build metadata for freshness checks through `/api/healthz`. If a
  deployed app lacks commit/image provenance, the API must report freshness as `unknown`
  rather than infer it from HTTP 200.

## Validation Expectations

- Existing deploy and diagnose workflows continue to dispatch with the current inputs.
- New health metadata and structured diagnostic output are fixture-tested or
  schema-checked.
- Managed project agents use deployment status/public-health/diagnostics/retry/repair/
  teardown endpoints first and keep diagnose/uninstall paths as lower-level fallbacks.
- Each workflow change is reviewed adversarially for template safety across projects,
  namespaces, hosts, and ALB groups.
