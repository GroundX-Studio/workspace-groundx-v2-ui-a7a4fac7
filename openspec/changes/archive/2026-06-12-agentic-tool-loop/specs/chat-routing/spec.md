# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: The grounded chat path SHALL run a bounded server-side tool-result loop

The grounded chat path SHALL support a bounded agentic loop on the shared
`groundedAnswerOverScope` seam, enabled by an explicit per-caller option
(chat passes `toolLoop: { maxRounds: 4 }`; report and hybrid pass no loop
option and SHALL remain single-shot, byte-identical to pre-loop behavior).
Within the loop, a tool call whose catalog entry declares a server executor
(`ServerTool.serverExecute`) SHALL be executed by the middleware, its string
result appended to the running transcript as a provider `tool` message
(paired to the assistant `tool_calls` message by id), and the LLM re-called
so the model continues its answer from the result. Only `read`-category
tools MAY declare a server executor; mutate tools SHALL always remain
user-confirmed chips. Tool calls WITHOUT a server executor emitted in any
round SHALL accumulate and route exactly as today (read → `reply.intents[]`,
mutate → `suggestedActions[]` chips) after the loop ends; accumulation SHALL
NOT dedupe by provider call id (synthesized ids collide across rounds). The loop SHALL end
when a round emits no server-executed call or the round cap is reached; the
final round's prose is the answer and flows through the unchanged
citation-verification contract (quotes verify against the SNIPPET set only —
server-executed tool results are private background, never citable). A
server-executed tool's validation or executor failure SHALL append a terse
error `tool` message AND a `toolFailures[]` entry, and MUST NOT fail the
turn; LLM transport failures keep their existing throwing behavior.

#### Scenario: Model continues its answer from a server-executed tool result

- **GIVEN** the chat LLM (scripted) emits a `lookup_groundx_docs` call in round 1
- **WHEN** the chat turn runs with the loop enabled
- **THEN** the middleware executes the tool and the round-2 LLM request carries
  the assistant `tool_calls` message plus a `role: "tool"` result message
- **AND** `reply.answer` is the round-2 prose
- **AND** no `intents[]` entry or chip carries the lookup call.

#### Scenario: Round cap bounds the loop

- **GIVEN** a scripted LLM that emits a server-executed tool call every round
- **WHEN** the turn runs with `maxRounds: 4`
- **THEN** the loop makes at most `maxRounds + 1` (5) grounded completions, plus
  at most one additional tool-only prose-repair completion when the capped
  round produced no prose (≤6 total)
- **AND** the turn succeeds with a final answer (bounded, never unbounded).

#### Scenario: Non-executable tools emitted mid-loop still route as intents/chips

- **GIVEN** round 1 emits both `lookup_groundx_docs` and `open_document`
- **WHEN** the loop completes
- **THEN** `open_document` appears exactly once on `reply.intents[]`
- **AND** `lookup_groundx_docs` appears on neither `intents[]` nor `suggestedActions[]`.

#### Scenario: Report and hybrid paths stay single-shot

- **GIVEN** a smart-report section generation (no `toolLoop` option)
- **WHEN** the section generates
- **THEN** exactly one LLM completion is made
- **AND** the request shape is byte-identical to the pre-loop seam.

#### Scenario: Executor failure degrades, never fails the turn

- **GIVEN** a server-executed call whose args fail Zod validation (or whose executor throws)
- **WHEN** the loop processes it
- **THEN** the model receives a terse error `tool` message and continues
- **AND** `reply.toolFailures[]` names the tool
- **AND** the turn succeeds.

### Requirement: Chat replies SHALL surface server-executed tool activity to the user

The chat reply envelope SHALL carry an OPTIONAL `toolActivity?: { name,
label }[]` — one entry per SUCCESSFULLY server-executed tool call in the turn
(failed executions appear on `toolFailures[]`, never here), with the
user-facing `label` taken from the tool's declared `activityLabel`. The field
SHALL be OPTIONAL (`z.array(...).optional()`), mirroring the existing
`_debug?` annotation: the rag producer sets it; the 17 structured/hybrid
reply producers — which can never run a server tool — omit it rather than
each writing `[]` (a required array would fail `tsc` at all 17 typed return
sites for no safety gain). It SHALL be single-sourced as a `@groundx/shared`
Zod field; because `app ChatReply` and middleware `ChatRouterResponse` are
direct aliases of the shared type, the existing `Eq<>` drift guards carry the
field with no manual per-side edit, and the runtime parse-boundary validate
(`chatReplySchema.safeParse`) continues to hold. The app SHALL read
`reply.toolActivity ?? []` and render any entries as a muted annotation on
the assistant message (e.g. "Checked GroundX docs"). A non-looped rag turn
SHALL carry `[]`; structured/hybrid turns MAY omit the field. A LIVE
in-progress indicator is deferred to the streaming requirement, where
`toolActivity` entries become stream events.

#### Scenario: A looped turn shows what was consulted

- **GIVEN** a turn in which `lookup_groundx_docs` executed successfully
- **WHEN** the reply renders
- **THEN** `reply.toolActivity` contains `{ name: "lookup_groundx_docs", label: "Checked GroundX docs" }`
- **AND** the assistant message shows the muted annotation.

#### Scenario: Non-looped and failed turns stay clean

- **GIVEN** a turn with no server-executed call (or one whose only call failed validation)
- **WHEN** the reply renders
- **THEN** `reply.toolActivity` is empty or absent (the app reads `?? []`)
- **AND** the failed call appears on `toolFailures[]` only.

## MODIFIED Requirements

### Requirement: GroundX product knowledge SHALL come from the vendored skill pack via per-turn retrieval

The chat agent's GroundX product knowledge SHALL be the vendored markdown of the public
`groundx-agent-harness` skill pack (`middleware/assets/groundx-skills/`, synced at a PINNED commit
by `scripts/sync-groundx-skills.mjs`; non-knowledge files such as ROUTING.md and CHANGELOG.md are
excluded) — never a hard-coded product blurb and never a runtime GitHub fetch (on-prem/air-gap).
Retrieval SHALL be section-level (markdown heading chunks), capped (~4.5KB / top 3 sections), and
injected into the grounded system prompt as the `GROUNDX KNOWLEDGE` block only when the turn
plan calls for product knowledge.
When the turn plan affirms `productKnowledge`, retrieval runs with the retriever's
minDistinct/score ENTRY BAR bypassed (section ranking and caps still apply; nothing injects only
when the pack is missing or no section scores at all); the retriever's internal scoring gate
operates intact ONLY on the planner's deterministic-fallback path. GroundX product facts SHALL
have the vendored corpus as their single source of truth — no parallel hard-coded product
capsule. The production image SHALL ship `middleware/assets` alongside the built middleware.
Per-turn injection SHALL remain the FAST PATH; the `lookup_groundx_docs` server-executed read
tool (the formerly named evolution, now shipped via the grounded tool-result loop) is the
ESCALATION path for mid-answer knowledge needs the planner did not anticipate. Both paths SHALL
consume the SAME retriever over the SAME vendored pack — no second knowledge source. The tool's
declared prompt guidance SHALL steer the model away from calling it when the injected knowledge
block already covers the question.
*(Modified from the chat-architecture-hardening wording: the "prompt injection — NOT a lookup
tool" recorded constraint is RETIRED because the one-shot pipeline limitation it documented no
longer holds; the vendored-corpus / never-runtime-fetch / injection-gating invariants carry
forward unchanged.)*

#### Scenario: Product question answered from the skill pack

- **GIVEN** the vendored pack is present
- **WHEN** the user asks "what do you know about groundx?"
- **THEN** the system prompt carries retrieved skill sections and the reply answers from them
- **AND** the reply carries zero citations (no documents were drawn on).

#### Scenario: Missing pack degrades to snippets-only

- **GIVEN** a checkout where the pack was never synced
- **WHEN** a chat turn runs
- **THEN** retrieval returns nothing and the turn succeeds without a knowledge block.

#### Scenario: Mid-answer knowledge need escalates via the lookup tool

- **GIVEN** a turn the planner classified as document-only (no knowledge block injected)
- **WHEN** the (scripted) model calls `lookup_groundx_docs` with a product query
- **THEN** the tool result carries the retriever's top sections for that query
- **AND** the final answer draws on them with zero document citations for the product portion.
