# Spec Delta — chat-routing

## MODIFIED Requirements

### Requirement: The grounded prompt SHALL require citations for content claims via a single merged contract

The grounded system prompt's citations contract SHALL state that an answer
drawing ANY fact from the snippets or the EXTRACTED FIELDS block MUST end
with the citations block (one entry per claim), and that the block is
omitted ONLY for turns drawing on neither (greetings, small talk, product
questions). The contract SHALL present exactly ONE example ```json block;
when the EXTRACTED FIELDS block is present the example SHALL show the
snippet-form (`page` + `quote`) and extraction-form (`field` + `value`)
entries side by side in the same `citations` array. The contract SHALL
describe verification outcomes as confidence tiers, not as entries being
"dropped".

The contract SHALL ALSO require an INLINE `[N]` marker placed in the answer
prose immediately after each cited claim, where `N` is that citation's
1-based position in the `citations` array. The guidance SHALL direct the
model to cite at the claim / group level rather than once per atomic value,
so dense list answers do not accrue a marker per line item. The existing
per-entry `answerSpan` (the verbatim phrase from the answer the entry
supports) SHALL be retained — it both verifies the entry and serves as the
renderer's anchoring backup when an inline `[N]` is missing.

#### Scenario: Content claims are MUST-cite

- **GIVEN** the grounded system prompt is built with an extraction block
- **THEN** it contains a sentence requiring the citations block for answers stating facts from the snippets or extracted fields
- **AND** exactly one example ```json fence, containing both a `quote`-form and a `field`-form entry.

#### Scenario: Non-content skip license is scoped

- **GIVEN** the grounded system prompt
- **THEN** the only omission license names non-content turns (greetings/small-talk/product questions)
- **AND** no contract text says the model "may" skip citing a content claim.

#### Scenario: Inline markers are required and index-aligned

- **GIVEN** the grounded system prompt's citations contract
- **THEN** it instructs the model to place an inline `[N]` marker after each cited claim, `N` being the citation's 1-based position in the `citations` array
- **AND** it directs claim/group-level citing (not one marker per atomic value)
- **AND** it retains `answerSpan` as both a verification field and the renderer's anchoring backup
