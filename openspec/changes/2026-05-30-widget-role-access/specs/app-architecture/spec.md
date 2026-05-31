# Spec Delta — app-architecture (widget access by role)

Replaces the binary widget `mode: "onboarding" | "steady"` lock with a `WidgetRole` enum read through a
single central lock policy. Authorization, not a chat phase.

## MODIFIED Requirements

### Requirement: Every widget SHALL conform to the slot contract

Every component placed under `app/src/components/chat-widgets/<Name>/` or `app/src/components/viewer-widgets/<Name>/` SHALL satisfy all six rules below. The drift-guard test at `app/src/test/widget-contract.test.ts` enforces them programmatically.

1. **Single default export** — the directory SHALL contain a `<Name>.tsx` file whose default-exported React component is the consumer-facing entry point, named after the directory.

2. **Role prop** — the default-exported component's props type SHALL include a `role: WidgetRole` field (the `WidgetRole` enum is the source-of-truth Zod enum in `@groundx/shared`; today `"anonymous" | "member"`, extensible). When `widgetRoleCanEdit(role)` is false (i.e. `isWidgetReadOnly(role)`), editable affordances (input bars, save buttons, edit toolbars, etc.) SHALL be hidden or disabled; read-only viewing SHALL remain functional. The widget SHALL determine the lock via the shared `widgetRoleCanEdit`/`isWidgetReadOnly` policy, NOT by testing a role literal directly. Tool catalog scoping (`availableIn`) parallels this lock — see the LLM tool surface Requirement below. The legacy `mode: "onboarding" | "steady"` prop SHALL NOT appear in any widget.

3. **Sibling README with required section headers** — a `README.md` SHALL sit alongside the `.tsx` file. The README SHALL contain section headers for: what the widget does + its slot, props (required + optional), locked affordances under read-only roles, events / callbacks fired, and a one-line integration example. The drift guard SHALL enforce header presence, not just file presence.

4. **Sibling test** — a `<Name>.test.tsx` SHALL sit alongside the `.tsx` file. The test SHALL cover: mounting under a read-only role (`"anonymous"`) and an edit role (`"member"`) without crashing; locked affordances absent / disabled under a read-only role and present under an edit role; and any events the widget fires on user action.

5. **Dependency direction** — the widget SHALL compose only from `app/src/components/primitives/`, `app/src/components/brand/`, or `app/src/components/layout/`. Widgets SHALL NOT import from other widget slots OR from `app/src/views/`.

6. **Scope prop (required, intentional)** — the default-exported component's props type SHALL include a required `scope: WidgetScope` field, where `WidgetScope = ContentScope | { type: "none" }` (`@groundx/shared`). A widget SHALL either target a real `ContentScope` (`bucket` / `group` / `documents`, optionally `+ filter`) or explicitly declare `{ type: "none" }`; it SHALL NOT omit `scope` and SHALL NOT take a raw `documentId` / `bucketId` / `projectId` in its place. ScopedViewerWidgets (PdfViewer · Extract · SmartReport · Integrate) SHALL narrow `scope` to a non-`none` `ContentScope`. The `none` variant SHALL NOT appear in `ContentScope` itself (it is widget-only; data-call `ContentScope` consumers never receive it).

#### Scenario: Drift guard fires when a widget directory is missing its sibling files

- **GIVEN** a new directory `app/src/components/chat-widgets/ChipsBar/` containing only `ChipsBar.tsx`
- **WHEN** `npx vitest run app/src/test/widget-contract.test.ts` executes
- **THEN** the test fails with an error naming the missing `README.md`
- **AND** the same drift guard fails with an error naming the missing `ChipsBar.test.tsx`

#### Scenario: Drift guard fires when the README is missing a required section header

- **GIVEN** `chat-widgets/ChipsBar/README.md` exists but lacks the `## Locked affordances` header
- **WHEN** the drift guard runs
- **THEN** the test fails naming the widget directory and the missing header
- **AND** the error lists all required headers for reference

#### Scenario: Drift guard fires when the widget's component is missing the role prop

- **GIVEN** `chat-widgets/ChipsBar/ChipsBar.tsx` exports a component whose props type lacks `role`
- **WHEN** the drift guard runs
- **THEN** the test fails with an error naming the widget directory and the missing `role` prop

#### Scenario: Drift guard fires when a widget still declares the legacy mode prop

- **GIVEN** `chat-widgets/ChipsBar/ChipsBar.tsx` still declares `mode: "onboarding" | "steady"`
- **WHEN** the drift guard runs
- **THEN** the test fails naming the widget directory and instructing migration to `role: WidgetRole`

#### Scenario: Drift guard fires when a widget is missing the scope prop or takes a raw id

- **GIVEN** `chat-widgets/ChipsBar/ChipsBar.tsx` exports a component whose props type lacks `scope`, OR declares a raw `documentId` / `bucketId` / `projectId` prop instead
- **WHEN** the drift guard runs
- **THEN** the test fails naming the widget directory and requiring a `scope: WidgetScope` prop (a real `ContentScope` or explicit `{ type: "none" }`)
- **AND** a scope-free widget passes by declaring `scope: { type: "none" }` (an intentional choice, not an omission).

#### Scenario: Drift guard accepts a fully-conforming widget

- **GIVEN** `chat-widgets/ChipsBar/` contains `ChipsBar.tsx` (default export with `role` prop), `README.md` (with all required section headers), and `ChipsBar.test.tsx`
- **WHEN** the drift guard runs
- **THEN** the test passes for that directory

### Requirement: Every widget SHALL declare its LLM tool surface

Every component placed under `app/src/components/chat-widgets/<Name>/` or `app/src/components/viewer-widgets/<Name>/` SHALL ship EITHER a sibling `<Name>.tools.ts` file declaring its LLM-callable tools OR a sibling `no-llm.md` file explicitly opting out. The drift-guard test at `app/src/test/widget-contract.test.ts` SHALL enforce this — silent omission of both files fails the build.

A `<Name>.tools.ts` exports `tools: WidgetTool[]` where each tool carries:

- `name: string` — snake_case LLM-facing function name
- `description: string` — what the tool does, written for the LLM
- `category: "read" | "mutate"` — whether the tool mutates persisted state
- `input: z.ZodSchema` — Zod schema for input validation at the middleware boundary
- `handler: (input) => CanvasIntent` — produces an intent to dispatch
- `availableIn?: WidgetRole[]` — role scoping. The chat router SHALL expose a tool when `availableIn` is undefined or empty (meaning all roles) OR the caller's role is in `availableIn`. Tool visibility SHALL NOT depend on `category`: `read`/`mutate` drives the confirmation model (auto-run vs. confirm), not authorization. Whether a mutation is persisted SHALL be enforced at the save/commit boundary (server-side and the signup gate), not by hiding tools — so onboarding's `mutate` propose/accept/reject tools remain available to the anonymous role.

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

#### Scenario: Onboarding's mutate tools stay visible to the anonymous role

- **GIVEN** the `mutate`-category tools `propose_schema_field` / `accept_proposal` / `reject_proposal`, none with an `availableIn`
- **WHEN** the chat router builds the tool catalog for a caller whose role is `"anonymous"`
- **THEN** all three are exposed (no `availableIn` = all roles; `category` does not affect visibility)
- **AND** onboarding's propose/accept/reject interaction is available to the not-yet-signed-up user.

#### Scenario: A role-restricted tool is hidden from other roles

- **GIVEN** `edit_template` with `availableIn: ["member"]`
- **WHEN** the chat router builds the tool catalog for a caller whose role is `"anonymous"`
- **THEN** `edit_template` is NOT exposed (anonymous is not in `availableIn`)
- **AND** it IS exposed for a caller whose role is `"member"`.

## ADDED Requirements

### Requirement: Widget + tool access SHALL be governed by a recorded access matrix

Per-widget and per-tool access SHALL be recorded in a single access matrix (`docs/agents/widget-access-matrix.md`)
that is the source of truth across three axes: **(1) widget availability** — which roles ever mount the
widget (e.g. the gate/sign-up widgets are anonymous-only), enforced at the mount site from session/gate
state; **(2) affordance locks** — within a visible widget, which roles may use each editable control —
plus which roles each tool is `availableIn`; and **(3) scope** — each widget's `scope` stance: a real
`ContentScope` (with its source) or the intentional `{ type: "none" }`. Every widget and every declared tool SHALL appear in the
matrix — a coverage test SHALL fail the build if any is absent, so access decisions cannot be omitted by
accident. Each widget's availability and read-only/editable behavior per role SHALL match its matrix row,
asserted by that widget's sibling test. The migration from the legacy `mode` lock SHALL default each row
to preserving the pre-migration behavior; any deviation SHALL be a deliberate, recorded decision, not an
implicit side effect of the rename. Where `mode` encoded flow/phase behavior rather than authorization
(replay persistence, layout chrome, flow dispatch), the migration SHALL re-source that behavior from its
proper input, NOT rename it to `role`.

#### Scenario: A widget or tool missing from the matrix fails the build

- **GIVEN** a widget directory or a `*.tools.ts` tool with no row in `widget-access-matrix.md`
- **WHEN** the coverage test runs
- **THEN** it fails, naming the widget/tool absent from the matrix.

#### Scenario: A widget's lock behavior matches its matrix row

- **GIVEN** a widget whose matrix row marks an affordance editable for `"member"` and locked for `"anonymous"`
- **WHEN** the widget's sibling test mounts it under each role
- **THEN** the affordance is present/enabled for `"member"` and hidden/disabled for `"anonymous"`
- **AND** this matches the matrix row exactly.

#### Scenario: An anonymous-only widget does not mount for a member

- **GIVEN** a widget whose matrix availability row is anonymous-only (e.g. `SignUpWidget`, `GateChatRail`, `GateValueProp`)
- **WHEN** the surface resolves what to mount for a `"member"` (signed-in) session
- **THEN** that widget is not mounted
- **AND** it IS available for an `"anonymous"` session.
