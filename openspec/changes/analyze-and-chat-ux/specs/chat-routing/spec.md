## ADDED Requirements

### Requirement: A chat turn SHALL emit an ordered thinking stream

A chat turn SHALL emit an ordered **thinking stream** over the existing chat streaming seam,
ahead of the final message. The stream SHALL always carry **app-authored status events**
(`{kind:"status"}`) at the turn's real phase boundaries (planning, GroundX search, snippet
assembly, grounded completion, citation verification). It SHALL additionally carry **model
reasoning events** (`{kind:"reasoning"}`) when — and only when — the configured LLM provider/API
exposes a reasoning summary (OpenAI Responses API `reasoning.summary`, or Anthropic Messages
summarized `thinking`). When the provider/API exposes no reasoning, the stream SHALL contain
status events only and remain valid — reasoning is a graceful enhancement, never a hard
dependency. Raw chain-of-thought SHALL NOT be requested or emitted; only provider-sanctioned
summaries.

#### Scenario: Status events stream on every turn

- **GIVEN** a chat turn is processed
- **WHEN** it passes its phase boundaries
- **THEN** ordered `{kind:"status"}` thinking events are streamed ahead of the final message.

#### Scenario: Reasoning events only when the provider exposes them

- **GIVEN** the configured provider/API exposes no reasoning summary (e.g. OpenAI `/chat/completions`)
- **WHEN** a turn runs
- **THEN** the stream contains status events and zero reasoning events, and the turn completes normally
- **GIVEN** a reasoning-capable provider/API is configured
- **WHEN** a turn runs
- **THEN** `{kind:"reasoning"}` events carrying the provider's reasoning summary are interleaved into the stream.

#### Scenario: No raw chain-of-thought is emitted

- **WHEN** reasoning events are produced
- **THEN** they carry only the provider's sanctioned summary, never a raw chain-of-thought, and the model is never prompted to emit its raw reasoning as text.
