# Spec Delta — agent-tools

## REMOVED Requirements

### Requirement: The app and server tool catalogs SHALL agree on tool names and roles

**Reason**: fully subsumed by the modified full-shape parity requirement below. It also permits
"a committed name+role manifest" (contradicting the gate-answered no-manifest decision) and
asserts app-side `availableIn` ROLE parity that is untestable as shipped — app `availableIn` is
`ToolMode` (onboarding/steady), and the server catalog is the sole role-bearing surface per the
decision recorded in `app/src/tools/catalog-parity.test.ts`.

## MODIFIED Requirements

### Requirement: The app and server tool catalogs SHALL agree on declarative tool metadata

The app's declarative tool metadata and middleware `SERVER_TOOL_CATALOG` SHALL
agree on FULL tool shape — mirrored tool names, descriptions (verbatim),
`category`, `availableSteps`, role visibility, chat-widget `rendersWidget`
bindings, AND input schemas (compared as JSON-Schema via the middleware's
`zodToJsonSchema` bridge) — enforced by the app-side cross-package parity guard
(`app/src/tools/catalog-parity.test.ts`), which is the ONLY mechanism that can
load both catalogs (the app catalog is assembled via Vite's `import.meta.glob`).
There SHALL be no committed manifest artifact (gate-answered decision,
2026-05-31, reaffirmed 2026-06-11): the live cross-package test IS the source of
truth, and the `toolCatalog.ts` header SHALL document this instead of promising
a future codegen manifest. Server-only tools SHALL be explicitly allowlisted in
the parity guard. A tool present on one side but absent on the other, or any
full-shape drift, SHALL fail automated validation naming the offending tool.

#### Scenario: Mirrored metadata drift fails

- **GIVEN** an app tool declaration named `open_document`
- **WHEN** the server catalog omits it, changes its description or category, or
  narrows its input schema
- **THEN** the parity guard fails and names the mismatched tool and field.

#### Scenario: Server-only tool remains explicit

- **GIVEN** a server-only tool such as `suggest_intent`
- **WHEN** parity validation runs
- **THEN** the tool is allowed only because it appears in the server-only
  allowlist
- **AND** any server-only tool with a `rendersWidget` binding must be enumerated
  in the chat-widget reachability guard.

## ADDED Requirements

### Requirement: Per-tool prompt guidance SHALL be declared with the tool, not in the prompt

Tool usage guidance rendered into the grounded system prompt SHALL be generated
from the step-filtered tool catalog — each entry's `description` plus an
optional `ServerTool.promptGuidance` field for tools needing more than their
description — as a single generated "TOOL NOTES" section. Hand-written per-tool
paragraphs in prompt text are FORBIDDEN: guidance lives exactly once, on the
tool declaration. A tool absent from the current step's filtered catalog SHALL
contribute no guidance to that turn's prompt.

#### Scenario: Guidance tracks the filtered catalog

- **GIVEN** a chat turn on a step where `propose_schema_field` is offered
- **WHEN** the grounded system prompt is assembled
- **THEN** the TOOL NOTES section contains that tool's declared guidance
- **AND** contains no entry for tools not offered on this step.

#### Scenario: No duplicated hand-written guidance

- **GIVEN** the prompts module
- **WHEN** the grounded prompt source is inspected
- **THEN** it contains no hand-written per-tool paragraph (the former
  `propose_schema_field` / `suggest_intent` prose is gone).
