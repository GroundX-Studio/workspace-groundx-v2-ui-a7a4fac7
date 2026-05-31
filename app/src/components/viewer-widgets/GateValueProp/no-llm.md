# GateValueProp — no LLM tools

## Why

GateValueProp is purely presentational — a static value-prop
pitch rendered in the canvas while the F6 gate is open. It has no interactive
controls and no state the LLM could meaningfully drive. The gate's actionable
affordances (commit via magic-link/SSO, dismiss) live in the sibling
`chat-widgets/GateChatRail`, which carries the `commit_gate` / `dismiss_gate`
tools. Adding a tool here would be inventing surface area that does not exist.
