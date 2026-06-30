# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: F3a topbar SHALL render the spec'd chrome

The topbar SHALL contain, left-to-right:

1. `← back` link (returns to the Extract fields surface by moving the active
   `extract-workbench` step back to `surface: "fields"` via a dispatched intent — NOT
   `advanceFrame("f3")`)
2. Schema title block: `Designing <sample-id> · <category-id>` followed by `v<N> · draft`
3. Flexible spacer
4. `export ▾ JSON·CSV·YAML` button with `🔒` padlock for anonymous users
5. `↻ rerun` button (topbar-level rerun against pinned samples)
6. `💾 Save` button with `🔒` padlock for anonymous users

Padlocks SHALL be visual indicators only — anonymous users can click
both buttons; clicking opens the sign-in gate rather than no-op.

The topbar SHALL NOT contain an `✎ edit schema ▾` toggle.

#### Scenario: Schema-design topbar shows the spec chrome

- **GIVEN** the user is on the schema-design surface with `utility-bill` selected and `meters` as the focused category
- **WHEN** the editor mounts
- **THEN** the topbar renders, in order:
  `← back` · `Designing utility-bill · meters` · `v1 · draft` · spacer · `export ▾ JSON·CSV·YAML 🔒` · `↻ rerun` · `💾 Save 🔒`
- **AND** clicking `← back` returns the user to the Extract fields surface (the active step's `surface` becomes `fields`), with no `advanceFrame` call
- **AND** no `✎ edit schema` button is present

### Requirement: Schema-Agent chat affordances SHALL surface earlier-turns + confidence delta

The left-pane chat (on the schema-design surface) SHALL:

- Render a `Schema Agent` header above the conversation containing:
  - The label `Schema Agent`
  - A sample-switcher chip of the form
    `sample: <Display Name> · switch ▾`
  - The chip's `switch ▾` SHALL open a popover listing the project's
    other samples (stub in onboarding mode where only one sample
    exists; tooltip "Sign in to load more samples").
- Render an earlier-turns summary at the top of the conversation when
  `ChatSession.summaries.length > 0`, of the form:
  `▾ earlier turns (<P> proposals · <A> fields accepted)`
  where `<P>` and `<A>` are derived from the dismissed-proposal count
  and `pendingSchemaOverlay.addedFields.length` respectively.
- When a per-field rerun completes (extraction status flips to `done`
  with a `previousConfidence` value on record), the chat SHALL append
  an assistant bubble with the body:
  `Re-ran on the sample: <value> · confidence <new> ↑ from <old>`

These affordances render ONLY when the active `extract-workbench` step is in its
schema-design sub-position (`surface === "design"`), NOT keyed off `currentFrame ===
"f3a"`. The standard ChatColumn surface on the other viewer steps is unchanged.

#### Scenario: Schema-design chat shows the Schema-Agent header and sample chip

- **GIVEN** the user is on the schema-design surface (`extract-workbench` step with `surface === "design"`) with `utility-bill` (display name `Utility Bill`) as the active scenario
- **WHEN** ChatColumn renders
- **THEN** the chat surface shows a `Schema Agent` header
- **AND** a sample-switcher chip with text `sample: Utility Bill · switch ▾`

#### Scenario: Field rerun appends a confidence-delta bubble

- **GIVEN** an open inline editor on `peak_demand_kw` with a prior extraction `value: 14.5, confidence: 0.83`
- **WHEN** the user clicks `↻ rerun` and the extraction returns `{value: 16.2, confidence: 0.98}`
- **THEN** the chat stream appends an assistant bubble whose text matches
  `Re-ran on the sample: 16.2 kW · confidence 0.98 ↑ from 0.83`
