# Tasks — widget-llm-integration

Eight phases. Each phase opens with a failing test or a
user-visible verification step. Phases can land independently;
order shown is the recommended one (smallest blast radius first).

## Phase 0 — Lock the design (no code)

- [x] User reviews `design.md` and confirms the 15 architectural
      picks (§A-§O) — confirmed 2026-05-27 PM
- [x] User confirms all 5 open questions — confirmed 2026-05-27 PM
- [x] Scope expanded to cover every interactive element (§P added)
      — confirmed 2026-05-27 PM
- Status: design locked. Implementation phases below.

## Phase 1 — Render `suggestedActions[]` (un-dark the existing path)

- [ ] **Failing test:** `ChatColumn.test.tsx` — when a steady-mode
      send returns `{ answer: "...", suggestedActions: [{key,label,detail}] }`,
      a `<SuggestedActionChips>` row renders beneath the bubble
      with one button per action
- [ ] Create `app/src/components/chat-widgets/SuggestedActionChips/`
      (full widget contract: README + test + mode prop)
- [ ] Thread `result.reply.suggestedActions` into `LiveTurn`
- [ ] Render chips under each assistant `BotBubble` in both
      `F2ConversationFlow` and `SteadyConversationFlow`
- [ ] Wire chip click → dispatch the underlying `CanvasIntent` via
      the orchestrator
- [ ] Verify `suggested-intent` chip from a high-confidence LLM
      proposal renders + clicks-through correctly

## Phase 2 — Retire AgentToolBus / fix the doc lie

- [ ] **Failing assertion:** `grep -l "active.*Dispatches LLM tool calls" docs/agents/widget-contract.md` returns the file (lie still present)
- [ ] Decide per `design.md` §A: retire or rewrite. Default per the
      design: retire.
- [ ] Remove `AgentToolBusContext` from `App.tsx`, the provider
      tree, the render helper, the `architecture.md` table
- [ ] Delete `app/src/contexts/AgentToolBusContext/` directory
- [ ] Update `widget-contract.md` § Contexts catalog: replace the
      AgentToolBus row with the new tool-registry row OR remove it
- [ ] Update `architecture.md` similarly
- [ ] App tests still green; no consumers existed so deletion is
      safe

## Phase 3 — Declarative widget-tool API

- [ ] **Failing test:** `app/src/tools/registry.test.ts` —
      auto-discovers a fake widget's `tools.ts` file via
      `import.meta.glob`, asserts the discovered tool's name,
      schema, handler shape
- [ ] Add `app/src/tools/types.ts` defining the `WidgetTool`
      interface (name, description, category, input schema, handler,
      availableIn)
- [ ] Add `app/src/tools/registry.ts` with auto-discovery via
      `import.meta.glob("../components/{chat-widgets,viewer-widgets}/*/*.tools.ts", { eager: true })`
- [ ] Add a `forStep(step: ViewerStep["kind"]): WidgetTool[]`
      helper that filters by `availableIn` + step
- [ ] Write tests covering: empty registry, duplicate tool name,
      schema validation, step-scoped filtering

## Phase 4 — Reference widget: PdfViewer gets its tools

- [ ] **Failing test:** `PdfViewerWidget.tools.test.ts` — fires
      each tool's handler with valid input, asserts the resulting
      `CanvasIntent` shape
- [ ] Create `app/src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tools.ts`
      with two tools:
      - `open_document` (read, both modes) → produces
        `{ kind: "highlightCitation", documentId, page: 1 }`
      - `jump_to_page` (read, both modes) → produces a viewer-step
        mutation via a new orchestrator handler
- [ ] Add the new orchestrator handler for `jump_to_page` (a
      lighter-weight cousin of `highlightCitation` that doesn't
      require a bbox)
- [ ] Update `PdfViewerWidget/README.md` with the canonical "## LLM tools"
      section

## Phase 5 — Middleware function-calling integration

- [ ] **Failing test:** `chatRouter.test.ts` — when the test LLM
      client returns a `tool_calls[]` array, the chat router
      validates each call, dispatches, and returns the resulting
      `intents[]` on the reply
- [ ] Extend `LlmClient` to accept a `tools` parameter on chat
      requests + return `tool_calls[]` in the response
- [ ] Add tool-catalog assembly in `chatHandler.ts`: read the
      session's active ViewerStep, call `registry.forStep(step.kind)`,
      pass the result to the LLM
- [ ] Add tool-call execution: for each `tool_calls[]` entry,
      look up the tool in the registry, validate input against
      Zod, invoke handler, collect the resulting intents
- [ ] Extend `ChatReply` shape: add `intents: CanvasIntent[]` and
      `toolFailures: { name, reason }[]`
- [ ] Persist each tool call to `intent_log` (existing table)
- [ ] App-side: ChatColumn dispatches every `intents[]` entry on
      receipt; orchestrator routes them

## Phase 5b — Interactive primitives require tool/noTool prop (compile-time enforcement)

- [ ] **Failing test:** add a `.test-d.ts` (TypeScript type-check
      test) asserting that `<Button onClick={...}>` without `tool`
      or `noTool` fails compilation; `<Button tool="x" onClick={...}>`
      compiles; `<Button noTool="reason" onClick={...}>` compiles.
- [ ] Modify `components/primitives/Button/Button.tsx` to take the
      discriminated `{ tool: string } | { noTool: string }` prop.
      Render `data-tool` or `data-no-tool` attribute accordingly.
- [ ] Same for `IconButton`, `TextField`, `DropdownMenu`. Each
      interactive primitive gets the same treatment.
- [ ] Add a build-time registry-integrity script
      (`scripts/check-tool-references.mjs`) that:
      - Greps every `.tsx` under `components/` + `views/` for
        `tool="..."` literal references
      - Cross-checks each against `registry.all()` from
        `app/src/tools/registry.ts`
      - Fails the build with the file path + offending tool name +
        a "did you mean?" suggestion when there's no match
- [ ] Wire the integrity script into `npm test` (runs alongside
      vitest)
- [ ] Migration sweep: catalog every existing `<Button>` /
      `<IconButton>` / `<TextField>` / `<DropdownMenu>` instance
      across the app. For each:
      - If it triggers an in-app action: add `tool="<name>"` and
        declare the tool in the owning widget's `tools.ts`
      - If it's an external redirect or purely decorative:
        `noTool="<justification>"`
- [ ] App tests + tsc green after migration

## Phase 6 — Widget-contract drift guard extension

- [ ] **Failing test:** `widget-contract.test.ts` — when a widget
      dir is missing BOTH `<Name>.tools.ts` and `no-llm.md`, the
      drift guard fails with a clear error
- [ ] Extend `app/src/test/widget-contract.test.ts` to assert
      every widget dir has exactly one of `<Name>.tools.ts` or
      `no-llm.md`
- [ ] `no-llm.md` must contain a `## Why` section explaining the
      opt-out
- [ ] If `tools.ts` is present: import it, assert the export is a
      valid `WidgetTool[]` (each entry has name / description /
      input schema / handler / category)

## Phase 7 — Backfill all existing widgets

- [ ] Catalog every widget today under `chat-widgets/` +
      `viewer-widgets/` (drift-guard test currently lists them)
- [ ] For each: write `<Name>.tools.ts` if it should be LLM-drivable,
      OR write `no-llm.md` with justification
- [ ] Existing widgets to triage:
      - `chat-widgets/ChatColumn` — no tools (it IS the chat
        surface; tools live on the widgets it composes)
      - `chat-widgets/ThinkingStream` — no-llm (pure display)
      - `chat-widgets/PickAViewPills` — no-llm (user-driven nav)
      - `chat-widgets/GateChatPanel` — `dismiss_gate`, `commit_gate`?
        (mutate, need confirm)
      - `chat-widgets/ProposeSchemaFieldCard` — `accept_proposal`,
        `reject_proposal` (mutate, but already user-confirmed)
      - `chat-widgets/BookingStatusCard` — `book_call` (mutate)
      - `viewer-widgets/PdfViewer` — Phase 4 reference
      - `viewer-widgets/SignUpWidget` — no-llm
      - `viewer-widgets/BookCallView` — no-llm
- [ ] Drift guard passes after backfill

## Phase 8 — Migrate legacy fenced-JSON paths to function-calling

- [ ] **Failing test:** `chatRouter.test.ts` — a chat reply with a
      schema-field proposal now comes through `tool_calls[]` instead
      of `proposedSchemaField` envelope
- [ ] Move `proposedSchemaField` generation off the grounded-LLM
      fenced-JSON parser onto a `propose_schema_field` tool
- [ ] Move `suggestedIntent` chip generation onto a
      `suggest_intent` tool (or natively via `tool_calls[]` — every
      LLM tool call IS a suggested intent at this point)
- [ ] Update `ChatReply` shape: `proposedSchemaField` becomes
      derived from `intents[]`
- [ ] Update consumers (`ChatColumn`, `ExtractView`) to read from
      the unified `intents[]` array
- [ ] Delete the fenced-JSON parser; deprecate the legacy fields
      on the ChatReply type

## Closure (per Rule 9)

- [ ] OpenSpec `validate --all --strict` passes (4 new requirements
      across 3 capability specs)
- [ ] App tests green
- [ ] Middleware tests green
- [ ] Drift guards green (widget-contract extended assertion fires)
- [ ] Round-trip closure for each new tool (Rule 9 per-tool gate):
      - Round-trip: LLM emits tool_call → middleware dispatches →
        widget renders the state change
      - Dead-column / dead-endpoint / dead-context all pass
- [ ] Archive the change via `openspec archive` once shipped
