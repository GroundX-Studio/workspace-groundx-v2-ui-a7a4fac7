# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: A navigation tool MAY be offered via an `offerAs` disposition

A navigation tool SHALL support being OFFERED as a clickable affordance instead of
performed, expressed as an optional `offerAs` field on the tool's own input schema
(`offerAs: { label, anchor? }`). When `offerAs` is absent the tool SHALL
auto-dispatch per its category (read navigation lands on `reply.intents[]`). When
`offerAs` is present the middleware SHALL build the intent through the tool's
existing `intentBuilder` (so it is server-validated, never free-form) and surface
it as an OFFERED `suggestedActions` entry carrying that intent, `label`, and
optional `anchor`, and SHALL NOT auto-dispatch it. There SHALL be no new offer tool
and no new verb prefix; the `ALLOWED_VERBS` allowlist is unchanged. Because `offerAs`
lives on the tool's domain input schema, it SHALL carry a `.describe(...)` (the
every-field rule), and each navigation tool's `intentBuilder` SHALL ignore `offerAs`
so it never leaks into the built intent.

#### Scenario: Offering a navigation produces a validated, non-auto suggested action

- **GIVEN** the agent calls `show_extraction` with `offerAs: { label: "See the Meters" }` and a focusedCategory argument
- **WHEN** the middleware processes the turn
- **THEN** it builds the `showExtract` intent via `show_extraction`'s `intentBuilder`
- **AND** the intent appears as a `suggestedActions` entry, not on `reply.intents[]`

#### Scenario: Absent `offerAs` auto-dispatches as today

- **GIVEN** the agent calls a read navigation tool with no `offerAs`
- **THEN** its intent auto-dispatches on `reply.intents[]`

#### Scenario: `offerAs` never leaks into the built intent

- **GIVEN** a navigation tool call carrying `offerAs`
- **WHEN** the intent is built via the tool's `intentBuilder`
- **THEN** the built intent contains the domain fields only and no `offerAs`

### Requirement: The agent SHALL be able to both perform and offer viewer actions in one turn

The agent SHALL be able to both perform a viewer action and offer one in the same
turn, and the same action SHALL be expressible either way. Performing is a
navigation tool call without `offerAs`; offering is the same tool call with
`offerAs`. Performing behavior SHALL be unchanged by the affordance mechanism.

#### Scenario: A turn performs one action and offers others

- **GIVEN** a turn where the agent calls `show_extraction` without `offerAs` AND calls navigation tools twice with `offerAs`
- **THEN** the first intent auto-dispatches
- **AND** two offered suggested actions are returned for the user to click

### Requirement: Offer-eligibility SHALL be governed by the intent catalog

A tool SHALL be offer-eligible only if it has an `intentBuilder` and is marked
LLM-emittable in the shared `intentCatalog`. The UI-only intents (`showSample`,
`openDocument`, `showCitations`, `editSchema`) SHALL NOT be offerable. A new
interact navigation tool emitting `showInteract` SHALL be added and marked
LLM-emittable in the catalog with its coverage prompt.

#### Scenario: A UI-only intent cannot be offered

- **GIVEN** an attempt to offer an action whose intent kind is UI-only in the catalog
- **THEN** no suggested action is produced for it

## MODIFIED Requirements

### Requirement: Navigation intents SHALL fully describe their destination

Each per-destination navigation intent SHALL carry everything needed to render its
destination. The showExtract intent SHALL carry scope, schemaId, and an optional
focusedCategoryId. The showReport intent SHALL carry templateId and scope. The
editTemplate intent SHALL carry templateId and an optional selectedSectionId. The
showIntegrate intent SHALL carry scope. The openDocument intent SHALL carry
documentId and an optional page. A showInteract intent SHALL be added for the
Interact destination, carrying scope (the interact-chat step resolves its document
from that scope). There SHALL be no frame-named navigation intent.

#### Scenario: showExtract carries category focus

- **GIVEN** a `show_extraction` tool call with a focusedCategory argument
- **THEN** the built showExtract intent carries that value as focusedCategoryId

## REMOVED Requirements

### Requirement: The `suggest_intent` tool and frame-named navigation

The legacy `suggest_intent` server tool and its mapping to `switchFrame` SHALL be
removed. `suggest_intent` is a general any-frame navigator; before removal, every
destination it serves SHALL be confirmed to map to a per-destination intent (f3 to
`showExtract`, f4 to `showReport`, f5 to `showInteract`, f7 to `showIntegrate`; f1
the picker and f2 the auto-shown doc need no offered navigation). No destination
SHALL be left unmapped. Offering a viewer action is then done through the `offerAs`
disposition; performing one through the per-destination navigation tools. No tool
SHALL emit a frame-named intent, and the intent corpus and `intentCatalog` SHALL drop
the `switchFrame` entry.

#### Scenario: No suggest_intent remains

- **GIVEN** the server tool catalog after this change
- **THEN** it contains no `suggest_intent` tool and no tool that emits `switchFrame`
