## 1. Middleware image pin

- [ ] 1.1 Change both `FROM node:22-alpine` lines in `Dockerfile.middleware` (lines 3 and 20) to `node:22.23.4-alpine`
  check: test "$(grep -c '^FROM node:22\.23\.4-alpine AS ' Dockerfile.middleware)" = 2
- [ ] 1.2 Confirm no floating `node:22-alpine` remains in `Dockerfile.middleware`
  check: ! grep -q 'node:22-alpine' Dockerfile.middleware

## 2. Deploy workflow

- [ ] 2.1 Add `pull: true` to the frontend and middleware `docker/build-push-action` steps in `.github/workflows/deploy.yml`, keeping `no-cache: true`
  check: node -e "const s=require('fs').readFileSync('.github/workflows/deploy.yml','utf8');const b=s.split(/\n\s+- name: /).filter(x=>x.includes('docker/build-push-action'));process.exit(b.length===2&&b.every(x=>/^\s*pull: true\s*$/m.test(x)&&/^\s*no-cache: true\s*$/m.test(x))?0:1)"

## 3. Closure

- [ ] 3.1 Cross-check that only the two intended files changed (no edits to `Dockerfile.frontend`, `package.json`, CI `node-version`, `scripts/test-deploy-assets.mjs`; no new test or guard)
  check: test "$(git diff --name-only origin/workspace/groundx-v2-ui -- . ':!openspec' | sort | paste -sd, -)" = ".github/workflows/deploy.yml,Dockerfile.middleware"
- [ ] 3.2 Dead-reference cross-check: no other file builds the middleware image from the floating tag
  check: ! grep -rl 'node:22-alpine' --include='Dockerfile.middleware' --include='*.yml' --include='*.yaml' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=openspec .

No UI, component stories or manual QA path apply: this change touches build files only. No test runner is added or changed.

See workspace `openspec/changes/age-394-groundx-studio-patch-node-in-24-deployed-middleware-images/tasks.md` for cross-service coordination and deferred items (rollout, canary, scaffold and other project repos).
