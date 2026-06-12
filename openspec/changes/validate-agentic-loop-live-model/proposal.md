# Live-model validation of the agentic tool-loop

## Why
`agentic-tool-loop` is tested entirely LLM-free (scripted tool calls). That proves the
plumbing, not the behaviour. Unverified against a live model: does the model call
`lookup_groundx_docs` when product knowledge is needed and refrain when the injected
knowledge block already covers it; is `maxRounds: 4` an appropriate budget; is skill-pack
retrieval relevant for arbitrary queries.

## What
A documented live-model validation procedure (manual smoke or a gated CI job — NOT the
default LLM-free suite) run against a dev server with live LLM + GroundX credentials,
with results recorded.

## Status
NOT STARTED — backlog stub. Run before production trust of the loop.

## Conformance to core architectural decisions
Done = user-visible behaviour verified against the real model, not just the seam.
Kept out of the default suite so the LLM-free guarantee of the unit tests is preserved.
