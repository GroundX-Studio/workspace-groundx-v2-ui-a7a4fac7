# MCP Tool Surface

The `groundx-studio` MCP server is the agent path for managed-project
operations. Reaching for the equivalent shell command directly
(`git push`, `gh workflow run`, etc.) is the wrong instinct — it
bypasses the session credentials + audit + the git-session token
flow.

## Tools in current use

| Tool | When | Required inputs |
|---|---|---|
| `project_create` | First-day, creating a managed project from a scaffold repo | `PARTNER_API_KEY`, project name, scaffold repo URL |
| `git_session` | Refresh short-lived git credentials for the managed repo | `PARTNER_API_KEY`, `projectId` |
| `clone_project` | First-day, cloning the managed repo into the local workspace | depends on git_session credentials |
| `setup_env` | First-day, generating `app/.env.local` + `middleware/.env.local` from Partner / LLM credentials | `PARTNER_API_KEY`, `LLM_SERVICE`, `LLM_MODEL_ID`, `LLM_API_KEY` |
| `commit_push` | After ANY local change | `cwd` (scaffold path), `message`. Optionally `PARTNER_API_KEY` to force a fresh git-session token. Stages tracked + non-ignored untracked files; commits; pushes |
| `sync_status` | Pre-flight before a push, or any time you wonder about the local state | `cwd`, `branch` (usually `workspace/<id>`) |
| `deploy_config` | Set GitHub Environment vars / secrets per environment | `PARTNER_API_KEY`, `projectId`, `environment`, `variables?`, `secrets?` |
| `deployment_status` | Read managed deployment status and evidence | `PARTNER_API_KEY`, `projectId`, `environment` |
| `deployment_public_health` | Probe public URL health and freshness metadata | `PARTNER_API_KEY`, `projectId`, `environment` |
| `deployment_diagnostics` | Queue structured deployment diagnostics | `PARTNER_API_KEY`, `projectId`, `environment` |
| `deployment_retry` | Retry the latest managed deployment | `PARTNER_API_KEY`, `projectId`, `environment`, `reason?` |
| `deployment_repair` | Queue allowlisted deployment repair | `PARTNER_API_KEY`, `projectId`, `environment`, `action`, `confirm=true`, `reason` |
| `deployment_teardown` | Tear down a managed deployment without deleting the project/repo | `PARTNER_API_KEY`, `projectId`, `environment`, `confirm="teardown"`, `reason` |
| `publish` | Trigger the deploy workflow on a chosen environment | `PARTNER_API_KEY`, `projectId`, `environment` (defaults to `dev`) |
| `operation_wait` | Poll a long-running workspace operation independently | `PARTNER_API_KEY`, `projectId`, `operationId` |

## Patterns

### Push + deploy

```text
1. commit_push   cwd=scaffold message="…"
2. publish       projectId=groundx-v2-ui environment=dev
```

`publish` returns when the workflow is dispatched, NOT when it
finishes. Watch the GitHub Actions UI or use `gh run view` from
a separate terminal for completion status.

### Update env vars / secrets

```text
deploy_config
  projectId=groundx-v2-ui
  environment=dev
  variables={"PUBLIC_ACCESS": "ingress", "APP_REPOSITORY_MODE": "mysql"}
  secrets={"MYSQL_PASSWORD": "..."}
```

Variables are non-secret values (shown in API responses); secrets
are write-only (never returned). The tool prints which keys were
upserted; values are redacted in the output.

GitHub-Actions vars precedence inside the workflow:
**Environment > Repository > Organization.** If you set the same
key at multiple scopes, the most-specific wins. `deploy_config`
writes at the **environment** scope.

### Sanity-check before push

```text
sync_status   cwd=scaffold branch=workspace/groundx-v2-ui
```

Returns `{ ahead, behind, clean, head, branchMatchesExpected }`.
Don't push from a dirty / behind tree.

## Where `PARTNER_API_KEY` lives

### Mental model

**One Partner API key per user.** Either explicitly provided (current
model) or via OAuth in the future. The harness MCP requires the key
on every call; it has no built-in persistence or discovery, so
keeping the value somewhere the agent can re-read across cold
starts / session compacts is on us.

### Current location on this project (workaround)

```
scaffold/.env.local              → GROUNDX_PARTNER_API_KEY=…
scaffold/middleware/.env.local   → GROUNDX_PARTNER_API_KEY=…
```

Both files are gitignored. Both hold the same value. Read it when you
need it for an MCP arg:

```bash
grep -E '^GROUNDX_PARTNER_API_KEY=' \
  "$(git rev-parse --show-toplevel)/scaffold/.env.local" \
  | cut -d= -f2-
```

Framework-agnostic, survives session compacts, works under Codex / CI
/ custom agents.

### What's wrong with `.env.local` as the canonical home

This is a workaround, not the right long-term shape:

1. **Mixes security domains.** The middleware loads `.env.local` via
   `dotenv` on every start. A control-plane secret (publish, deploy,
   destroy rights) sharing an env with request-time secrets means any
   middleware-side leak — debug log, crash report, telemetry, a
   dependency that serializes `process.env` — exfiltrates the harness
   key too.
2. **Visible to every spawned process.** Test runners, npm scripts,
   dev containers, dependency packages can all read
   `process.env.GROUNDX_PARTNER_API_KEY`. Privilege-escalation
   surface.
3. **Clobbered by `setup_env`.** That MCP tool regenerates
   `.env.local` from a template. If it doesn't know to preserve the
   harness value, the next run drops it.
4. **Scaffold-specific.** `.env.local` exists because this is the
   web-ui scaffold. Slides and future scaffolds may not have one.
   The harness key location should be scaffold-agnostic.
5. **No rotation story.** Every checkout, every CI secret, every
   local agent's copy has to be updated independently.
6. **OAuth-incompatible.** If/when the harness ships an OAuth
   Connector, the canonical credential lives in the OS keychain.

### The cleaner long-term shape

MCP discovery fallback chain:

```
1. PARTNER_API_KEY tool arg                          (explicit override)
2. HARNESS_PARTNER_API_KEY env var                   (CI, Codex)
3. <cwd>/.harness/credentials.json → partnerApiKey   (per-project, 0600)
4. ~/.config/groundx-studio/credentials.json         (per-user)
5. OAuth Connector token from OS keychain            (Claude clients)
```

`clone_project` + `setup_env` would write `.harness/credentials.json`
(gitignored) at project creation; the harness MCP would walk the
chain on every call, so the explicit arg becomes optional. Keeps the
harness role out of the app runtime env entirely and gives every
framework a deterministic, scaffold-agnostic location.

### Last-resort recovery (Claude Code only)

If `.env.local` is missing or its value 403s, fall back to the
transcript:

```bash
# Claude Code stores transcripts at ~/.claude/projects/<encoded-repo-path>/
# where <encoded-repo-path> is the repo's absolute path with `/` → `-`.
project_dir="$HOME/.claude/projects/$(git rev-parse --show-toplevel | sed 's|/|-|g')"
grep -aoE '"PARTNER_API_KEY":"[^"]{30,50}"' "$project_dir"/*.jsonl | sort -u
```

This only works in Claude Code (because of the JSONL transcript
format). Codex, the OpenAI Agent SDK, Cursor, Windsurf, and CI
runners can't recover this way — for them the value must be in
`.env.local`, in env vars, or re-prompted from the user.

If both `.env.local` and the transcript fail, **ask the user**.
Don't guess. Don't reuse a value from a different project — Partner
accounts are per-project.

### The misleading 403

A wrong key (rotated, expired, mis-pasted, leftover from a different
workspace) returns:

```
403 workspace ownership context does not match caller
```

This reads like an ACL/permissions problem. It's not — it's a
wrong-key signal. If you see this, the first hypothesis should be
"my key is wrong," not "my access has been revoked."

## When the MCP path doesn't work

Known failure modes:

| Symptom | Cause | Fix |
|---|---|---|
| `git push failed: refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission` | The git-session token was minted before the GitHub App got `workflows` scope. (Was a real bug on 2026-05-23; fixed same day.) | Retry — the next `commit_push` mints a fresh token |
| `Unexpected inputs provided: ["projectId", "branch", "commitSha"]` | `publish` always sends those three; the workflow rejected them as undeclared inputs | The workflow accepts them as ignored "Harness plumbing" passthroughs. If you re-trimmed them out, re-add |
| `customerUsername`, `partnerUsername`, `requestUsername` redacted in tool output | These fields can carry the API key value itself — the tool redacts them on output. **Memory rule:** treat any `*username`-named Partner API field as if it might be a secret |

## Why not just `gh` CLI?

You COULD use `gh workflow run` directly with a personal access
token, but:

- The managed-project lifecycle (audit log, customer association,
  workspace operation tracking) doesn't see the dispatch.
- You skip the rate limiter / queue the harness backend
  enforces.
- You'd need a separate auth setup per agent / per machine.

Use the MCP unless explicitly told otherwise.
