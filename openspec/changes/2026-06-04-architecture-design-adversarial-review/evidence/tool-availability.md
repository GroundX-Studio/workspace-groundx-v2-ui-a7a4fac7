# Tool Availability

| Tool family | Status | Evidence | Fallback |
|---|---|---|---|
| Chrome DevTools MCP | available, partial surface exposed | `tool_search` exposed `mcp__chrome_devtools` tools including `select_page`, `fill_form`, and `get_console_message` | Use Playwright/browser automation and shell-run preview checks if a needed DevTools operation is not exposed. |
| GitHub | available | `gh` CLI is available in the repo workflow; `tool_search` exposed GitHub connector metadata tools | Use `gh issue list/create/view` for issue handoff. |
| GroundX Studio | available | GroundX Studio connector tools exposed through `tool_search`; local skill docs are installed | Use local `groundx-studio-harness` skill references and repo docs first; use connector search when product architecture context is needed. |
| codegraphcontext / context graph MCP | unavailable | `tool_search` for `codegraphcontext` returned 0 tools | Use `rg`, TypeScript import searches, file reads, focused tests, and call-site greps. |
| Node REPL MCP | available | `tool_search` exposed `mcp__node_repl` | Use only for JavaScript inspection/browser automation when shell or source reads are insufficient. |
