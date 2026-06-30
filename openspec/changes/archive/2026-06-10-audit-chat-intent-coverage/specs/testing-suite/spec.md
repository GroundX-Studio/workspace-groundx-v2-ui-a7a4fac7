# Spec Delta — testing-suite

## ADDED Requirements

### Requirement: A shared intent catalog SHALL be the single source of truth, and an FE replay corpus SHALL cover every CanvasIntent kind without calling the LLM

A data-only `intentCatalog` SHALL live in `@groundx/shared` behind a
**dedicated non-runtime subpath export** (NOT the `.` runtime entry, so its
dev/test data — including live prompts — is excluded from production bundles).
Each entry SHALL carry `kind`, `class`, and `llm` = `false` (not LLM-emittable)
or `{ toolName, prompt }` (the emitting tool + a prompt; the asserted kind is
the entry's own `kind`, with no separate field). BOTH the `app` and
`middleware` workspaces SHALL import this same source (they cannot import each
other's test files). The frontend replay corpus SHALL provide, keyed by catalog
`kind`, a trigger that is either a canned `ChatReply` — replayed through the
real `useConversation` derivation → `CanvasOrchestrator` dispatch → `ChatStore`
sink pipeline via the `makeFakeApi` chat seam, returning the full envelope
`{ userMessageId, assistantMessageId, compressionRan, reply }` that
`useConversation` reads as `result.reply` — or a direct `dispatch(intent,
source)`. No fixture SHALL cause a real LLM request. Each fixture's assertion
SHALL target the resulting **sink state** (ChatStore mutation, adapter call, or
onboarding-session call) — not merely re-assert the dispatched argument.

#### Scenario: A canned reply drives the real derivation pipeline

- **GIVEN** a fixture whose trigger is a `ChatReply` carrying a primary citation
- **WHEN** the replay engine resolves `api.chat.sendChatMessage` with that reply and runs a chat turn
- **THEN** the `highlightCitation` intent is derived and dispatched, and the active `doc-viewer` step gains the expected highlight
- **AND** no request reaches a real LLM provider

#### Scenario: Direct-UI intents are covered too

- **GIVEN** a fixture for a UI-originated kind (e.g. `showSample`, `openDocument`, `editSchema`) using `via:"dispatch"`
- **WHEN** the replay engine dispatches it with its declared source
- **THEN** the registered adapter (or built-in sink) is invoked with the expected payload

### Requirement: A completeness guard SHALL fail when a CanvasIntent kind has no fixture

A guard test SHALL derive the kind list from `canvasIntentSchema` at runtime
(never a hand-maintained copy) and SHALL fail if any kind lacks an
`intentCatalog` entry or an FE replay fixture. This makes intent coverage a
property of the data: a newly added intent kind cannot ship green without a
catalog entry and a fixture.

#### Scenario: New intent kind without a fixture

- **GIVEN** a new `kind` is added to `canvasIntentSchema`
- **WHEN** the guard runs and no fixture has that `kind`
- **THEN** the guard fails, naming the uncovered kind

### Requirement: A dev-only intent harness SHALL exercise every intent live and be absent from production builds

The system SHALL provide a dev-only intent harness — a route or overlay
following the existing `DebugOverlay` dev-surface convention (query/env-gated)
— that renders every FE replay fixture grouped by catalog class (viewer-loading
/ ux-interaction) with a control that fires the fixture so the canvas + chat
react on screen. Firing SHALL dispatch the fixture's computed intent(s) directly
to the live orchestrator (via the exported derivation helpers for reply-derived
kinds, or the pre-built intent for `via:"dispatch"` kinds) and SHALL NOT route
through `useConversation.send` — so the harness makes **no real LLM call** in the
running app. It SHALL reuse the **same** fixtures + shared `intentCatalog` as the
tests (one source of truth) and SHALL NOT be reachable in a production build. If the harness uses
intentionally off-brand styling it SHALL be added to the `no-hardcoded-styles`
allowlist in the same change (as `DebugOverlay` is).

#### Scenario: Firing a viewer-loading fixture changes the canvas

- **GIVEN** the dev harness is open in the running app
- **WHEN** the developer fires a viewer-loading fixture (e.g. `showExtract`)
- **THEN** the canvas advances to the corresponding frame/surface

#### Scenario: Harness is not shipped to production

- **WHEN** a production build is produced
- **THEN** the harness is not present/reachable

### Requirement: An on-demand live-LLM suite SHALL cover every LLM-emittable intent and SHALL NOT run in the default gate

The system SHALL provide a key-gated suite in the **middleware** project,
enabled only when `INTENT_LIVE` is set and real LLM/GroundX credentials are
present, that injects a **real `LlmClient`** through the same `chatHandler`
`deps.llmClient` seam the stub corpus uses, sends each LLM-emittable intent's
prompt to the real model, and asserts the reply emits that intent's kind.
Coverage SHALL be the full set of LLM-emittable intents — every intent
reachable via a `SERVER_TOOL_CATALOG` tool `intentBuilder` (`highlightCitation`
is among them, also reachable via the citation path) — sourced from the `llm`
field of the shared `intentCatalog` (one source of truth). The suite SHALL be runnable as a whole
or for a single intent (`INTENT_LIVE=<kind>`), SHALL be excluded from the
default test gate, and SHALL skip cleanly (not fail) when the env/keys are
absent. The assertion SHALL be on the emitted **intent kind** (not answer text).
A live-coverage guard SHALL fail if any LLM-emittable kind lacks an `llm`
prompt, or if a non-LLM-emittable (pure-UI) kind carries one — so the
LLM/non-LLM boundary is enforced rather than silently drifting.

#### Scenario: Default gate runs no live calls

- **GIVEN** real credentials are present but `INTENT_LIVE` is unset
- **WHEN** the default test gate runs
- **THEN** the live suite is skipped and no real LLM request is made

#### Scenario: A single intent can be tested on demand

- **GIVEN** `INTENT_LIVE=showExtract` with valid credentials
- **WHEN** the live suite runs
- **THEN** only the `showExtract` case sends a prompt to the real model, and it asserts the reply emits a `showExtract` intent

#### Scenario: Every LLM-emittable intent is covered

- **GIVEN** the live-coverage guard runs
- **WHEN** an intent reachable via a tool `intentBuilder` has `llm: false` or no prompt in the catalog
- **THEN** the guard fails, naming the uncovered intent

#### Scenario: Non-LLM-emittable intents are excluded by design

- **GIVEN** an intent with no tool `intentBuilder` (`showSample`, `openDocument`, `showCitations`, or `editSchema`) that the model never emits
- **WHEN** the live-coverage guard runs
- **THEN** it requires that intent's catalog entry to be `llm: false` (it is covered by the FE corpus instead), and fails if a prompt is added
