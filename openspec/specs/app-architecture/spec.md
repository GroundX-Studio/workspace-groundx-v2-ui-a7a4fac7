# app-architecture Specification

## Purpose

Define the durable architecture invariants of the scaffold — view-thinness
(≤20 LOC of logic per F-series view, with rendering delegated to
production widgets), the widget contract slot taxonomy, and the
ChatStore-as-root context tree. Cross-cuts UI views, contexts, and the
middleware façade.
## Requirements
### Requirement: F3-F7 production-widget collapse SHALL reduce each view to ≤20 LOC of logic

ExtractView, InteractView, and IntegrateView SHALL each be reduced to
the same `≤20 LOC logic body` shape that UnderstandView already meets,
once their respective production widgets ship (UI-01, UI-05, UI-02).
Until those widgets land, this requirement remains in partial state.

#### Scenario: View collapse closure check

- **WHEN** the production widget for a view (e.g. UI-02 for IntegrateView) ships
- **THEN** the view's `.tsx` body SHALL be reduced to ≤20 LOC of logic, with everything else delegated to the widget
- **AND** `grep -c '^' views/Onboarding/<View>.tsx` (post-collapse) confirms the bound

### Requirement: Onboarding overlay SHALL animate out on sign-up commit

When the user completes sign-up, the StepStrip SHALL slide out with a
motion-config-respecting transition AND the canvas header slot SHALL
empty, transitioning the user into the standard product surface.

#### Scenario: Graduation animation

- **GIVEN** the user finishes sign-up via the F6 gate
- **WHEN** the gate transitions to `committed`
- **THEN** StepStrip animates out (or instant when `prefers-reduced-motion: reduce`)
- **AND** the canvas-header slot empties on the next render

### Requirement: views/Auth/ SHALL be audited and dead pages deleted

The `scaffold/app/src/views/Auth/` directory SHALL be audited after
AU-01 / AU-02 ship. The existing
directory (Login, Register, ForgotPassword, ResetPassword, AuthLayout,
Form) SHALL be audited; dead pages SHALL be deleted and load-bearing
pages SHALL be documented in `widget-contract.md` § views.

#### Scenario: Audit dead Auth pages

- **WHEN** AU-01 (magic-link) and AU-02 (SSO) ship
- **THEN** each `/auth/*` page is either documented (route + caller) or removed
- **AND** `widget-contract.md` § views table lists the survivors

### Requirement: contexts/ SHALL be audited and dead contexts deleted

The 18 contexts under `scaffold/app/src/contexts/` SHALL each be
audited after UI-05 follow-on work lands: the 8 scaffold-
default Partner-API state holders that the product doesn't use SHALL
be deleted; the rest SHALL be annotated with their consumer.

#### Scenario: Context audit closure

- **WHEN** UI-05 SteadyShell work continues into context cleanup
- **THEN** every context directory either has a documented consumer in
  the widget-contract table OR is deleted
- **AND** no unused context provider mounts in the App tree

### Requirement: ViewerSession SHALL be the master viewer-state record per chat session

Every `ChatSession` SHALL carry a paired `ViewerSession` slot containing `history: ViewerStep[]`, `currentStep: { stepIndex: number }`, `overlays: ViewerOverlay[]`, and `workspace` (schema overlay + future workspace state).

Frame surfaces SHALL be rendered by switching on `viewer.currentStep.kind`. `OnboardingShell.canvasContent` SHALL dispatch on the latest viewer step's kind, with a `stepKindFallback` projection from `session.currentFrame` for the initial-mount case before any step has been pushed. `useOnboardingSession().state.currentFrame` is preserved as a backwards-compat derived getter (driven by entity activation), but is NOT on the render hot path.

Schema overlay state continues to be available on BOTH `ChatSession.pendingSchemaOverlay` (legacy) AND `ViewerSession.workspace.schemaOverlay` (canonical), kept in lockstep by the provider's projected-state layer. Removing the legacy slot is deferred to a follow-up `schema-overlay-canonical-on-viewer` change.

#### Scenario: ViewerSteps drive the canvas switch

- **GIVEN** a session with `viewer.currentStep.kind === "extract-workbench"`
- **WHEN** `OnboardingShell` renders
- **THEN** `<ExtractView />` mounts (regardless of what `session.currentFrame` says)
- **AND** the legacy `currentFrame` is consulted only when no viewer step has been pushed yet

#### Scenario: pickScenario pushes a step matching the entity's resolved frame

- **GIVEN** an entity for `sample:utility` that already exists with `lastFrame: "f5"`
- **WHEN** `pickScenario("utility")` is called
- **THEN** the entity is re-activated (lastFrame is preserved at f5 — upsertAndActivate's existing semantics)
- **AND** the pushed viewer step is `interact-chat` (matching f5), NOT `doc-viewer` (the brand-new-entity default)

### Requirement: Transient surfaces SHALL render as overlays z-stacked over the current viewer step

The sign-up surface SHALL be represented as an entry in
`ViewerSession.overlays` (kind `sign-up`, state `pending | done |
dismissed`, optional `cause`). URL navigation to `/onboarding/signup`
SHALL push the overlay; navigation away SHALL pop it. The overlay is
the source of truth for the sign-up canvas swap.

The previous canvas-swap pattern in `OnboardingShell` — where
`gateActive` caused `<SignUpWidget />` to replace the entire canvas —
SHALL be replaced. `OnboardingShell` SHALL read the overlay stack
first; the legacy `gate.status` slot remains as a transitional bridge
for the chat-side `GateChatPanel` and intent-driven `openGate(...)`
flows until a follow-up change retires it.

#### Scenario: URL navigation to /onboarding/signup pushes a sign-up overlay

- **GIVEN** the user is on F1 with no overlays
- **WHEN** the user navigates to `/onboarding/signup`
- **THEN** a `{ kind: "sign-up", state: "pending" }` overlay is pushed
- **AND** `OnboardingShell.signupSurfaceActive` becomes true
- **AND** `<SignUpWidget />` mounts on top of the (still-mounted) F1 picker

#### Scenario: Navigating away from /onboarding/signup pops the overlay

- **GIVEN** the sign-up overlay is present
- **WHEN** the user navigates to `/onboarding`
- **THEN** the sign-up overlay is popped
- **AND** subsequent sample-pick navigates the canvas to F2 without the overlay blocking it — closing the user-reported "stuck signup screen" regression class

### Requirement: CanvasOrchestrator SHALL expose explicit chat→viewer and viewer→chat channels

`CanvasOrchestratorContext` SHALL provide two named channels for cross-side dispatch:

- **chat→viewer**: `openCitation(documentId, page, bbox?)`.
- **viewer→chat**: `docOpened({ documentId, fileName })`.

These named channels are convenience methods that close over `useChatStoreOptional()` so they are no-ops in trees where no `ChatStoreProvider` is mounted (preserving back-compat with standalone-canvas tests). The legacy `dispatch(intent)` + adapter-registry surface remains for cases where a more flexible kind-based routing is needed.

`appendViewerEvent` (LLM-context telemetry sink) is distinct from the bus and continues to handle telemetry without coupling to cross-side dispatch.

#### Scenario: Citation click pushes a citation-peek overlay

- **GIVEN** the chat surface renders an assistant turn with a citation chip referencing `documentId: "util-1", page: 3`
- **WHEN** `bus.openCitation("util-1", 3)` dispatches
- **THEN** a `{ kind: "citation-peek", documentId: "util-1", page: 3 }` overlay is pushed onto the active session's `viewer.overlays`

#### Scenario: Doc opened in viewer appends a chat message

- **GIVEN** the viewer opens a document via its doc switcher
- **WHEN** `bus.docOpened({ documentId: "util-1", fileName: "utility-bill.pdf" })` dispatches
- **THEN** an assistant chat message announcing the doc-open is appended to the active session's `messages` (with the `agent-` id prefix so ChatColumn projects it into the rendered conversation)

#### Scenario: Bus methods are no-ops without ChatStoreProvider

- **GIVEN** a `CanvasOrchestratorProvider` mounted WITHOUT a parent `ChatStoreProvider` (e.g. a standalone-canvas test)
- **WHEN** `bus.openCitation(...)` or `bus.docOpened(...)` fires
- **THEN** the call does not throw
- **AND** nothing is mutated (no overlays, no messages)

### Requirement: Every widget SHALL conform to the slot contract

Every component placed under `app/src/components/chat-widgets/<Name>/` or `app/src/components/viewer-widgets/<Name>/` SHALL satisfy all five rules below. The drift-guard test at `app/src/test/widget-contract.test.ts` enforces them programmatically.

1. **Single default export** — the directory SHALL contain a `<Name>.tsx` file whose default-exported React component is the consumer-facing entry point, named after the directory.

2. **Mode prop** — the default-exported component's props type SHALL include a `mode: "onboarding" | "steady"` field. When `mode === "onboarding"`, editable affordances (input bars, save buttons, edit toolbars, etc.) SHALL be hidden or disabled; read-only viewing SHALL remain functional. Tool catalog scoping (`availableIn`) parallels this lock — see the LLM tool surface Requirement below.

3. **Sibling README with required section headers** — a `README.md` SHALL sit alongside the `.tsx` file. The README SHALL contain section headers for: what the widget does + its slot, props (required + optional), locked affordances under `mode="onboarding"`, events / callbacks fired, and a one-line integration example. The drift guard SHALL enforce header presence, not just file presence.

4. **Sibling test** — a `<Name>.test.tsx` SHALL sit alongside the `.tsx` file. The test SHALL cover: mounting in both `mode` values without crashing; locked affordances absent / disabled when `mode === "onboarding"`; and any events the widget fires on user action.

5. **Dependency direction** — the widget SHALL compose only from `app/src/components/primitives/`, `app/src/components/brand/`, or `app/src/components/layout/`. Widgets SHALL NOT import from other widget slots OR from `app/src/views/`.

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

#### Scenario: Drift guard fires when the widget's component is missing the mode prop

- **GIVEN** `chat-widgets/ChipsBar/ChipsBar.tsx` exports a component whose props type lacks `mode`
- **WHEN** the drift guard runs
- **THEN** the test fails with an error naming the widget directory and the missing `mode` prop

#### Scenario: Drift guard accepts a fully-conforming widget

- **GIVEN** `chat-widgets/ChipsBar/` contains `ChipsBar.tsx` (default export with `mode` prop), `README.md` (with all required section headers), and `ChipsBar.test.tsx`
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

### Requirement: F1 overlay SHALL hide the underneath shell from assistive tech

The F1 IngestView overlay SHALL render as a full-viewport opaque pane covering the underneath AppShell, AND the underneath AppShell wrapper MUST be marked `aria-hidden="true"` and `inert` while the F1 overlay is mounted, so that screen readers and keyboard navigation do not surface the masked-out sidebar and chat-pane elements. The visual F1 chrome (no nav, no chat pane visible) is already achieved by the overlay; this requirement closes the a11y leak.

#### Scenario: F1 a11y tree exposes only the IngestView

- **GIVEN** the user is on `/onboarding` with `session.currentFrame === "f1"`
- **WHEN** assistive tech walks the page
- **THEN** the underneath shell wrapper has `aria-hidden="true"`
- **AND** the underneath shell wrapper has the `inert` attribute
- **AND** keyboard Tab does NOT focus elements inside the underneath shell.

#### Scenario: F2 restores the shell to the a11y tree

- **GIVEN** the frame transitions from f1 to f2
- **WHEN** the F1 overlay unmounts
- **THEN** the underneath shell wrapper has neither `aria-hidden` nor `inert`
- **AND** the sidebar nav, chat pane, and step strip are all reachable by assistive tech.

### Requirement: Step-strip sub-pills SHALL be keyboard-navigable when reachable

The step-strip Extract / Interact / Report sub-pills SHALL each render with `role="button"`, `tabindex="0"` when reachable, and an `onClick` handler that advances the canvas to the corresponding frame. Disabled
sub-pills MUST carry `aria-disabled="true"` and MUST NOT receive
focus. The current implementation renders them as plain `<div>`s with
no role / no handler, which blocks F3↔F5 navigation via the step
strip.

#### Scenario: Reachable sub-pill is clickable + focusable

- **GIVEN** the user has reached the Analyze step (Extract is the active sub-step)
- **WHEN** the step strip renders
- **THEN** the `Extract` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** the `Interact` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking `Interact` advances the canvas to F5 InteractView.

#### Scenario: Locked sub-pill is not focusable

- **GIVEN** the user is logged out and Report is sign-in-gated
- **WHEN** the step strip renders
- **THEN** the `Report` sub-pill has `aria-disabled="true"` and `tabindex="-1"`
- **AND** keyboard Tab does NOT focus it
- **AND** clicking it does not advance the frame.

### Requirement: Onboarding URL paths SHALL not throw the error boundary

A user landing on `/onboarding/:bucketId/:scenarioId/{any}` SHALL NOT
trigger the AppErrorBoundary. The router MUST either define routes
for the canonical sub-step paths (`/ingest`, `/understand`, `/extract`,
`/interact`, `/integrate`) that hydrate the matching frame, OR
redirect any unknown sub-path to the canonical `/:bucketId/
:scenarioId` URL while preserving session state. Today
`/onboarding/28454/utility/interact` renders "Something went wrong".

#### Scenario: Direct sub-step URL hydrates the right frame

- **GIVEN** the user navigates directly to `/onboarding/28454/utility/interact`
- **WHEN** the app loads
- **THEN** the error boundary does NOT fire
- **AND** either the InteractView is rendered (route defined) OR the user is redirected to `/onboarding/28454/utility` with the same session.

#### Scenario: No `No routes matched` console warning

- **GIVEN** the user navigates to any documented onboarding URL
- **WHEN** the page settles
- **THEN** the browser console contains no `No routes matched location` warning for that URL.

> The F1→F2 animation choreography is intentionally left flexible — the
> current implementation uses an F1 overlay that lifts away (700ms) while
> the underneath shell zooms back to identity, which is functionally
> equivalent to the canonical "nav + chat slide in from the left." The
> overlay approach was chosen so the underneath AppShell can stay mounted
> across the transition (avoids re-running AnimatePresence on nav+chat).
> Both shapes satisfy the user-visible contract: F1 → F2 takes ~700ms,
> respects reduced-motion, and lands the shell + step strip + chat
> visible at F2.

### Requirement: A debug overlay SHALL render on `?debug=true` with a reset control

The app SHALL mount a `DebugOverlay` that renders only when the URL carries
`?debug=true`, as a fixed bar pinned along the bottom of the viewport above all app
chrome. The overlay MUST be visually distinct from product UI (intentionally
off-brand styling) so it is never mistaken for a shipped surface, and MUST render
`null` when the param is absent (zero production cost). Its first control is a
**Reset** button.

#### Scenario: Overlay appears only with the debug param

- **GIVEN** the user loads any app route with `?debug=true`
- **WHEN** the page renders
- **THEN** a fixed bottom bar with `data-testid="debug-overlay"` is in the document
- **AND** it contains a "Reset" control.

#### Scenario: Overlay is absent without the param

- **GIVEN** the user loads the same route WITHOUT `?debug=true`
- **WHEN** the page renders
- **THEN** no element with `data-testid="debug-overlay"` is in the document.

### Requirement: The debug reset SHALL return the app to a first-time anonymous visitor

Clicking the debug overlay's Reset control SHALL restore the experience to "an
unauthenticated user seeing onboarding for the first time." The reset MUST: sign out
of any authenticated session; clear all app-owned client storage (the known
`localStorage` keys and the per-scenario `sessionStorage` thinking-stream replay
keys); clear the session + csrf cookies so the next request mints a fresh anonymous
id; and hard-navigate to `/onboarding` (F1) for a clean remount.

#### Scenario: Reset clears client state and lands on F1

- **GIVEN** an authenticated (or returning anonymous) user with cached chat width,
  a replayed thinking-stream flag, and an active session cookie
- **WHEN** they click Reset in the debug overlay
- **THEN** the auth session is cleared
- **AND** the app-owned `localStorage` + `sessionStorage` keys are removed
- **AND** the session/csrf cookies are expired so a fresh anon id is minted
- **AND** the browser navigates to `/onboarding`
- **AND** the F1 ingest picker renders with no replayed thinking-stream.

### Requirement: The debug reset SHALL remain exhaustive as session state grows

The reset MUST clear EVERY piece of session-scoped or per-visitor state the app
holds — across client storage (localStorage, sessionStorage, cookies, in-memory
contexts) and any server-side session-keyed records — such that no state survives to
leak into the "first-time visitor" experience. This is a **forward-binding
invariant**: any future change that introduces a new session-scoped storage key,
context, cookie, cache, or server session record MUST extend the reset to clear it
AND add/extend a reset test covering it, in the same change. A reset that misses
newly-added state is a regression, not an enhancement deferral.

The reset helper SHALL centralize this clearing in one module
(`lib/resetExperience.ts`) so there is a single place to keep in sync, and SHALL be
referenced from the agent docs as the canonical "what counts as session state" list.

#### Scenario: New session state added without updating reset fails its own test

- **GIVEN** a future change adds a new session-scoped storage key or context
- **WHEN** the reset is run
- **THEN** the new state is cleared by `resetExperience`
- **AND** a reset test asserts the new state is gone after reset
- **AND** the change is not considered done until both hold.

#### Scenario: After reset, no prior session state is observable

- **GIVEN** a fully-exercised session (auth, chat history, cached widths, entity
  registry, viewer steps, any feature caches)
- **WHEN** Reset runs and the app reloads at `/onboarding`
- **THEN** no pre-reset client storage, cookie, context value, or server
  session-keyed record is observable in the fresh experience.

### Requirement: AppShell SHALL not leave the canvas pane collapsed across a breakpoint change

When AppShell transitions from compact to desktop layout, it SHALL reset the focus
mode to `split` so the canvas pane renders at its normal share of the width and is
never left collapsed to a sliver (the failure mode where a compact "View canvas"
toggle, fired during a compact↔desktop flap, leaves the desktop canvas at ~24px).

#### Scenario: Compact→desktop restores a usable canvas

- **GIVEN** the layout is compact and the user toggled to the canvas pane
- **WHEN** the viewport crosses into desktop width
- **THEN** AppShell's focus mode resets to `split`
- **AND** the canvas pane renders at a non-trivial width (well above the chat-pane floor)
- **AND** any mounted PdfViewerWidget is visible rather than crushed.

### Requirement: The GroundX ↔ product domain vocabulary SHALL be fixed and single-sourced

The product↔GroundX resource mapping SHALL be authoritative and singular: a product **Workspace
is exactly one GroundX bucket** (1:1); a product **project, portfolio, fund, or folder is a filter
field on documents** within that bucket (resolved as a GroundX `filter`, e.g. `{ projectId }`), NOT
a separate GroundX resource; and a GroundX **group is reserved solely for cross-bucket (cross-workspace)
search**. No surface SHALL model a single-workspace project view as a GroundX group, and no surface
SHALL treat the Partner `/workspace/*` scaffold-project facade as the customer document workspace.
Existence of a bucket SHALL be inferred from a document's `bucketId` (e.g. via `document_get`), not
from `bucket_get`, which can deny access under a partner/cross-customer credential context even for a
real bucket.

#### Scenario: Project resolves to a filter, not a group

- **GIVEN** a product "project view" scoped to one workspace
- **WHEN** its `ContentScope` is resolved to a GroundX request
- **THEN** it is a `bucket` target plus a `filter` on the project field
- **AND** it is NOT a GroundX `group`.

#### Scenario: Group is only cross-bucket

- **GIVEN** a scope that spans more than one bucket
- **WHEN** it is resolved to a GroundX request
- **THEN** a GroundX `group` MAY be used (e.g. the multi-bucket pivot helper)
- **AND** single-bucket scopes never resolve to a group.

