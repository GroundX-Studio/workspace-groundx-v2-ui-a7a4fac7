# Server-executed tool: secondary extraction fetch

## Why
Deferred from `agentic-tool-loop`. The grounded prompt includes the PRIMARY document's
full extraction; an answer that spans more than one document cannot reach a second
document's structured fields.

## What
A server-executed read tool that fetches a named document's full workflow-extraction
(the same payload the prompt's primary-doc EXTRACTED FIELDS block uses) on demand,
mid-answer, for cross-document answers. Adds a `serverExecute` value on the existing
loop.

## Status
NOT STARTED — backlog stub. Depends on `agentic-tool-loop`.

## Conformance to core architectural decisions
Composable: a new value on the existing `serverExecute` axis. Reuses the existing
extraction-fetch path (no parallel fetcher).
