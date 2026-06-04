## MODIFIED Requirements

### Requirement: Every widget SHALL declare its LLM tool surface

Every LLM-drivable widget SHALL declare its app-side tool metadata or an explicit no-LLM opt-out.

Every component placed under `app/src/components/chat-widgets/<Name>/` or
`app/src/components/viewer-widgets/<Name>/` SHALL ship EITHER a sibling
`<Name>.tools.ts` file declaring its LLM-callable metadata OR a sibling
`no-llm.md` file explicitly opting out. The drift-guard test at
`app/src/test/widget-contract.test.ts` SHALL enforce this; silent omission of
both files fails the build.

A `<Name>.tools.ts` exports `tools: WidgetTool[]` where each tool carries:

- `name: string` — snake_case LLM-facing function name
- `description: string` — what the tool does, written for the LLM
- `category: "read" | "mutate"` — whether the server tool mutates persisted state
- `input: z.ZodSchema` — Zod schema mirrored by the middleware `ServerTool`
- `availableIn?: Array<"onboarding" | "steady">` — mode scoping; defaults to both
- `availableSteps?: ViewerStep["kind"][]` — viewer-step relevance metadata
- `rendersWidget?: string` — optional chat-widget reachability binding

App tool declarations SHALL be declarative metadata only. They SHALL NOT expose
a runtime `handler`, and they SHALL NOT be composed into a production app
`toolRegistry`. Executable tool validation and `CanvasIntent` construction live
in middleware `SERVER_TOOL_CATALOG`.

#### Scenario: Drift guard accepts a fully-conforming LLM-drivable widget

- **GIVEN** `chat-widgets/Foo/` contains `Foo.tsx`, `Foo.test.tsx`,
  `README.md`, AND `Foo.tools.ts` exporting valid `WidgetTool[]` metadata
- **WHEN** the drift guard runs
- **THEN** the test passes for that directory
- **AND** the app metadata handler guard confirms `Foo.tools.ts` has no
  `handler` field.

### Requirement: Data catalogs SHALL share a `Catalog<T>` read contract

Every data catalog SHALL satisfy a shared `Catalog<T>` contract exposing
`all(): readonly T[]` and `byId(id: string): T | undefined`. A data catalog is a
collection looked up by id and enumerated — today `ScenarioRegistry`,
`scopedViewerWidgetRegistry`, and `chatExperienceRegistry`. Locally-sourced
catalogs (static or glob-discovered) SHALL additionally enforce a unique-id
invariant that fails at build/boot on a duplicate id. A catalog SHALL be lookup
+ enumeration only: it SHALL NOT resolve an entry from a route/entry context and
SHALL NOT mount or otherwise dispatch behavior.

Declarative app tool metadata is not a production catalog. Tests MAY collect
that metadata with the shared `assertUniqueIds` helper for parity/quality
checks, but this collection SHALL NOT expose `byId`, step filtering, mode
filtering, or executable dispatch.

#### Scenario: Each catalog satisfies the shared read API

- **GIVEN** `ScenarioRegistry`, `scopedViewerWidgetRegistry`, and
  `chatExperienceRegistry`
- **WHEN** their public APIs are inspected
- **THEN** each exposes `all()` and `byId(id)` conforming to `Catalog<T>`
- **AND** `ScenarioRegistry` retains its async status + `refresh()` as the
  remote-catalog extension.
