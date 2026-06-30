# Spec Delta — agent-tools (gate-open tool + `openGate` routing)

Adds the chat-driven successor to the retired F5 Interact "Save" button and
routes the previously-dormant `openGate` `CanvasIntent`.

## ADDED Requirements

### Requirement: The registry SHALL include a `save_to_account` gate-open tool, mirrored both sides

The registry SHALL include `save_to_account()` — a `mutate`-category tool owned by
`GateChatRail` (the gate-lifecycle widget) whose handler emits
`{ kind: "openGate", trigger: "save" }`. It SHALL be exposed on the analysis
surfaces where a user would save mid-flow (`availableSteps` ⊇ `doc-viewer`,
`interact-chat`) and SHALL be mirrored on BOTH the app `GateChatRail.tools.ts`
AND the middleware `SERVER_TOOL_CATALOG`, with the drift guard
(`toolCatalog.test.ts`) and the app↔server parity guard (`catalog-parity.test.ts`)
green. The name uses the allowlisted `save_` verb; the description carries a
`Use when` clause and disambiguates from `submit_signup` (which submits the
form, whereas this OPENS the sign-in offer).

#### Scenario: save_to_account opens the sign-in gate on the live canvas

- **GIVEN** an anonymous onboarding session on the Interact (f5) doc-viewer canvas
- **WHEN** the LLM emits `save_to_account` (or the user clicks the
  `tool:save_to_account` suggested-action chip)
- **THEN** an `openGate` intent with `trigger: "save"` dispatches through the
  canvas orchestrator
- **AND** the sign-in gate opens (the canvas shows the gate value-prop and the
  chat rail shows the sign-in offer).

#### Scenario: save_to_account passes the quality + parity guards

- **GIVEN** the `save_to_account` tool authored as a co-located `*.tools.ts` entry
  and mirrored in `SERVER_TOOL_CATALOG`
- **WHEN** `check-tool-quality`, `toolCatalog.test.ts`, and `catalog-parity.test.ts` run
- **THEN** the `save_` prefix is allowlisted, the description + per-field
  `.describe()` pass, the name set matches on both sides, and there is no
  app-only / server-only orphan.

### Requirement: The canvas orchestrator SHALL route the `openGate` intent to the onboarding gate

The `openGate` `CanvasIntent` (`{ kind: "openGate", trigger }`) SHALL be routed by
the canvas orchestrator to `OnboardingSessionContext.openGate(trigger)` — it
SHALL NOT be a declared-but-unrouted intent. Routing SHALL soft-fail (no throw,
no effect) when no `OnboardingSessionProvider` is mounted (the steady tree),
matching the `commit_gate` / `dismiss_gate` routing. This is the single
mechanism the `save_to_account` tool, the `tool:save_to_account` chip, and any
future gate-open producer use to open the gate — there is no parallel path.

#### Scenario: openGate intent opens the gate via the session

- **GIVEN** a canvas orchestrator mounted above an `OnboardingSessionProvider`
- **WHEN** `{ kind: "openGate", trigger: "save" }` is dispatched
- **THEN** the orchestrator calls `OnboardingSessionContext.openGate("save")` and
  the gate transitions to `open`.

#### Scenario: openGate is a no-op in the steady tree

- **GIVEN** a canvas orchestrator with no `OnboardingSessionProvider` above the gate
- **WHEN** `{ kind: "openGate", trigger: "save" }` is dispatched
- **THEN** the dispatch returns normally with no throw and no gate side effect.
