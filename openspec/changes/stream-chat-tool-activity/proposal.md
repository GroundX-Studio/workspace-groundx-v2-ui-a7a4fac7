# Stream chat responses + live tool-activity indicator

## Why
Deferred from `agentic-tool-loop`. Today a server-executed tool (`lookup_groundx_docs`)
runs silently mid-turn; the user only sees a post-hoc muted "Checked GroundX docs"
annotation on the finished reply. A live indicator ("checking GroundX docs…") shown
WHILE the loop runs needs a streaming channel (SSE/fetch-stream), which the chat
transport does not yet have.

## What
When chat streaming lands, the per-call activity records that already ship as
`reply.toolActivity[]` (non-streaming envelope, built by `agentic-tool-loop`) become
live stream events emitted as each server tool executes.

## Status
NOT STARTED — backlog stub. Depends on the existing chat-routing streaming requirement
and on `agentic-tool-loop` (toolActivity already produced).

## Conformance to core architectural decisions
Composable: reuses the existing `toolActivity[]` data as stream events — no second
activity source. One source of truth (the shared envelope shape) unchanged.
