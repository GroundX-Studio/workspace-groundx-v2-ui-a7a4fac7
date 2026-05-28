# Spec Delta — agent-tools

Migrated from `backlog.md` Epic TL (all rows). Pairs with
`chat-routing` Requirement on routeChat invoking tool calls.

## ADDED Requirements

### Requirement: search_groundx tool SHALL perform a scoped GroundX search

The agent-tool registry SHALL include `search_groundx({scope, query, n?, verbosity?})`.
On invocation, the middleware SHALL execute a GroundX search constrained
by the supplied `ContentScope` and return ranked results that the LLM
folds into its answer inline.

#### Scenario: LLM invokes search_groundx

- **WHEN** the LLM emits a tool call `{"name": "search_groundx", "arguments": {"scope": {…}, "query": "…", "n": 6}}`
- **THEN** middleware runs the GroundX search against the supplied scope
- **AND** results appear inline in the assistant's answer

### Requirement: show_understand tool SHALL dispatch the F2/Understand canvas surface

The agent-tool registry SHALL include `show_understand({doc_id, progress})`.
On invocation, the canvas dispatcher SHALL transition to F2 with the
named document active.

#### Scenario: Tool advances canvas to F2

- **WHEN** the LLM emits `show_understand` with a valid `doc_id`
- **THEN** the canvas advances to F2 (Understand)
- **AND** the supplied document is the active doc in the PDF viewer

### Requirement: show_extraction tool SHALL dispatch the F3/Extract canvas surface

The agent-tool registry SHALL include `show_extraction({schema_id, doc_id, category?, render?})`.
On invocation, the canvas dispatcher SHALL transition to F3 with the
named schema + doc + (optional) category active.

#### Scenario: Tool advances canvas to F3

- **WHEN** the LLM emits `show_extraction` with valid arguments
- **THEN** the canvas advances to F3
- **AND** the named schema and category are the active selection

### Requirement: show_field_citation tool SHALL open the F4 expanded-citation peek

The agent-tool registry SHALL include `show_field_citation({field_id, doc_id, page})`.
On invocation, the canvas dispatcher SHALL open the F4 citation peek
on the named field + page.

#### Scenario: Tool opens F4 citation peek

- **WHEN** the LLM emits `show_field_citation`
- **THEN** the F4 peek surface opens
- **AND** the named field + doc + page are visible with the relevant region highlighted

### Requirement: pin_to_report tool SHALL pin literal turn text to a report template

The agent-tool registry SHALL include `pin_to_report({turn_id, template_id?})`.
On invocation, the middleware SHALL pin the turn's literal text to the
named template OR auto-create a draft template if no `template_id` is
supplied (per `project_dev_contracts.md` decision #12).

#### Scenario: Pin creates a draft template when none supplied

- **WHEN** the LLM emits `pin_to_report` without a `template_id`
- **THEN** a draft template is created
- **AND** the turn's text is inserted as the first section of that template

### Requirement: propose_schema_field tool SHALL emit a ProposalCard in F3a

The agent-tool registry SHALL include `propose_schema_field({field_def})`.
On invocation, a ProposalCard SHALL surface in F3a's Fields tab; on
Accept the field SHALL be added to the active schema. (See
`onboarding-schema-editor` capability for the surface contract.)

#### Scenario: Tool surfaces a propose-card

- **WHEN** the LLM emits `propose_schema_field`
- **THEN** a ProposalCard renders in F3a's Fields tab
- **AND** Accept lands the field via the existing `addSchemaField` flow

### Requirement: propose_report_section tool SHALL emit a ProposalCard in S3a

The agent-tool registry SHALL include `propose_report_section({section_def})`.
On invocation, a ProposalCard SHALL surface in S3a's section list; on
Accept the section SHALL be added to the active template.

#### Scenario: Tool surfaces a section propose-card

- **WHEN** the LLM emits `propose_report_section`
- **THEN** a ProposalCard renders in S3a
- **AND** Accept lands the section into the template

### Requirement: Tool error recovery SHALL fall back after 3 consecutive failures

The chat handler SHALL enter a session-scoped fallback mode after 3
consecutive tool calls return errors. In fallback mode no further tool
calls SHALL be emitted; the LLM is constrained to plain-text answers.
Per `project_dev_contracts.md` error catalog.

#### Scenario: 3 consecutive tool failures triggers fallback

- **GIVEN** 3 consecutive tool calls return error in the same session
- **WHEN** the next turn would otherwise invoke a tool
- **THEN** no tool call is emitted
- **AND** the assistant answers in plain text
- **AND** the session-level fallback flag persists for the rest of the session

### Requirement: AgentToolBus SHALL bridge Zod schemas to LLM-provider JSON Schema

`AgentToolBusContext` SHALL convert each registered tool's Zod schema
into the JSON Schema shape the LLM provider's tool API expects
(provider-specific via the LLM adapter). The current scaffold exposes
a placeholder Zod schema; the conversion MUST produce the correct
provider-format JSON Schema before the tool registry can ship live.

#### Scenario: Registered tool surfaces with correct JSON Schema parameters

- **GIVEN** a tool registered via AgentToolBus with a Zod parameter schema
- **WHEN** the chat handler builds the LLM tool array
- **THEN** the tool's JSON Schema in the array matches the provider's
  expected format (OpenAI function-calling format, Anthropic tool format, etc.)
