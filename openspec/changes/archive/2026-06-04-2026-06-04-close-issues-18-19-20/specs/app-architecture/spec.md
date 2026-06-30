# app-architecture Specification Delta

## MODIFIED Requirements

### Requirement: The intent dispatch surface SHALL be the single execution path for canvas state changes

`CanvasOrchestratorContext.dispatch()` SHALL be the canonical entry point that
turns a `CanvasIntent` into an in-app state change. The orchestrator SHALL
switch exhaustively over every `CanvasIntent.kind` with a `never` check so a new
intent kind without a handler or explicit retained-adapter case fails
type-checking.

The `registerAdapter` mechanism is RETAINED for current live callers whose
intent kinds are explicitly named in the dispatch switch as adapter-backed
cases. Current retained callers include `OnboardingWizard`, `DialogTitle`, and
`SignUpWidget`. New intent behavior SHOULD prefer a built-in dispatch case
unless an OpenSpec plan justifies an adapter-backed extension.

The `CanvasIntent` union SHALL be defined by the shared Zod schema in
`@groundx/shared`; every boundary that reads or writes a persisted
`CanvasIntent` SHALL validate through that shared schema.

#### Scenario: A new intent kind without a handler fails type-checking

- **GIVEN** a new `CanvasIntent` kind is added to the shared union
- **WHEN** `npx tsc --noEmit` runs
- **THEN** the dispatch exhaustiveness check fails unless the kind has a
  built-in dispatch branch or an explicit adapter-backed no-op case.

#### Scenario: Current adapter-backed intents remain explicit

- **GIVEN** a current adapter-backed intent such as `submitSignup`,
  `wizardNext`, `wizardBack`, `wizardFinish`, `dismissWizard`, or `closeDialog`
- **WHEN** `dispatch()` receives the intent
- **THEN** the switch names the kind explicitly before the retained
  `registerAdapter` fallback runs.
