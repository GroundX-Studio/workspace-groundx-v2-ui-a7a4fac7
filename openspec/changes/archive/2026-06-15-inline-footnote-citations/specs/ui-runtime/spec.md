# Spec Delta — ui-runtime

## ADDED Requirements

### Requirement: CiteChip SHALL provide an inline footnote variant

`CiteChip` SHALL expose a `variant` axis with values `pill` (today's standalone badge) and
`footnote` (a small superscript `[N]` marker that sits in the text flow). `footnote` SHALL
be the variant used within answer prose, extract field-row values, and report-section prose.
Both variants SHALL share the SAME click behavior — the `highlightCitation` dispatch (or
`openDocument` for a regionless citation) and the `cite.peeked` telemetry — and the SAME
hover title (`source · page N — snippet`). The tier color (`color` prop: cyan / coral /
green) SHALL apply to both variants. No second component is introduced.

#### Scenario: Footnote variant renders inline and routes like the pill

- **GIVEN** a `CiteChip` rendered with `variant="footnote"` for a citation with a region
- **WHEN** the user clicks the inline marker
- **THEN** it dispatches `highlightCitation` for that citation (same as the `pill` variant)
- **AND** fires the `cite.peeked` event with the same payload

#### Scenario: Regionless citation in footnote variant opens the document

- **GIVEN** a `CiteChip` `variant="footnote"` for a citation with no page/region
- **WHEN** the user clicks the marker
- **THEN** it dispatches `openDocument` for that `documentId` with no highlight
