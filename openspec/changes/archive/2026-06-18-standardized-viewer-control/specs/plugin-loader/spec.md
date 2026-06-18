# Spec Delta — plugin-loader

## MODIFIED Requirements

### Requirement: Tour state machine SHALL accept tour as a third intent source

The intent dispatcher SHALL accept `source: "tour"` in addition to
`source: "user" | "agent"`. The tour state machine, supplied by a
loaded plugin, drives canvas transitions through `dispatchIntent({source:
"tour", …})` using the per-destination navigation intents (e.g. `showExtract`,
`showInteract`, `showReport`, `showIntegrate`), NOT a frame-named intent. There SHALL
be no `advanceFrame` / `switchFrame` intent kind for the tour to emit. Blocked on
PLUG-01.

#### Scenario: Tour advances the canvas via dispatchIntent

- **WHEN** the tour state machine emits `dispatchIntent({source: "tour", kind: "showExtract", scope, schemaId})`
- **THEN** the canvas shows the Extract (extract-workbench) surface
- **AND** the intent log records source `tour`
- **AND** no frame-named intent (`advanceFrame` / `switchFrame`) is emitted.
