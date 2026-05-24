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

## Where `PARTNER_API_KEY` lives

In `scaffold/middleware/.env.local` and `scaffold/.env.local` (both
gitignored). Both files have `GROUNDX_PARTNER_API_KEY=…`. To pass
it to an MCP call, read the value out of one of those files via
`awk` (or read it once into a shell var per session).

**Never paste the literal value into a committed file.** The
conversation transcript is not a committed file, so tool calls
that take the value as a parameter are fine — but never as the
content of a file you'll `git add`.

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
