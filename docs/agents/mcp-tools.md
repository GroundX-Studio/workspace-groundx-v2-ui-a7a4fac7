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

## Where `PARTNER_API_KEY` lives — read this carefully

There are **two distinct Partner API keys** on this project. They look
identical (both 36-char UUIDs, both called "Partner API key" in casual
conversation) but they authenticate against different things. Mixing
them up is the #1 way to get a `403 workspace ownership context does
not match caller` and lose 15 minutes.

| Key | Where it lives | What it's for | When you need it |
|---|---|---|---|
| **Runtime** GroundX Partner key | `scaffold/.env.local` (and `scaffold/middleware/.env.local`) as `GROUNDX_PARTNER_API_KEY` | The middleware's calls to `api.groundx.ai` (the GroundX SDK — customers, buckets, documents, search, workflows) | Never as the MCP `PARTNER_API_KEY` argument |
| **Harness** (workspace-owner) Partner key | NOT on disk. Owned by whoever provisioned the managed project on GroundX Studio. | The `mcp__groundx-studio__*` tools — `commit_push`, `publish`, `git_session`, `deploy_config`, `clone_project`, `setup_env`, `project_create`, `operation_wait` | Every `groundx-studio` MCP call |

### Recovering the harness key after a session compact

The harness key isn't in `.env.local`, `.groundx-studio.json`,
`~/.claude.json`, or the plugin RPM. It IS in the project's transcript
JSONL files because every prior `commit_push` recorded the
`PARTNER_API_KEY` argument:

```bash
grep -aoE '"PARTNER_API_KEY":"[^"]{30,50}"' \
  ~/.claude/projects/-Users-benjaminfletcher-git-groundx-v2-ui/*.jsonl \
  | sort -u
```

You'll get one or two distinct UUIDs. The one that **does not** equal
`GROUNDX_PARTNER_API_KEY` from `scaffold/.env.local` is the harness
key. If only the runtime key prints, or if the harness key has rotated
and the transcript value 403s, **ask the user for the
workspace-owner Partner API key**. Don't guess. Don't reuse the runtime
key "just to see what happens" — the 403 is the only signal you get and
it doesn't say "wrong key."

### Why the trap is so easy to fall into

- Both keys are 36-char UUIDs. Visually indistinguishable.
- `.env.local` has only the runtime key, named `GROUNDX_PARTNER_API_KEY`,
  which sounds authoritative.
- The MCP's error message says "workspace ownership context does not
  match caller" — not "wrong Partner key." It reads like a
  permissions / ACL problem upstream, so retrying or fetching a fresh
  git-session feels like the right move. It is not.
- `git push` directly is not a fallback: the scaffold's remote uses
  git-session credentials only the MCP can mint.

### Before every MCP call, ask yourself

> "Is the `PARTNER_API_KEY` I'm about to pass the workspace-owner one,
> or the runtime one?"

If you're not sure, run the recovery grep. If still not sure, ask the
user. Never paste the literal value into a committed file (transcripts
and tool-call args are fine — git is not).

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
