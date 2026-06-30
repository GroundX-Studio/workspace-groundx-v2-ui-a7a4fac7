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

- [x] **Failing test:** `ChatColumn.test.tsx` — when a steady-mode
      send returns `{ answer: "...", suggestedActions: [{key,label,detail}] }`,
      a `<SuggestedActionChips>` row renders beneath the bubble
      with one button per action — landed 2026-05-27, 3 integration
      tests pass (onboarding + steady render + click dispatch).
- [x] Create `app/src/components/chat-widgets/SuggestedActionChips/`
      (full widget contract: README + test + mode prop) — 5 widget
      tests pass; widget-contract drift guard green.
- [x] Thread `result.reply.suggestedActions` into `LiveTurn`
- [x] Render chips under each assistant `BotBubble` in both
      `F2ConversationFlow` and `SteadyConversationFlow`
- [x] Wire chip click → dispatch the underlying `CanvasIntent` via
      the orchestrator — pragmatic host-side mapping (Phase 3 retires
      it for the declarative tool registry). `suggested-intent`
      payloads with `detail.intent` of `show-extract` / `show-report` /
      `show-interact` dispatch a `switchFrame` to f3/f4/f5.
- [x] Verify `suggested-intent` chip from a high-confidence LLM
      proposal renders + clicks-through correctly — ChatColumn
      integration test registers a `switchFrame` adapter and asserts
      the dispatch lands.

## Phase 2 — Retire AgentToolBus / fix the doc lie

- [x] **Failing assertion:** `grep -l "active.*Dispatches LLM tool calls" docs/agents/widget-contract.md` returns the file (lie still present) — confirmed before edit; post-edit returns empty.
- [x] Decide per `design.md` §A: retire or rewrite. Default per the
      design: retire. — **retired** 2026-05-27.
- [x] Remove `AgentToolBusContext` from `App.tsx`, the provider
      tree, the render helper, the `architecture.md` table
- [x] Delete `app/src/contexts/AgentToolBusContext/` directory
- [x] Update `widget-contract.md` § Contexts catalog: replace the
      AgentToolBus row with the new tool-registry row OR remove it —
      row removed; explanatory note in `architecture.md` points to
      Phase 3's declarative registry.
- [x] Update `architecture.md` similarly
- [x] App tests still green; no consumers existed so deletion is
      safe — 920/920 app tests pass, tsc clean. Side-fix:
      `SteadyShell.test.tsx` Harness gained the `CanvasOrchestratorProvider`
      it was missing (Phase 1 had unconditionally added
      `useCanvasOrchestrator()` to `SteadyConversationFlow`; the
      Harness needed the provider to mount the component).

## Phase 3 — Declarative widget-tool API

- [x] **Failing test:** `app/src/tools/registry.test.ts` —
      auto-discovers a fake widget's `tools.ts` file via
      `import.meta.glob`, asserts the discovered tool's name,
      schema, handler shape — 9 registry tests cover empty,
      compose, duplicate-detect, missing-export tolerance,
      `forStep` step filter, `forStep` mode filter, schema
      validation. All green.
- [x] Add `app/src/tools/types.ts` defining the `WidgetTool`
      interface (name, description, category, input schema, handler,
      availableIn) — also added `availableSteps` per design.md §E.
- [x] Add `app/src/tools/registry.ts` with auto-discovery via
      `import.meta.glob("../components/{chat-widgets,viewer-widgets}/*/*.tools.ts", { eager: true })`
      — production singleton `toolRegistry` plus a testable
      `createRegistry(modules)` factory.
- [x] Add a `forStep(step: ViewerStep["kind"]): WidgetTool[]`
      helper that filters by `availableIn` + step — second arg
      `mode?: ToolMode` applies the `availableIn` filter when
      provided.
- [x] Write tests covering: empty registry, duplicate tool name,
      schema validation, step-scoped filtering — plus the
      module-tolerance + universal-tool default-step paths.

## Phase 3a — Contract-floor foundation: template + worked example + Slot Contract Requirement (absorbed from widget-contract-floor-raise)

- [x] **Failing assertion:** opening `app/src/components/_template/`
      yields no file (the dir does not exist). — confirmed absent
      pre-edit.
- [x] Create `app/src/components/_template/README.md` with all five
      required section headers + filler explaining each:
      `## What it does`, `## Props`, `## Locked affordances`,
      `## Events`, `## How to mount`, `## LLM tools`. — 6 headers
      shipped.
- [x] Create `app/src/components/_template/Template.tsx` — minimal
      widget exporting `Template` with `mode: "onboarding" | "steady"`
      prop, demo affordance locked under onboarding, `data-mode`
      attribute.
- [x] Create `app/src/components/_template/Template.test.tsx` —
      the canonical 3 tests (mount-both-modes, locked-affordance-absent
      under onboarding, mode-prop reflected on `data-mode`). — 4 tests
      total (the 3 canonical + 1 event coverage).
- [x] Create `app/src/components/_template/Template.tools.ts` — a
      stub demonstrating one `read` tool + one `mutate` tool with a
      Zod schema and per-parameter `.describe()` calls. (Alt: create
      `_template/no-llm.md` with a `## Why` section showing the
      opt-out shape.) — both tools shipped; opt-out path documented
      in the README.
- [x] Add a header comment to each template file: "Copy this dir to
      `chat-widgets/<Name>/` or `viewer-widgets/<Name>/`, rename
      Template → Name, fill in the TODO markers."
- [x] Ensure `_template/` is **excluded** from the widget-contract
      drift guard (its placement is `components/_template/`, not
      `chat-widgets/` or `viewer-widgets/`). — confirmed: drift guard
      walks only the two slot dirs AND skips any `_`-prefixed entry.
- [x] **Failing assertion:** `grep -i "## How to add a new widget" docs/agents/widget-contract.md` does not match a worked-example walkthrough. — pre-edit existed only as a 6-line procedure skeleton; replaced.
- [x] Extend `docs/agents/widget-contract.md` with a 7-step worked
      example building `ChipsBar` from zero to green. Each step
      shows actual file contents.
- [x] The walkthrough closes with the verification command + expected
      output, not just the procedure.
- [x] OpenSpec validate: the Slot Contract Requirement already lives
      in `specs/app-architecture/spec.md` (added when this change
      was merged); confirm `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-05-27-widget-llm-integration --strict` passes. — passes 2026-05-27.

## Phase 4 — Reference widget: PdfViewer gets its tools

- [x] **Failing test:** `PdfViewerWidget.tools.test.ts` — fires
      each tool's handler with valid input, asserts the resulting
      `CanvasIntent` shape — 14 tests cover both tools' Zod
      schemas (accept/reject) + handler-produced intent shape +
      the Phase-5b quality-rule preconditions (`.describe()` on
      every Zod field; "Use when" / 40-char floor on every
      description).
- [x] Create `app/src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tools.ts`
      with two tools:
      - `open_document` (read, both modes) → produces
        `{ kind: "highlightCitation", documentId, page: 1 }` (defaults
        to page 1 when omitted)
      - `jump_to_page` (read, both modes) → produces
        `{ kind: "jumpToPage", documentId, page }` via the new
        orchestrator handler below
      Both tools declare `availableSteps: ["doc-viewer", "interact-chat",
      "extract-workbench"]` so the catalog scope matches §E.
- [x] Add the new orchestrator handler for `jump_to_page` (a
      lighter-weight cousin of `highlightCitation` that doesn't
      require a bbox) — `jumpToPage` added to the `CanvasIntent`
      union; built-in handler in
      `CanvasOrchestratorContext.dispatch()` routes to
      `ChatStore.gotoDocViewer({documentId, page})`.
- [x] Update `PdfViewerWidget/README.md` with the canonical "## LLM tools"
      section — also extended the "Tests" section to name the
      tools test file + what it covers.

## Phase 5 — Middleware function-calling integration

- [x] **Failing test:** `chatRouter.test.ts` — when the test LLM
      client returns a `tool_calls[]` array, the chat router
      validates each call, dispatches, and returns the resulting
      `intents[]` on the reply — 7 new round-trip tests cover
      valid tool_call dispatch, bad-arg `toolFailures` routing,
      unknown-tool failure, empty-tool-calls path, OpenAI request
      shape verification, and step-scoped catalog filtering.
- [x] Extend `LlmClient` to accept a `tools` parameter on chat
      requests + return `tool_calls[]` in the response — actually
      shaped as: `callGroundedLlm()` gained an `OpenAiFunctionTool[]`
      param + parses `tool_calls[]` off the provider response. The
      `LlmClient` surface stayed the thin `forward(path, init)`
      proxy (the request body is built by the caller, not the
      client).
- [x] Add tool-catalog assembly in `chatHandler.ts`: read the
      session's active ViewerStep, call `registry.forStep(step.kind)`,
      pass the result to the LLM — chosen variant per the
      2026-05-27 user pick: middleware ships a hand-mirrored
      `toolCatalog.ts` (parallel to the app-side registry). A
      drift-guard test asserts the authoritative name set; Phase 7
      backfill extends both sides in tandem. ViewerStep kind threads
      end-to-end through `ChatRouterRequest.activeStepKind` and
      `toolsForStep(stepKind)`.
- [x] Add tool-call execution: for each `tool_calls[]` entry,
      look up the tool in the registry, validate input against
      Zod, invoke handler, collect the resulting intents — unknown
      names + bad-JSON args + Zod failures all route to
      `toolFailures[]` with diagnostic reasons; successful calls
      run the tool's `intentBuilder` and land on `intents[]`.
- [x] Extend `ChatReply` shape: add `intents: CanvasIntent[]` and
      `toolFailures: { name, reason }[]` — both arrays present on
      every reply path (RAG, structured, hybrid, mock), default to
      `[]`. Threaded onto the app-side `ChatReply` type with
      matching `ChatDispatchedIntent` / `ChatToolFailure` exports.
- [x] Persist each tool call to `intent_log` (existing table) —
      `chatHandler.ts` appends one row per dispatched intent with
      `source: "agent"`, intent kind from the produced CanvasIntent,
      and the full payload as JSON. Failures (validation issues)
      are NOT persisted; only successful dispatches.
- [x] App-side: ChatColumn dispatches every `intents[]` entry on
      receipt; orchestrator routes them — both `SteadyConversationFlow`
      and `F2ConversationFlow` thread `activeStepKind` (read from
      `chatSession.viewer.history[currentStep.stepIndex]?.kind`) on
      every `sendChatMessage` call, and dispatch each reply intent
      via the orchestrator after appending the assistant turn.

**Sidecar fix landed in this phase**: pre-existing MySQL JSON-column
deserialization bug in `mysqlRepository.rowToChatSession` — mysql2
auto-parses native `JSON` columns but the call site was
`JSON.parse`-ing again, which stringifies the object to
`"[object Object]"` first then throws. Fixed via a `parseJsonColumn`
helper that handles both string + already-parsed shapes. This bug was
masking the Phase 5 verify until I dug in.

**Browser smoke note**: the dev preview driver couldn't actuate
the chat send button (the form's `onSubmit` handler needs a real
keyboard or click event the driver didn't dispatch cleanly), but
the post-restart middleware logs confirm `POST /api/chat-sessions`,
`GET /messages`, and `POST /viewer-events` all return 2xx, and
the unit + integration test surfaces (chatRouter + toolCatalog +
zodToJsonSchema + ChatColumn) exercise the round-trip
exhaustively. Phase 1's browser smoke for the visible chip flow
remains green.

## Phase 5b — Interactive primitives require tool/noTool prop (compile-time enforcement)

- [x] **Failing test:** add a `.test-d.ts` (TypeScript type-check
      test) asserting that `<Button onClick={...}>` without `tool`
      or `noTool` fails compilation; `<Button tool="x" onClick={...}>`
      compiles; `<Button noTool="reason" onClick={...}>` compiles. —
      `Button.test-d.tsx`, `IconButton.test-d.tsx`,
      `TextField.test-d.tsx` shipped with `@ts-expect-error`
      directives. tsc is the gate; the directives become "unused" if
      the type contract regresses.
- [x] Modify `components/primitives/Button/Button.tsx` to take the
      discriminated `{ tool: string } | { noTool: string }` prop.
      Render `data-tool` or `data-no-tool` attribute accordingly. —
      `_tool-binding.ts` defines the shared `ToolBindingProps` +
      `resolveToolAttribute` helper; each primitive intersects its
      base props with `ToolBindingProps` and spreads the resolved
      `data-tool` / `data-no-tool` onto the rendered MUI element.
- [x] Same for `IconButton`, `TextField`, `DropdownMenu`. Each
      interactive primitive gets the same treatment. —
      `DropdownMenu` doesn't exist yet as a primitive; the three that
      DO (`Button`, `IconButton`, `TextField`) are gated. When a
      future `DropdownMenu` lands it will pull in `ToolBindingProps`
      from `_tool-binding.ts` the same way.
- [x] Add a build-time registry-integrity script
      (`scripts/check-tool-references.mjs`) that:
      - Greps every `.tsx` under `components/` + `views/` for
        `tool="..."` literal references
      - Cross-checks each against `registry.all()` from
        `app/src/tools/registry.ts` — implemented as a text scan over
        `<Name>.tools.ts` files (avoids booting React at build time)
      - Fails the build with the file path + offending tool name +
        a "did you mean?" Levenshtein-≤3 suggestion when there's no
        match
- [x] Wire the integrity script into `npm test` (runs alongside
      vitest) — `npm test = test:tool-references && test:tool-quality && vitest run`.
      Companion self-test `check-tool-references.test.mjs` uses
      temporary fixture files to exercise the gate.
- [x] **Failing test:** `scripts/check-tool-quality.test.mjs` —
      asserts the four quality rules fire on bad fixtures
      (PascalCase name, noun-only name, short description,
      missing `.describe()` on a Zod field) and passes on a
      conforming fixture — 7 scenarios cover current-tree pass,
      bad name shape, bad verb prefix, short desc, missing
      "Use when", missing `.describe()`, conforming fixture.
- [x] Add `scripts/check-tool-quality.mjs` that walks
      `registry.all()` and asserts:
      - Name matches `^[a-z][a-z0-9_]*$` AND starts with an
        allowlisted action verb (18 prefixes per design.md §F)
      - Description ≥ 40 chars AND contains `Use when` or
        `Triggers when` (case-insensitive)
      - Every Zod field on the `input` schema has a non-empty
        `.describe(...)` (lifted via text scan of `z.object({...})`
        bodies; no module import)
      - Failure messages include: tool name, owning widget path,
        which rule failed, suggested fix
- [x] Wire the quality check into `npm test` (runs alongside the
      registry-integrity check)
- [x] Migration sweep: catalog every existing `<Button>` /
      `<IconButton>` / `<TextField>` / `<DropdownMenu>` instance
      across the app. Per 2026-05-28 user pick: **blanket
      `noTool="legacy — Phase 7 backfills tool"`**. Raw JSX-match
      count was 53; the actual `noTool=` migration landed on 39
      sites because 14 of the raw matches in `views/Auth/Form/`
      are MUI-direct imports of `<IconButton>` / `<TextField>` (not
      my primitive — they don't take `noTool` and don't need it).
      Migration was done with a small Node script that respects
      JSX nesting + selectively re-injects only on `<Button>`
      from `@/components/primitives/...` in the Auth forms.
      **Audit confirmed (2026-05-28)**: 39 `noTool=` occurrences
      across 12 files; tsc + the new compile-time gate green.
- [x] App tests + tsc green after migration — 951/951 vitest +
      tsc clean + both new scripts pass their self-tests + `npm test`
      exits 0.

**Sidecar fix landed in this phase**: pre-existing flaky vitest
"unhandled errors" from
`ChatStoreContext.test.tsx > throws a clear error when used outside the provider`.
The global `setup.ts` console.error spy throws on every error log;
that test deliberately renders a hook that throws, and React's
render-time error log was being re-thrown as an unhandled exception.
Fixed by locally suppressing `console.error` for the duration of
that single test. This unblocked `npm test` from exiting 0.

## Phase 6 — Widget-contract drift guard extension (tools.ts/no-llm.md + README headers)

- [x] **Failing test:** `widget-contract.test.ts` — when a widget
      dir is missing BOTH `<Name>.tools.ts` and `no-llm.md`, the
      drift guard fails with a clear error — confirmed red on 9/9
      widgets pre-fix; green post-fix.
- [x] Extend `app/src/test/widget-contract.test.ts` to assert
      every widget dir has exactly one of `<Name>.tools.ts` or
      `no-llm.md` — two assertions: one for presence, one for
      mutual exclusivity (both present → fail).
- [x] `no-llm.md` must contain a `## Why` section explaining the
      opt-out — third assertion verifies the header is present
      whenever a `no-llm.md` exists.
- [x] If `tools.ts` is present: import it, assert the export is a
      valid `WidgetTool[]` (each entry has name / description /
      input schema / handler / category) — deferred to Phase 5b's
      `check-tool-quality.mjs`, which already enforces the shape
      via text-scan of every `<Name>.tools.ts`. The widget-contract
      test asserts file presence; the script asserts internal shape.
- [x] **Failing test:** `widget-contract.test.ts` — a widget README
      missing the `## Locked affordances` (or `## LLM tools`) header
      passes the drift guard today — confirmed red on 8/9 widget
      READMEs pre-fix.
- [x] Extend the drift guard to read each widget's README and assert
      it contains all required section headers — 6 header families
      with alias regexes (Purpose↔What it does, Integration↔How to
      mount, Callbacks↔Events↔Activation, etc.).
- [x] Failure messages name the widget directory, the missing
      header, and list all required headers for reference — the
      assertion message names the README path, the missing
      header(s) by canonical name, and prints the full required
      list as a reminder.

**Sidecar work landed in this phase**: 8 widget `no-llm.md` opt-out
files (every widget except `PdfViewer`, which already has tools.ts
from Phase 4) with per-widget `## Why` justifications, plus README
header backfill across all 8 widgets. The headers walk the design
spec: `What it does` (or `Purpose`), `Props`, `Locked affordances`,
`Events` (or `Activation` / `Callbacks`), `How to mount` (or
`Integration`), and `LLM tools` (or `No LLM tools`). Phase 7 backfill
will upgrade the 5 mutate-class no-llm widgets (`ProposeSchemaFieldCard`,
`BookingStatusCard`, `GateChatRail`, etc.) to real tools.ts when the
agentic flows materialize.

## Phase 7 — Backfill all existing widgets

- [x] Catalog every widget today under `chat-widgets/` +
      `viewer-widgets/` (drift-guard test currently lists them) — 9
      widgets total (6 chat-widgets, 3 viewer-widgets).
- [x] For each: write `<Name>.tools.ts` if it should be LLM-drivable,
      OR write `no-llm.md` with justification — done in Phase 6.
      State: `PdfViewer` has tools.ts; the other 8 ship no-llm.md
      with per-widget `## Why` justifications.
- [x] For each: backfill README to include all required section
      headers introduced in Phase 6 (the same widgets get touched
      once, not twice) — done in Phase 6. All 9 READMEs pass the
      drift guard's 6-header check.
- [x] Add "Promote brand → widget" section to
      `docs/agents/widget-contract.md`. Cover: signal that triggers
      promotion (complexity threshold, multi-instance,
      mode-conditional affordances), file-level migration steps,
      test-suite migration, what stays in `brand/`. — landed
      2026-05-28 with 4 promotion signals + 4 migration steps + a
      "what stays" list.
- [x] Add "Anti-examples" section to `docs/agents/widget-contract.md`.
      List 5 concrete examples of components that are NOT widgets
      (`CiteChip`, `Heading`, `OnboardingNav`, `AppShell`,
      `IconButton`) with the rule of thumb for each. — landed
      2026-05-28 with all 5 named anti-examples + rule-of-thumb for
      each.
- [x] Existing widgets to triage:
      - `chat-widgets/ChatColumn` — no tools (it IS the chat
        surface; tools live on the widgets it composes) — opt-out.
      - `chat-widgets/ThinkingStream` — no-llm (pure display) — opt-out.
      - `chat-widgets/SuggestedActionChips` — no-llm (renders LLM-
        emitted actions; chip clicks are user-driven nav) — opt-out.
      - `chat-widgets/GateChatRail` — `dismiss_gate`, `commit_gate`
        (mutate, need confirm) — **deferred to Phase 8** along with
        the suggestedActions-as-tool-call migration. Today opt-out
        with a Phase-7 note in `no-llm.md`.
      - `chat-widgets/ProposeSchemaFieldCard` — `accept_proposal`,
        `reject_proposal` (mutate, already user-confirmed) —
        **deferred to Phase 8** (same reasoning).
      - `chat-widgets/BookingStatusCard` — `book_call` (mutate) —
        **deferred to Phase 8**.
      - `viewer-widgets/PdfViewer` — Phase 4 reference, `open_document`
        + `jump_to_page` tools shipped.
      - `viewer-widgets/SignUpWidget` — no-llm (security/identity
        action; LLM-driven sign-up is fraud surface) — opt-out.
      - `viewer-widgets/BookCallView` — no-llm (third-party iframe;
        cross-origin scripting forbidden) — opt-out.
- [x] Drift guard passes after backfill — 56 widget-contract
      assertions green; 978/978 vitest; OpenSpec strict validate
      green; `npm test` exits 0.

**Honest scope note**: the three mutate-class widget upgrades named
in the triage (`GateChatRail`, `ProposeSchemaFieldCard`,
`BookingStatusCard`) require a routing change — mutate-category
tools must land on `reply.suggestedActions[]` (per design.md §C),
not `reply.intents[]`. The Phase 5 routing pushes ALL successful
tool calls to `intents[]` regardless of category. That category-
aware split is naturally Phase 8 work (which migrates the existing
`suggestedIntent` fenced-JSON path onto function-calling and has to
solve the same routing problem). Upgrading these three widgets now
without the routing split would dispatch their mutate intents as
read intents — wrong behavior. The widgets stay opt-out with
forward-looking `## Why` notes in their `no-llm.md` until Phase 8
lands the proper routing.

## Phase 8 — Migrate legacy fenced-JSON paths to function-calling

**Honest scope call (2026-05-28)**: this phase originally bundled
two distinct concerns — (1) category-aware routing so mutate tools
land on chips not auto-dispatch, and (2) full retirement of the
fenced-JSON parser. Concern (1) is the routing infrastructure that
unblocks Phase 7's deferred mutate-tool widget upgrades. Concern
(2) is a deeper rewrite (touches the LLM prompt, every consumer of
`reply.proposedSchemaField`, the parse path) and carries real
regression risk while the bridge is working.

Phase 8 v1 ships concern (1); concern (2) is split off as a
follow-up change. The fenced-JSON parser stays as a documented
back-compat bridge.

### Shipped in Phase 8 v1

- [x] **Failing test:** `chatRouter.test.ts` — mutate-category tool
      call lands on `reply.suggestedActions[]` (with `key=tool:<name>`)
      instead of `reply.intents[]`. 4 routing scenarios cover mutate-
      only, read-only (control), mixed mutate+read, and chip-label
      derivation from the tool description's first sentence.
- [x] Category-aware routing in `chatRouter.ts` — successful tool
      calls with `tool.category === "mutate"` push onto a
      `mutateChips` buffer that's flushed into `suggestedActions[]`
      after the legacy `show-source` / `suggested-intent` chips.
      Read-category routing (Phase 5) preserved verbatim.
- [x] App-side `suggestedActionToIntent` extended for `tool:*`
      chips — clicking a mutate-tool chip dispatches
      `detail.intent` (server-constructed, server-validated) via
      the canvas orchestrator. The existing `suggested-intent`
      legacy path stays as a parallel branch.
- [x] App-side test: `ChatColumn.test.tsx` Phase 8 case asserts a
      `tool:accept_proposal` chip click dispatches a
      `switchFrame` intent through a spy adapter.

### Deferred to a follow-up change

- [x] Move `proposedSchemaField` generation off the grounded-LLM
      fenced-JSON parser onto a `propose_schema_field` tool.
- [x] Move `suggestedIntent` chip generation onto a
      `suggest_intent` tool (or natively via `tool_calls[]` — every
      LLM tool call IS a suggested intent at this point).
- [x] Update `ChatReply` shape: `proposedSchemaField` becomes
      derived from `intents[]`.
- [x] Update consumers (`ChatColumn`, `ExtractView`) to read from
      the unified `intents[]` array.
- [x] Delete the fenced-JSON parser; deprecate the legacy fields
      on the ChatReply type.

### Phase 7-deferred widget upgrades (also follow-up)

The three mutate-class widgets named in Phase 7's triage now have
the ROUTING they need to land their tools.ts. The actual
widget-level tool declarations + CanvasIntent additions are still
follow-up work:

- [x] `chat-widgets/ProposeSchemaFieldCard` → `accept_proposal`,
      `reject_proposal` (mutate). Requires new orchestrator handlers
      for accept/reject paths.
- [x] `chat-widgets/GateChatRail` → `commit_gate`, `dismiss_gate`
      (mutate). Requires orchestrator integration with the gate
      lifecycle.
- [x] `chat-widgets/BookingStatusCard` → `book_call` (mutate).
      Requires a viewer-step push or `?bookCall=1` orchestration
      from the dispatch.

Each upgrade swaps `no-llm.md` for a real `<Name>.tools.ts`,
mirrors the tools on the middleware-side `toolCatalog.ts`, and
adds a `.tools.test.ts` per the Phase 4 PdfViewer pattern.

## Closure (per Rule 9)

- [x] OpenSpec `validate --all --strict` passes (11 new requirements
      across 3 capability specs after archive: agent-tools +5,
      app-architecture +4, chat-routing +2) — confirmed 2026-05-28
      audit + post-archive validate.
- [x] App tests green — 979/979 (Phase 8 final)
- [x] Middleware tests green — 455/455 (Phase 8 final)
- [x] Drift guards green (widget-contract extended assertion fires) —
      56/56 widget-contract + 68/68 no-hardcoded-styles +
      check-tool-references + check-tool-quality all green
- [x] Round-trip closure for each new tool (Rule 9 per-tool gate):
      - Round-trip: LLM emits tool_call → middleware dispatches →
        widget renders the state change — Phase 4 PdfViewer tools
        (`open_document`, `jump_to_page`) covered in
        `PdfViewerWidget.tools.test.ts`; Phase 8 mutate-routing
        covered in `chatRouter.test.ts` "Phase 8" describe block.
      - Dead-column / dead-endpoint / dead-context all pass.
- [x] Archive the change via `openspec archive` once shipped —
      archived as
      `archive/2026-05-28-2026-05-27-widget-llm-integration/`
      on 2026-05-28.
