# Tool Availability

Recorded at audit start.

| Tool | Status | Evidence | Fallback |
|---|---|---|---|
| `codegraphcontext` MCP | Not exposed | `tool_search` for `codegraphcontext` returned 0 tools | `rg`, TypeScript import searches, source reads, contract tests |
| Chrome DevTools MCP | Exposed | `tool_search` exposed page, DOM, a11y snapshot, console, network, click/type, resize, screenshot, and Lighthouse tools; `list_pages` returned `about:blank` | Browser Plugin screenshots or source-only notes if no app page is running |
| GitHub | Exposed | `gh repo view` and `gh issue list` succeeded for `GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7` | Draft issue bodies in `issue-handoff.md` if permissions fail later |
| GroundX Studio tools | Exposed | `_groundx_account_context` returned partner mode for `https://api.groundx.ai` with read/write/admin/ingest scopes | Source inspection and local test fixtures if live calls are unnecessary |
| Node/npm | Exposed | `node -v` returned `v20.20.2`; `npm -v` returned `10.8.2` | Record command unavailability in Task 8 if later commands fail |

