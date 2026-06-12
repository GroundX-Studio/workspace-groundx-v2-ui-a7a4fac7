# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: The chat stream SHALL surface in-progress server-tool activity

The streaming chat surface SHALL emit a live activity indicator while a
server-executed tool (e.g. `lookup_groundx_docs`) runs mid-turn, derived from the
SAME per-call activity records that ship as `reply.toolActivity[]` in the
non-streaming envelope — there SHALL NOT be a second activity source. The finished
reply SHALL still carry the equivalent `toolActivity[]` entries on completion.

#### Scenario: Live indicator during a mid-answer lookup

- **GIVEN** a streaming chat turn in which the model calls `lookup_groundx_docs`
- **WHEN** the tool executes
- **THEN** the stream emits a "Checked GroundX docs" activity event before the answer tokens
- **AND** the completed reply carries the same `toolActivity[]` entry.
