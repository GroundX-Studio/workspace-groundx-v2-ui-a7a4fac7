# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: Schema-Agent chat affordances SHALL surface earlier-turns + confidence delta

The left-pane chat (in F3a) SHALL:

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

These affordances render ONLY on F3a (`currentFrame === "f3a"`). The
standard ChatColumn surface on F2/F5 is unchanged.

#### Scenario: F3a chat shows the Schema-Agent header and sample chip

- **GIVEN** the user is on F3a with `utility-bill` (display name `Utility Bill`) as the active scenario
- **WHEN** ChatColumn renders
- **THEN** the chat surface shows a `Schema Agent` header
- **AND** a sample-switcher chip with text `sample: Utility Bill · switch ▾`

#### Scenario: Field rerun appends a confidence-delta bubble

- **GIVEN** an open inline editor on `peak_demand_kw` with a prior extraction `value: 14.5, confidence: 0.83`
- **WHEN** the user clicks `↻ rerun` and the extraction returns `{value: 16.2, confidence: 0.98}`
- **THEN** the chat stream appends an assistant bubble whose text matches
  `Re-ran on the sample: 16.2 kW · confidence 0.98 ↑ from 0.83`
