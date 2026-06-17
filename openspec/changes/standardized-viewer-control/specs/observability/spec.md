# Spec Delta — observability

## MODIFIED Requirements

### Requirement: The viewer-event action vocabulary SHALL be frame-free

The viewer-event action vocabulary SHALL contain no frame-named action. The
`viewerEventActionSchema` enum, its server-side request validation, and the
route-contract test that pins it SHALL drop the `frame-advanced` action in favor of
a stage/step action that records a journey-progress advance without naming a frame.
No viewer-event row SHALL carry a frame-named action after this change. The
`understand.completed` analytics SHALL continue to fire, sourced from the
journey-progress advance rather than a frame transition.

#### Scenario: A journey advance records a frame-free viewer-event action

- **GIVEN** a dispatch that advances the journey from Understand to Analyze
- **WHEN** the viewer-event is recorded
- **THEN** its action is the stage/step action, not `frame-advanced`
- **AND** the action passes `viewerEventActionSchema` validation

#### Scenario: No frame-named viewer-event action is accepted

- **GIVEN** a request carrying the action `frame-advanced`
- **THEN** it fails `viewerEventActionSchema` validation (the action is removed)
