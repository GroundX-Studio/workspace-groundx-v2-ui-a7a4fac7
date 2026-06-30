# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: GroundX product knowledge SHALL be injected from a vendored corpus via keyword routing, never fetched at runtime

The grounded system prompt SHALL source GroundX product knowledge from
markdown vendored at build time into `middleware/assets/groundx-skills/`
(synced from `GroundX-Studio/groundx-agent-harness` at a commit pinned in
`MANIFEST.json` by `scripts/sync-groundx-skills.mjs`). The middleware SHALL
NOT fetch knowledge from the network at runtime. A `groundxSkills` service
SHALL index the corpus into heading-bounded sections and, per chat turn,
score sections against the user's question; when the question is GroundX-
product-shaped, the top-scoring section(s) SHALL be injected as a
`GROUNDX KNOWLEDGE` system-prompt block, hard-capped by section count and
total characters. Questions about document content (not the GroundX product)
SHALL inject no knowledge block. The hard-coded prompt capsule SHALL contain
only GroundX-Studio-app framing absent from the public corpus; GroundX
product facts SHALL have the vendored corpus as their single source of truth.
A missing or empty assets directory SHALL degrade to no knowledge block
without error. The production image SHALL ship `middleware/assets` alongside
the built middleware.

#### Scenario: GroundX product question pulls vendored knowledge under the cap

- **GIVEN** the vendored corpus is present at its pinned commit
- **WHEN** a chat turn asks "how do I deploy GroundX air-gapped on Kubernetes?"
- **THEN** the assembled system prompt contains a `GROUNDX KNOWLEDGE` block
  with content from the `groundx-on-prem` skill
- **AND** the block stays within the configured section-count and character caps

#### Scenario: Document-content question injects no knowledge block

- **GIVEN** the same corpus
- **WHEN** a chat turn asks "what is the late fee on my bill?"
- **THEN** the assembled system prompt contains no `GROUNDX KNOWLEDGE` block

#### Scenario: Missing corpus degrades gracefully

- **GIVEN** `middleware/assets/groundx-skills/` is absent
- **WHEN** any chat turn arrives
- **THEN** the turn is answered normally with no knowledge block and no error
