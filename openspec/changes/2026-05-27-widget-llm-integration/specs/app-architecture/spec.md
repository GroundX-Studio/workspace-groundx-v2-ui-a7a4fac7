# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: Every widget SHALL declare its LLM tool surface

Every component placed under `app/src/components/chat-widgets/<Name>/` or `app/src/components/viewer-widgets/<Name>/` SHALL ship EITHER a sibling `<Name>.tools.ts` file declaring its LLM-callable tools OR a sibling `no-llm.md` file explicitly opting out. The drift-guard test at `app/src/test/widget-contract.test.ts` SHALL enforce this — silent omission of both files fails the build.

A `<Name>.tools.ts` exports `tools: WidgetTool[]` where each tool carries:

- `name: string` — snake_case LLM-facing function name
- `description: string` — what the tool does, written for the LLM
- `category: "read" | "mutate"` — whether the tool mutates persisted state
- `input: z.ZodSchema` — Zod schema for input validation at the middleware boundary
- `handler: (input) => CanvasIntent` — produces an intent to dispatch
- `availableIn?: Array<"onboarding" | "steady">` — mode scoping; defaults to both

A `no-llm.md` SHALL contain a `## Why` section justifying the opt-out (typical reasons: pure display, user-driven nav with no LLM-controllable surface, already-user-confirmed legacy flow).

#### Scenario: Drift guard fires when both tools.ts AND no-llm.md are missing

- **GIVEN** a new widget directory `app/src/components/chat-widgets/Foo/` containing only `Foo.tsx`, `Foo.test.tsx`, and `README.md`
- **WHEN** `npx vitest run app/src/test/widget-contract.test.ts` executes
- **THEN** the drift guard fails with an error naming the missing tool-surface declaration
- **AND** the error message names both acceptable resolutions (`<Name>.tools.ts` or `no-llm.md`)

#### Scenario: Drift guard accepts a fully-conforming LLM-drivable widget

- **GIVEN** `chat-widgets/Foo/` contains `Foo.tsx`, `Foo.test.tsx`, `README.md`, AND `Foo.tools.ts` exporting a valid `WidgetTool[]`
- **WHEN** the drift guard runs
- **THEN** the test passes for that directory

#### Scenario: Drift guard accepts an explicit no-llm opt-out

- **GIVEN** `chat-widgets/Foo/` contains `Foo.tsx`, `Foo.test.tsx`, `README.md`, AND `no-llm.md` with a `## Why` section
- **WHEN** the drift guard runs
- **THEN** the test passes for that directory

### Requirement: Every interactive primitive SHALL require a tool or explicit no-tool binding

Every interactive primitive under `app/src/components/primitives/` (`Button`, `IconButton`, `TextField`, `DropdownMenu`, `Switch`, `Slider`, interactive `Chip`, and any future addition) SHALL define a discriminated TypeScript prop type that REQUIRES one of `tool: string` or `noTool: string`. Bare instantiation without either prop SHALL fail TypeScript compilation. There is no third option.

The `tool` value SHALL match a tool name declared in some widget's `<Name>.tools.ts` file. A build-time registry-integrity check SHALL fail the build when a primitive references a `tool="..."` that no widget declared (catches typos + dead references).

The `noTool` value SHALL be a justification string. It lands as a `data-no-tool` attribute on the rendered DOM element for audit.

#### Scenario: Bare Button fails TypeScript compilation

- **GIVEN** a developer writes `<Button onClick={handler}>Save</Button>` with neither `tool` nor `noTool`
- **WHEN** `npx tsc --noEmit` runs
- **THEN** compilation fails with an error pointing at the missing required prop

#### Scenario: Button references a non-existent tool

- **GIVEN** `<Button tool="snd_message" onClick={handler}>Send</Button>` (typo: should be `send_message`)
- **WHEN** the registry-integrity build step runs
- **THEN** the build fails with an error naming the unknown tool name + the file path
- **AND** the error suggests `send_message` as a near-match

#### Scenario: Explicit no-tool opt-out passes the integrity check

- **GIVEN** `<Button noTool="external redirect — not an in-app action" onClick={...}>Docs</Button>`
- **WHEN** the build runs
- **THEN** compilation succeeds
- **AND** the rendered DOM carries `data-no-tool="external redirect — not an in-app action"`

### Requirement: The intent dispatch surface SHALL be the single execution path for canvas state changes

`CanvasOrchestratorContext.dispatch()` SHALL be the only path that turns a `CanvasIntent` into an in-app state change. The previously-defined `registerAdapter` mechanism is RETIRED — no widget today uses it, and the design favors a single switch inside `dispatch()` over a runtime registration plane (one place to read every intent's behavior).

Built-in handlers inside `dispatch()` SHALL cover every intent kind defined in the `CanvasIntent` union. An intent kind that is type-defined but has no handler SHALL be flagged as a drift signal (TypeScript exhaustiveness check in the dispatch switch).

#### Scenario: A new intent kind without a handler fails type-checking

- **GIVEN** a new `CanvasIntent` kind is added to the union in `contexts/CanvasOrchestratorContext/types.ts`
- **WHEN** `npx tsc --noEmit` runs
- **THEN** the exhaustiveness check inside `dispatch()` fails with an error naming the unhandled kind

#### Scenario: An LLM tool dispatches its produced intent through the canonical orchestrator path

- **GIVEN** the LLM emits a tool call for `open_document`
- **WHEN** the middleware validates the call + invokes the tool's handler
- **THEN** the result is a `CanvasIntent` with `kind === "highlightCitation"`
- **AND** the frontend receives the intent via `ChatReply.intents[]`
- **AND** dispatching that intent through the orchestrator produces the same state change as a `CiteChip` click
