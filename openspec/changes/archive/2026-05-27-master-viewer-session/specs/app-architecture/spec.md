# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: ViewerSession SHALL be the master viewer-state record per chat session

Every `ChatSession` SHALL carry a paired `ViewerSession` slot containing
`history: ViewerStep[]`, `currentStep: { stepIndex: number }`, `overlays:
ViewerOverlay[]`, and `workspace` (schema overlay + future workspace
state). The `ViewerSession` SHALL persist server-side via the
`chat_sessions` row (three nullable JSON columns:
`viewer_history_json`, `viewer_overlays_json`, `viewer_workspace_json`)
AND hydrate on mount via the same RT-style endpoints.

Frame surfaces (F1 Ingest, F2 Understand, F3/F3a/F4 Extract, F5
Interact, F7 Integrate) SHALL push a corresponding `ViewerStep` onto
`viewer.history` when the user advances to them. The viewer step is
the accumulated, never-erased record of "where the user has been." The
discriminator `step.kind` maps to a canonical surface kind
(`ingest-picker`, `doc-viewer`, `extract-workbench`, `interact-chat`,
`report`, `integrate`).

#### Scenario: Viewer history accumulates across frames

- **GIVEN** a user picks the Utility sample, advances to F3, then F3a, then back to F1
- **WHEN** the navigation completes
- **THEN** `viewer.history` contains the corresponding ViewerStep entries in order (`doc-viewer`, `extract-workbench` × 2, `ingest-picker`)
- **AND** `currentStep.stepIndex` points at the most recent push

#### Scenario: Viewer session hydrates on mount

- **GIVEN** a chat session with viewer history persisted server-side
- **WHEN** the user refreshes the page
- **THEN** `ChatStoreServerHydrator` fetches the row and populates `ViewerSession.history` + `currentStep` + `overlays` + `workspace`
- **AND** the legacy `pendingSchemaOverlay` slot mirrors `viewer.workspace.schemaOverlay` from the server payload

### Requirement: Transient surfaces SHALL render as overlays z-stacked over the current viewer step

The sign-up surface SHALL be represented as an entry in
`ViewerSession.overlays` (kind `sign-up`, state `pending | done |
dismissed`, optional `cause`). URL navigation to `/onboarding/signup`
SHALL push the overlay; navigation away SHALL pop it. The overlay is
the source of truth for the sign-up canvas swap.

The previous canvas-swap pattern in `OnboardingShell` — where
`gateActive` caused `<SignUpWidget />` to replace the entire canvas —
SHALL be replaced. `OnboardingShell` SHALL read the overlay stack
first; the legacy `gate.status` slot remains as a transitional bridge
for the chat-side `GateChatPanel` and intent-driven `openGate(...)`
flows until a follow-up change retires it.

#### Scenario: URL navigation to /onboarding/signup pushes a sign-up overlay

- **GIVEN** the user is on F1 with no overlays
- **WHEN** the user navigates to `/onboarding/signup`
- **THEN** a `{ kind: "sign-up", state: "pending" }` overlay is pushed
- **AND** `OnboardingShell.signupSurfaceActive` becomes true
- **AND** `<SignUpWidget />` mounts on top of the (still-mounted) F1 picker

#### Scenario: Navigating away from /onboarding/signup pops the overlay

- **GIVEN** the sign-up overlay is present
- **WHEN** the user navigates to `/onboarding`
- **THEN** the sign-up overlay is popped
- **AND** subsequent sample-pick navigates the canvas to F2 without the overlay blocking it — closing the user-reported "stuck signup screen" regression class
