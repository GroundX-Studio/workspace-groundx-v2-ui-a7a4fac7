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

### Partner API key — `.env.local` is the persistence (for now)

Mental model: **one Partner API key per user.** On this project the
harness MCP's `PARTNER_API_KEY` value lives in `scaffold/.env.local`
→ `GROUNDX_PARTNER_API_KEY` (mirrored in
`scaffold/middleware/.env.local`, both gitignored). Read it for an
MCP arg:

```bash
grep -E '^GROUNDX_PARTNER_API_KEY=' \
  "$(git rev-parse --show-toplevel)/scaffold/.env.local" \
  | cut -d= -f2-
```

**`.env.local` is the wrong long-term home for this value** — it
mixes the harness control-plane secret with app runtime env, every
spawned process can read it, and `setup_env` will eventually clobber
it on the next template regen. The cleaner shape is a dedicated
mode-0600 dotfile (e.g. `scaffold/.harness/credentials.json`) with an
MCP discovery fallback chain. See `docs/agents/mcp-tools.md` → "Where
`PARTNER_API_KEY` lives" for the full critique.

If the key is wrong (rotated, expired, mis-pasted), the MCP returns
`403 workspace ownership context does not match caller` — that's the
wrong-key signal, not an ACL bug. First hypothesis on that error
should be "my key is wrong," not "my access was revoked."

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

### Node 24/25 Web Storage shadows jsdom's in tests

Node 24+ ships a built-in global `localStorage`/`sessionStorage`. With
no `--localstorage-file` it overrides jsdom's working Storage with a
stub whose `clear`/`setItem` are undefined, so the `beforeEach`
`localStorage.clear()` throws and the whole app suite goes red — even
though `engines` is `>=20`. `app/src/test/setup.ts` installs an
in-memory Storage when the active one is non-functional (a no-op on
CI's older Node, which has no such global). One residual: jsdom's
`StorageEvent` `storageArea` webidl check rejects the stand-in, so the
ChatStore cross-tab-StorageEvent test stays red on Node 24/25 — run on
the CI Node, or upgrade jsdom (24→29).

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

### `ChatColumn` dispatch order matters

Gate-active branch must come first. If you add a new dispatch
case, put it after gate-active and before `isF2 && scenario`.

## Middleware

### `APP_REPOSITORY_MODE=memory` skips MySQL entirely

Even with `MYSQL_HOST` etc. in the env, the middleware reads
them but never opens a connection. To actually exercise the
SQL impl, set `APP_REPOSITORY_MODE=mysql`.

### No mock mode — the runtime always uses the real clients

There is NO `MOCK_MODE` env flag and no `Dev*` client classes
(retired 2026-06-01-retire-mock-mode). The middleware always
constructs the real `Fetch*` Partner / GroundX / LLM clients in
every environment. Deterministic behavior in TESTS comes from
`Fake*` clients (or real-shaped fixtures) INJECTED at the
dependency seam — that is the legitimate test-double seam, not a
runtime mode. A drift guard
(`services/noMockMode.drift.test.ts`) fails if `MOCK_MODE`, a
`Dev*` client, `chatMocks`, or a `mockMode` deps field
reappears in runtime code.

### e2e + the local onboarding flow need the real GroundX Partner key

A corollary of "no mock mode": with only the placeholder key in
`.env.local`, `/api/scenarios` returns `[]` (the seeded samples bucket
isn't visible to the key's account), so the F1 picker is empty and
every onboarding e2e times out waiting for `getByTestId('sample-utility')`.
Local onboarding dev + e2e require the real GroundX-Studio Partner key
(via the `setup_env` MCP tool or the CI secret) — a regular GroundX API
key for a different account authenticates fine but won't load the
seeded samples.

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

### The design bundle moved into the repo (was `/tmp/design-bundle/`)

The wireframes used to live at `/tmp/design-bundle/v2-dashboard-chat-driven-ui/`
fetched via curl from an Anthropic Artifacts URL. That path was fragile
(wiped on reboot; curl URL scoped to the original chat). The bundle now
ships in-repo at `openspec/wireframes/`. No fetch needed.

Old docs / commit messages may still reference the `/tmp/` path — translate
mentally to `openspec/wireframes/source/`.

## GroundX data API / MCP

### Large `getxray` / `search` MCP outputs save to a tool-result file — verify it's the right doc

`document_getxray` and `search_content` responses (~200KB+) exceed the inline token limit and get
written to a tool-result file. Two large calls back-to-back can land the SAME bytes in both files
(the second file captured the first's content). This is a **file-save artifact, not an MCP caching
bug** — a fresh call returns correct per-`documentId` data. Always `jq` the saved file's `fileName`
/`sourceUrl` and confirm they match the doc you asked for. For X-Ray, prefer fetching the public
`xrayUrl` (from `document_get`) directly — no API key needed.

### Don't re-query an unfamiliar documentId to "verify" it

If a search surfaces a documentId you don't recognize, treat it as suspect data. Calling
`document_get`/`getxray` with that id just echoes it back (you asked for it) — it proves nothing and
re-surfaces the bad id. Inspect the legitimate **bucket** instead (`search_content(bucketId)`) and
flag the anomaly. (A stray duplicate ingest once shadowed the real sample doc in bucket 28454's
search ranking; the fix was deleting it server-side, not re-querying it.)

### `bucket_get` can 403/400 "no access" for a real bucket

Under a partner/cross-customer credential context, `bucket_get(id)` may deny even when the bucket
exists and is searchable. Infer bucket existence from `document_get(...).bucketId`, not `bucket_get`.

### Search results carry citation geometry directly (read it off the result)

For layout-ingested docs, `search_content`/`search_documents` results carry `boundingBoxes` +
`pages` + `searchData` (verbosity 2). Read citation page+bbox off the result; the X-Ray join is the
fallback for docs that lack it. The chatRouter mapper bug (reads a nonexistent top-level
`r.pageNumber`, drops `boundingBoxes`/`pages`) is what WF-03 fixes. Full shape in
`groundx-real-api-shapes.md`.

### MCP `document_getextract` MATCHES the middleware `get_extract` — beware stale tool-result files

**Locked 2026-05-29 after a multi-hour false "schema mismatch" chase.** For doc `c3bfff49`, the MCP
`document_getextract` and the app's middleware `GET /v1/ingest/document/extract/{id}` return the
**SAME** shape — `addressee`/`balance_payable`/`line_amount`/`meter_id` (matching workflow
`9910308e`); NO `amount_due`/`recipient_name`. There is **no vocab discrepancy**. The phantom
`amount_due`/`recipient_name` shape that triggered the chase was a **stale / cross-contaminated MCP
tool-result file-save artifact** (a large output whose result file picked up a prior call's bytes —
same artifact class as the getxray file collision). **Always confirm a large MCP result's content
matches the requested id before trusting it; re-call if in doubt.** F3 schema(workflow)+values
(get_extract) match and populate live (`addressee="KWIK TRIP (1147)"`, `balance_payable=7613.2`).

### Workflow id ≠ document id (the extract endpoint 406s on a workflow id)

`9910308e-…` is a WORKFLOW id, not a document id. Passing it (or its short prefix `9910308e`) to
`/v1/ingest/document/extract/{id}` returns **406 invalid documentId**. Never feed a workflow id to a
document endpoint — that was a contributor to the phantom-mismatch confusion.

### Canonical REST path for get_extract / get_xray (harness doc corrected 2026-05-29)

`/v1/ingest/document/extract/{documentId}` and `/v1/ingest/document/xray/{documentId}`. A stale
harness doc previously pointed agents at the wrong path; the source + generated plugin mirrors were
fixed.

### `document.extracted` is a format flag, not a workflow-run signal

`document_get(...).extracted` indicates whether the doc was extracted from an Office archive
(docx/pptx/xlsx), NOT whether a workflow extraction ran. A native PDF shows `extracted: false` even
when fully processed (`status: complete`, `processLevel: full`) and a workflow extraction exists.
Don't infer "workflow never ran" from `extracted: false`.
