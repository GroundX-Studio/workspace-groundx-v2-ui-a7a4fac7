## Goals / Non-Goals

**Goals:**
- Make the middleware image's Node version explicit: `node:22.23.4-alpine` in both stages.
- Make deploy builds ask for a fresh base (`pull: true`) so a stale cached base cannot be reused.

**Non-Goals:**
- Patching any deployed digest. Old images stay until a new build is deployed by hand (see the workspace change's `runbook.md`).
- Changing `Dockerfile.frontend`, `package.json` engines, CI `node-version`, `scripts/test-deploy-assets.mjs`, or adding a CI guard.
- Managed-database CA or secret behavior (AGE-361).

## Decisions

Source of truth: `Dockerfile.middleware` and `.github/workflows/deploy.yml` in this repo. The scaffold's `Dockerfile.middleware` mirrors the Dockerfile and is changed in its own repo, not here.

- **Pin the exact patch tag, not a digest.** A fixed tag is readable and matches the ticket ("22.23.4 or a newer verified fixed release"). A digest pin would need a bump process this change does not add. The tag is assumed to exist; the first build confirms it.
- **Add `pull: true` to both build steps, keep `no-cache: true`.** `no-cache` only turns off layer reuse; it does not force a fresh base. `pull: true` does. The frontend step gets it too so both images follow the same rule, even though only the middleware Dockerfile is pinned.
- **No new test.** Acceptance is the one-off `check:` commands in `tasks.md`. The change is two literal edits, so a permanent guard would cost more than it protects, and the ticket scope excludes one.

Drift-prevention: none added. The commands in `tasks.md` prove the requirements hold.

## Risks / Trade-offs

- Tag `node:22.23.4-alpine` does not exist on the registry -> the first build fails loudly; pick the next verified fixed 22.x tag and re-run.
- `pull: true` adds a registry pull to each build -> small cost; accepted for the security goal.
- Merge deploys nothing: the push trigger watches `main`, the deployed line is `workspace/groundx-v2-ui` -> rollout is a manual dispatch on that ref.

## Migration Plan

Merge to `workspace/groundx-v2-ui`, then run the deploy workflow by manual dispatch on that ref. Roll back by re-deploying the previous known-good image digest.
