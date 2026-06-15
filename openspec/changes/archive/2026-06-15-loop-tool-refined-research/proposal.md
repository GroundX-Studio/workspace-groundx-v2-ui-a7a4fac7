# Server-executed tool: refined re-search

## Why
Deferred from `agentic-tool-loop`. The loop can run any tool that declares
`serverExecute`; `lookup_groundx_docs` was the first. When the initial document
search misses, the model has no way to re-query mid-answer.

## What
A second server-executed read tool that re-runs the turn's scoped GroundX search with
a model-supplied refined query inside the grounded tool-result loop, feeding the new
snippets back to the model. Adds a `serverExecute` value on the existing loop — no
framework work.

## Status
COMPLETE (implemented + tested 2026-06-15) — ready to archive. Built on the shipped
`agentic-tool-loop` (the loop + `serverExecute` mechanism).

## Conformance to core architectural decisions
Composable: a new value on the existing `serverExecute` axis, not a new mechanism.
Same scope/RBAC filter as the turn's primary search (no scope widening).
