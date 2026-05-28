# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: ProposalCard SHALL declare envelope provenance and offer Accept/Dismiss

Each ProposalCard SHALL render:

- `PROPOSAL` badge (coral pill, white text)
- Headline: `Add <N> field(s)`
- `proposal_v<version> · envelope verified` provenance label — sourced
  from the parsed proposal's `provenance.version` AND only rendered
  when `provenance.verified === true`.
- The proposed field's full shape: name + type chip + prompt
- Right-aligned `Accept` (primary green) and `Dismiss` (ghost) buttons

The provenance label SHALL only render when the server-side Zod
validator (`proposalEnvelopeV<N>Schema`) successfully parsed the LLM's
structured output. Proposals that fail Zod validation SHALL NOT surface
to the user — the LLM response is silently dropped and the parse error
is logged to Sentry. This ensures the user never sees a half-built or
malformed proposal.

The same provenance label SHALL render on BOTH:

1. The chat-side `ProposeSchemaFieldCard` (inline in the assistant turn)
2. The F3a Fields-tab ProposalCard variant (above-the-list canvas surface)

#### Scenario: Well-formed envelope renders with provenance

- **GIVEN** the grounded LLM emits a fenced JSON block with
  `{"proposedSchemaField": {"version":"v1", "categoryId":"meters", "name":"total_kwh", "type":"NUMBER", "description":"…"}}`
- **WHEN** `parseGroundedAnswer` runs `proposalEnvelopeV1Schema.safeParse`
- **THEN** the parse succeeds
- **AND** the response carries `proposedSchemaField.provenance = {version: "v1", verified: true}`
- **AND** the rendered ProposalCard shows `proposal_v1 · envelope verified`

#### Scenario: Malformed envelope is dropped silently

- **GIVEN** the grounded LLM emits a fenced JSON block missing `categoryId`
- **WHEN** `parseGroundedAnswer` runs the Zod parse
- **THEN** the parse fails
- **AND** the response carries `proposedSchemaField: null`
- **AND** the parse error is logged to Sentry
- **AND** no ProposalCard renders on either surface
