# Vendor GroundX product knowledge + keyword-routed prompt insert

## Why

The product chat agent answers questions about GroundX itself (X-Ray, search,
extraction, deployment, SDKs) from a ~200-token hard-coded "ABOUT GROUNDX"
capsule in `middleware/src/services/ragPipeline.ts`. That capsule is a second
source of truth that drifts from the canonical public knowledge in
https://github.com/GroundX-Studio/groundx-agent-harness (MIT), which ships
seven markdown skills (`groundx-api`, `groundx-architecture`,
`groundx-extraction-workflows`, `groundx-on-prem`, `groundx-python`,
`master-brand-gtm`, `product-brand-gtm`) plus a `skills/ROUTING.md` routing
tree. The agent should answer GroundX product questions from that full corpus
— without runtime GitHub fetches (on-prem/air-gap) and without dumping ~1.4 MB
of markdown into the prompt.

## What changes

1. **Vendor the skills** (already scaffolded): `scripts/sync-groundx-skills.mjs`
   downloads the repo at a pinned commit and copies `skills/**/*.md` into
   `middleware/assets/groundx-skills/` with a `MANIFEST.json` recording the
   exact commit. No runtime network access.
2. **Keyword-routed prompt insert**: a new `groundxSkills.ts` service loads the
   vendored markdown once, splits it into heading-bounded sections, and scores
   sections against the user's question. When the question is GroundX-product-
   shaped, the top section(s) — hard-capped by characters and section count —
   are injected into the grounded system prompt as a `GROUNDX KNOWLEDGE` block.
   Unrelated document-content questions inject nothing.
3. **Capsule shrinks to Studio-app framing only**: the hard-coded capsule keeps
   only what the vendored corpus cannot know (this app is GroundX Studio; the
   Ingest → Understand → Analyze → Integrate flow; docs pointer). All GroundX
   product facts move to the vendored corpus — one source of truth.
4. **Ship the assets**: `Dockerfile.middleware` runtime stage copies
   `middleware/assets` alongside `middleware/dist`.

## What does NOT change (decision record)

A server-executed `lookup_groundx_docs` LLM tool was considered and deferred.
`SERVER_TOOL_CATALOG`'s `ServerTool` interface requires an `intentBuilder` and
the chat router has **no tool-result round-trip loop** — tool calls become
canvas intents, not `tool_result` messages fed back to the LLM. A data-
returning tool is therefore a brand-new tool shape (optional intentBuilder +
execution loop + second LLM call per turn) with exactly one caller, failing
the "earn every axis — name the second real caller" guardrail. The prompt
insert reuses the existing retrieve→cap→inject mechanism (same shape as RAG
snippet injection). If a second data-returning tool appears, revisit; tracked
as a deferred ticket in `tasks.md`.

## Conformance to core architectural decisions

- **Composable, not forked (principle 1)**: knowledge injection is a new value
  on the existing prompt-assembly axis (capsule / snippets / knowledge block),
  not a parallel chat path. No new tool shape with one caller — the deferred
  tool option is the explicitly rejected cross-product.
- **Done = user-visible + round-trip (principle 5)**: done when a chat turn
  asking a GroundX product question (e.g. air-gapped deployment) receives an
  answer grounded in vendored corpus content the old capsule never contained,
  proven by tests on the assembled prompt; every vendored byte has a read site
  (the section index).
- **One source of truth (principle 6)**: GroundX product facts live only in
  the vendored corpus at a pinned commit; the capsule retains only Studio-app
  framing the public repo cannot contain. `MANIFEST.json` pins provenance.
- **Token discipline**: injected knowledge is capped (sections + chars); never
  whole skills; nothing injected for non-product questions.
- **On-prem posture**: vendored at build time; zero runtime GitHub access.
