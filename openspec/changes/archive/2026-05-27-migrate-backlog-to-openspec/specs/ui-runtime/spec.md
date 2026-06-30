# Spec Delta — ui-runtime

Migrated from `backlog.md` Epic UR (active rows only). UR-01..04 closed
historically.

## ADDED Requirements

### Requirement: Global hotkey surface SHALL bind cmd-K, Esc, etc. via react-hotkeys-hook

The product SHALL ship a global hotkey surface backed by
`react-hotkeys-hook` (per `memory/project_ui_runtime.md`). At minimum:
`cmd-K` opens the session switcher; `Esc` dismisses the topmost overlay.
Bindings SHALL respect `prefers-reduced-motion: reduce` for their
animation accompaniments and avoid trapping focus inside disabled
inputs.

#### Scenario: cmd-K opens the switcher; Esc closes overlays

- **GIVEN** the user is on any surface
- **WHEN** the user presses `cmd-K`
- **THEN** the session switcher opens
- **AND** pressing `Esc` closes the switcher
- **AND** pressing `Esc` with no overlay open SHALL be a no-op (not navigate away)
