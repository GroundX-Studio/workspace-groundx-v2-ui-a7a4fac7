# Spec Delta — data-tier

## ADDED Requirements

### Requirement: chat_sessions row SHALL persist the paired ViewerSession state

The persistence layer SHALL serialize `viewer_history_json`,
`viewer_overlays_json`, and `viewer_workspace_json` against the
`chat_sessions` row (or a sibling `viewer_sessions` table keyed by
chat-session id). Writes MUST follow the existing RT-04 PATCH
debouncing semantics so the viewer's step + overlay state durably
round-trips on every meaningful change.

The schema decision (single-row JSON columns vs. paired-table) SHALL
be made at Phase 1 implementation time based on a measured maximum
row-size sample; either path is acceptable provided the durable spec
test below passes against the chosen schema.

#### Scenario: Refresh restores the viewer state

- **GIVEN** a user's chat session has accumulated viewer steps `[ingest-picker, doc-viewer(util-1), extract-workbench(utility/meters)]` AND has a pending `sign-up` overlay
- **WHEN** the user refreshes the page
- **THEN** the `chat-sessions/:id` hydrate endpoint returns the viewer slot intact
- **AND** `ChatStoreServerHydrator` populates `ViewerSession.history`, `currentStep`, and `overlays` from the response
- **AND** the rendered surface matches what the user saw before refresh, including the overlay

#### Scenario: Overlay state mutations persist within the same row

- **GIVEN** an overlay `{ kind: "sign-up", state: "pending" }` is persisted
- **WHEN** `commitGate("register")` mutates it to `state: "done"`
- **THEN** the next PATCH to `/api/chat-sessions/:id` carries the new state
- **AND** the row's `viewer_overlays_json` reflects the mutation on the next hydrate
