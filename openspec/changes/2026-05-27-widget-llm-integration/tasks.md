# Tasks — widget contract + LLM-drivable interactive surface

Nine major phases (with two sub-phases: 3a contract-floor foundation
+ 5b interactive primitives). Each phase opens with a failing test or
a user-visible verification step. Phases can land independently;
order shown is the recommended one (smallest blast radius first).

Merged 2026-05-27 PM with the former `widget-contract-floor-raise`
change — Phase 3a + the README header drift guard in Phase 6 + the
recipes/anti-examples in Phase 7 are the absorbed work.

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

## Phase 3a — Contract-floor foundation: template + worked example + Slot Contract Requirement (absorbed from widget-contract-floor-raise)

- [ ] **Failing assertion:** opening `app/src/components/_template/`
      yields no file (the dir does not exist).
- [ ] Create `app/src/components/_template/README.md` with all five
      required section headers + filler explaining each:
      `## What it does`, `## Props`, `## Locked affordances`,
      `## Events`, `## How to mount`, `## LLM tools`.
- [ ] Create `app/src/components/_template/Template.tsx` — minimal
      widget exporting `Template` with `mode: "onboarding" | "steady"`
      prop, demo affordance locked under onboarding, `data-mode`
      attribute.
- [ ] Create `app/src/components/_template/Template.test.tsx` —
      the canonical 3 tests (mount-both-modes, locked-affordance-absent
      under onboarding, mode-prop reflected on `data-mode`).
- [ ] Create `app/src/components/_template/Template.tools.ts` — a
      stub demonstrating one `read` tool + one `mutate` tool with a
      Zod schema and per-parameter `.describe()` calls. (Alt: create
      `_template/no-llm.md` with a `## Why` section showing the
      opt-out shape.)
- [ ] Add a header comment to each template file: "Copy this dir to
      `chat-widgets/<Name>/` or `viewer-widgets/<Name>/`, rename
      Template → Name, fill in the TODO markers."
- [ ] Ensure `_template/` is **excluded** from the widget-contract
      drift guard (its placement is `components/_template/`, not
      `chat-widgets/` or `viewer-widgets/`).
- [ ] **Failing assertion:** `grep -i "## How to add a new widget" docs/agents/widget-contract.md` does not match a worked-example walkthrough.
- [ ] Extend `docs/agents/widget-contract.md` with a 7-step worked
      example building `ChipsBar` from zero to green. Each step
      shows actual file contents:
      1. Pick the slot + name
      2. Copy `_template/` → `chat-widgets/ChipsBar/`
      3. Fill in `ChipsBar.README.md` (show the populated file)
      4. Fill in `ChipsBar.test.tsx` (show the populated file)
      5. Implement `ChipsBar.tsx` (show the populated file)
      6. Declare `ChipsBar.tools.ts` with one tool (show the
         populated file)
      7. Mount it in a host (show the JSX) + run `npm test`
- [ ] The walkthrough closes with the verification command + expected
      output, not just the procedure.
- [ ] OpenSpec validate: the Slot Contract Requirement already lives
      in `specs/app-architecture/spec.md` (added when this change
      was merged); confirm `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-05-27-widget-llm-integration --strict` passes.

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
- [ ] **Failing test:** `scripts/check-tool-quality.test.mjs` —
      asserts the four quality rules fire on bad fixtures
      (PascalCase name, noun-only name, short description,
      missing `.describe()` on a Zod field) and passes on a
      conforming fixture
- [ ] Add `scripts/check-tool-quality.mjs` that walks
      `registry.all()` and asserts:
      - Name matches `^[a-z][a-z0-9_]*$` AND starts with an
        allowlisted action verb (`open_`, `jump_`, `propose_`,
        `accept_`, `dismiss_`, `save_`, `send_`, `pick_`,
        `pivot_`, `highlight_`, `commit_`, `book_`, `edit_`,
        `pin_`, `run_`, `reject_`, `cancel_`, `delete_`)
      - Description ≥ 40 chars AND contains `Use when` or
        `Triggers when` (case-insensitive)
      - Every Zod field on the `input` schema has a non-empty
        `.describe(...)` (walk via `schema._def.shape()`)
      - Failure messages include: tool name, owning widget path,
        which rule failed, suggested fix
- [ ] Wire the quality check into `npm test` (runs alongside the
      registry-integrity check)
- [ ] Migration sweep: catalog every existing `<Button>` /
      `<IconButton>` / `<TextField>` / `<DropdownMenu>` instance
      across the app. For each:
      - If it triggers an in-app action: add `tool="<name>"` and
        declare the tool in the owning widget's `tools.ts`
      - If it's an external redirect or purely decorative:
        `noTool="<justification>"`
- [ ] App tests + tsc green after migration

## Phase 6 — Widget-contract drift guard extension (tools.ts/no-llm.md + README headers)

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
- [ ] **Failing test:** `widget-contract.test.ts` — a widget README
      missing the `## Locked affordances` (or `## LLM tools`) header
      passes the drift guard today
- [ ] Extend the drift guard to read each widget's README and assert
      it contains all required section headers:
      - `## What it does` (or `## Purpose`)
      - `## Props`
      - `## Locked affordances under \`mode="onboarding"\`` (or
        equivalent)
      - `## Events` (or `## Callbacks`)
      - `## How to mount` (or `## Integration`)
      - `## LLM tools` (or `## No LLM tools — see no-llm.md`)
- [ ] Failure messages name the widget directory, the missing
      header, and list all required headers for reference

## Phase 7 — Backfill all existing widgets

- [ ] Catalog every widget today under `chat-widgets/` +
      `viewer-widgets/` (drift-guard test currently lists them)
- [ ] For each: write `<Name>.tools.ts` if it should be LLM-drivable,
      OR write `no-llm.md` with justification
- [ ] For each: backfill README to include all required section
      headers introduced in Phase 6 (the same widgets get touched
      once, not twice)
- [ ] Add "Promote brand → widget" section to
      `docs/agents/widget-contract.md`. Cover: signal that triggers
      promotion (complexity threshold, multi-instance,
      mode-conditional affordances), file-level migration steps,
      test-suite migration, what stays in `brand/`.
- [ ] Add "Anti-examples" section to `docs/agents/widget-contract.md`.
      List 5 concrete examples of components that are NOT widgets
      (`CiteChip`, `Heading`, `OnboardingNav`, `AppShell`,
      `IconButton`) with the rule of thumb for each.
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
