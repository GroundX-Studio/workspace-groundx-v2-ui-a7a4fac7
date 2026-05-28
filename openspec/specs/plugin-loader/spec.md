# plugin-loader Specification

## Purpose

Define the durable contract for remote plugin loading — the plugin
manifest shape, allowed UI slots, the tool-surface the loader hands to
the agent-tool registry, and the relationship between `PLUGIN_PRESET`
and `APP_MODE_PRESET`. The loader itself is deferred; this capability
keeps the contract stable so plugins can be authored against it.

## Requirements
### Requirement: ADR SHALL document the plugin tool-surface contract before PLUG-01..05 ship

PLUG-07 (ADR) SHALL define the plugin manifest shape, allowed UI slots,
allowed tool kinds, the relationship between `PLUGIN_PRESET` and
`APP_MODE_PRESET`, and how plugin-emitted tools interact with the core
`AgentToolBus`. PLUG-01..05 are blocked on this ADR landing.

#### Scenario: ADR exists and is referenced

- **WHEN** the ADR ships at `docs/adr/<n>-plugin-tool-surface.md`
- **THEN** PLUG-01's design.md references it as the source of truth
- **AND** validated against by a scanner / test

### Requirement: BFF plugin loader SHALL load remote plugin manifests

The middleware SHALL provide a plugin loader that fetches a remote
manifest (URL configured via env), validates it against the ADR-defined
shape, and registers contributed tools + system-prompt fragments. The
loader is BLOCKED on PLUG-07.

#### Scenario: Test plugin manifest registers a tool

- **GIVEN** a remote manifest exposing a system-prompt fragment + a tool
- **WHEN** the BFF loads the manifest
- **THEN** the system-prompt fragment lands in the chat-router's prompt build
- **AND** the tool appears in the LLM tool array with the correct JSON Schema

### Requirement: OnboardingSkillContext SHALL accept loaded plugin metadata

`OnboardingSkillContext` SHALL replace its placeholder implementation
with a real surface backed by the plugin loader. The context SHALL
expose: UI-slot metadata, tour metadata, and any plugin-contributed
agent persona. Blocked on PLUG-01.

#### Scenario: Loaded plugin renders into the skill's UI slot

- **GIVEN** a loaded plugin manifest with a UI-slot widget
- **WHEN** `useOnboardingSkill()` is called from the corresponding slot
- **THEN** the plugin's widget renders in the slot
- **AND** the plugin's tour metadata is reachable via the hook

### Requirement: SDR plugin content SHALL ship as a remote-loaded plugin

The SDR onboarding agent's content SHALL live OUTSIDE the BFF codebase
and load via the plugin loader. The plugin SHALL deliver: the
three-options gate framing, the tour stepper, and the SDR-persona
voice. Blocked on PLUG-01.

#### Scenario: SDR plugin renders the three-options gate

- **GIVEN** the SDR plugin remote-loaded
- **WHEN** the user reaches F6
- **THEN** the gate renders with the three options framed in the SDR voice

### Requirement: Onboarding overlay surface SHALL be an alternative to the inline F1-F7 flow

The plugin loader SHALL support an "overlay" deployment mode: the
plugin-supplied onboarding renders as an overlay on top of any product
surface, not as inline F1-F7 frames. Blocked on PLUG-01 + product spec
for overlay UX.

#### Scenario: Overlay onboarding mounts on top of the product surface

- **GIVEN** a plugin configured for overlay mode
- **WHEN** a first-time user lands on any product surface
- **THEN** the onboarding overlay renders over the page
- **AND** dismissing the overlay leaves the product surface intact

### Requirement: Tour state machine SHALL accept tour as a third intent source

The intent dispatcher SHALL accept `source: "tour"` in addition to
`source: "user" | "agent"`. The tour state machine, supplied by a
loaded plugin, drives frame transitions through `dispatchIntent({source:
"tour"})`. Blocked on PLUG-01.

#### Scenario: Tour advances a frame via dispatchIntent

- **WHEN** the tour state machine emits `dispatchIntent({source: "tour", kind: "advanceFrame", to: "f3"})`
- **THEN** the canvas advances to F3
- **AND** the intent log records source `tour`

### Requirement: PLUGIN_PRESET env SHALL choose which plugin bundle the LLM-side harness loads

The middleware SHALL honor `PLUGIN_PRESET` env var distinct from
`APP_MODE_PRESET`. The plugin loader uses the preset to pick which
remote manifest to load at boot. `env.ts` SHALL declare and validate
the preset.

#### Scenario: PLUGIN_PRESET drives plugin choice at boot

- **GIVEN** `PLUGIN_PRESET=sdr` set in the environment
- **WHEN** the middleware boots
- **THEN** the SDR plugin manifest URL is fetched and registered
- **AND** changing the preset to a different value loads a different plugin

