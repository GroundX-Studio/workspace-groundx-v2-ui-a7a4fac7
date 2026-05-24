# Gotchas

Mistakes already made on this project. Don't repeat them.

## Security

### `*username` fields from Partner API can be the API key

The Partner API returns the API key value in `customerUsername`,
`partnerUsername`, `requestUsername` fields — fields that *look*
like identifiers but contain the secret. **Treat every `*username`
field from a Partner API response as if it might be a secret.**
Never copy it into a committed file.

This caused a real leak on 2026-05-23 — the key landed in
`.groundx-studio.json` as the `createdByPartner` field. The
follow-up "redaction" commit did NOT fix it; the secret was in
git history at the original commit hash. The only real fix is
**rotating the key**.

### `.mcp.json` is gitignored

It carries the Partner API key for the local MCP server. Don't
`git add .mcp.json` and don't `git add -A` blindly — always
stage specific files by name.

### Two Partner API keys — pick the right one for the MCP

`GROUNDX_PARTNER_API_KEY` in `scaffold/.env.local` is the **runtime**
key (for the middleware's calls to `api.groundx.ai`). The
`mcp__groundx-studio__*` tools (`commit_push`, `publish`,
`git_session`, etc.) need a **different** workspace-owner Partner key
— same UUID shape, different account. Using the runtime key on the
MCP returns `403 workspace ownership context does not match caller`,
which sounds like an ACL bug but is just the wrong key.

The harness key isn't on disk. After a session compact, recover it
with:

```bash
grep -aoE '"PARTNER_API_KEY":"[^"]{30,50}"' \
  ~/.claude/projects/-Users-benjaminfletcher-git-groundx-v2-ui/*.jsonl \
  | sort -u
```

The value that's NOT in `.env.local` is the harness one. Full
explanation in `docs/agents/mcp-tools.md` → "Where `PARTNER_API_KEY`
lives".

### Conversation transcripts ≠ committed files

The TDD-and-never-commit-secrets rule applies to **committed**
files. A tool-call argument that takes a secret value as a
parameter is OK (transcripts aren't committed). A literal value
in a `Write` call to a path that's not gitignored is NOT OK.

## Deploy / Kubernetes

### Frontend Service shows `EXTERNAL-IP: <none>` and that's correct

AWS ALB Ingress with `target-type=ip` points the ALB directly at
pod IPs, leaving the Service as ClusterIP. The public surface is
the Ingress, not the Service. **Always run `kubectl get ingress`
to find the ALB DNS** — `kubectl get svc` will mislead you.

### `Accessing resource attributes before async attributes settled`

Spammed by the **ADOT auto-instrumentation init container**, not
our code. Benign — fires while ADOT's resource detection is
still async. Suppress with `OTEL_LOG_LEVEL=error` env var if it
becomes painful.

### `/api/healthz` flooding logs

Kube probes fire every ~3s. We suppress them in pino-http via
`shouldSkipRequestLog`. If you add a new always-on endpoint
(e.g. Prometheus subroute), extend that helper.

### GitHub Actions vars precedence

Env > Repository > Org. If you set the same key at multiple
scopes, env wins. `deploy_config` writes at env scope, which
shadows org-level defaults. Usually what you want — but watch
out if you're debugging why an org-level value isn't reaching
the workflow.

### Workflow file pushes need `workflows` scope

The GitHub App backing the git-session token must have
`workflows: Read and write` permission for any commit that
touches `.github/workflows/*`. If it doesn't, you get:

```
refusing to allow a GitHub App to create or update workflow
.github/workflows/deploy.yml without 'workflows' permission
```

Fixed at the App level once; should not recur. If it does,
either get the App perm updated, push manually with a PAT, or
land the workflow change via the GitHub web UI.

### EKS 4-layer IAM gate

See `deploy.md` § IAM. The trap is layer 4 (aws-auth ConfigMap):
the error message looks like a kubeconfig problem but is
actually K8s RBAC.

### Image tag is reused per env

Same tag on every push to `dev`. K8s would NOT re-pull under
the default `imagePullPolicy: IfNotPresent`. We pin
`imagePullPolicy: Always` in `values.yaml` — don't change that
without also changing the tag scheme.

## Frontend

### React Hooks rules survive view-conditional returns

`ExtractView` for example must run every hook BEFORE the
"scenario has no schema" return. Otherwise the hook order
diverges when the scenario flips and React crashes. When adding
state to a conditionally-rendered view, hoist the `useState` /
`useEffect` above any early return.

### Framer Motion `useReducedMotion()` returns true in jsdom

jsdom has no `matchMedia`, so anything Motion-driven looks
"reduced motion: on" in tests. Mock it to `false` for timing
tests; leave default for tests that should assert the reduced-
motion path.

### URL is the source of truth for which surface mounts

Don't call `advanceFrame(frame)` from a view and expect the URL
to update — `advanceFrame` flips the session state but doesn't
navigate. Use `navigate(...)` for surface changes that should
be linkable / refreshable.

### `EntityRegistry` is a derived facade — don't add state to it

The actual entity state lives in `ChatStore.activeSession.entities`.
`useEntityRegistry()` is a thin read-mostly view. Mutations go
through ChatStore. If you find yourself reaching for
EntityRegistryProvider state, look at ChatStoreContext instead.

### `signupOpen` vs `gate.status === "open"`

`signupOpen` flips when the URL is `/onboarding/signup`. `gate.status`
flips on `openGate(trigger)` (any trigger). They're related but
not the same. F2 BYO from F1's Sign-Up tile sets both. F5 "Save"
button sets only `gate.status`.

### `OnboardingChatColumn` dispatch order matters

Gate-active branch must come first. If you add a new dispatch
case, put it after gate-active and before `isF2 && scenario`.

## Middleware

### `APP_REPOSITORY_MODE=memory` skips MySQL entirely

Even with `MYSQL_HOST` etc. in the env, the middleware reads
them but never opens a connection. To actually exercise the
SQL impl, set `APP_REPOSITORY_MODE=mysql`.

### `MOCK_MODE=true` swaps every upstream client for a Fake

Affects Partner / GroundX / LLM clients. The fake clients
return canned responses + record their calls. Useful in dev;
asserts in tests rely on the fake recordings.

### `requireAuthenticatedUser` returns 401 with `code: ANONYMOUS_SESSION`

Stable contract that the F6 gate UI keys off. If you change the
error code or response shape, the gate trigger flow breaks.

### CSP allowlist is dynamic

Built at app-create-time based on env vars (POSTHOG_API_KEY,
SENTRY_DSN, GA_MEASUREMENT_ID, HOTJAR_SITE_ID). Don't hardcode
external origins into the static helmet config — extend the
builder pattern in `app.ts`.

## Tests

### `vi.advanceTimersByTime(20000)` doesn't chain setTimeouts

Walk forward in chunks the size of the production interval so
React commits each render between fires. See `testing.md`
§ Timer + animation tests.

### `renderWithOnboardingProviders` derives a URL from `initialScenario`

If you pass `initialScenario: "utility"` and DON'T pass
`initialUrl`, the harness mounts at
`/onboarding/<bucketId>/utility`. The URL ↔ state useEffect
inside OnboardingShell sees this and keeps the scenario active.
Pass `initialUrl: "/onboarding"` explicitly if you want the F1
URL.

### MCP `publish` operation succeeds when dispatched, not when deployed

`publish` returns `{ status: "succeeded" }` as soon as the
workflow is dispatched. The actual deploy success or failure
is in the GitHub Actions run log. Don't infer deploy success
from a successful `publish` operation.

## Memory + spec

### The user's `~/.claude/...` memory is THEIR memory

When working as another agent, you don't have access to that.
Any important rule from there needs to live in `docs/agents/` so
you can see it. AGENTS.md is the table of contents into that.

### The design bundle path may not exist on a fresh machine

`/tmp/design-bundle/v2-dashboard-chat-driven-ui/` gets cleared
on reboot. Re-fetch via the curl command in
`design-bundle.md`.
