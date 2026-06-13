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
the source of truth for the sign-up viewer surface.

The previous canvas/chat swap pattern in `OnboardingShell` and `ChatColumn`
SHALL be retired. A sign-up overlay SHALL NOT cause `ChatColumn` to render
`GateChatPanel`, `GateChatRail`, or any other replacement chat panel.
`ChatColumn` SHALL keep the shared `ConversationFlow` mounted once the user
enters the sign-in flow. `gate.status` MAY remain as lifecycle and analytics
state, but it SHALL NOT choose the chat surface.

`OnboardingShell` SHALL compute sign-in overlay activity and pass that state to
the chat composition root explicitly. `ChatColumn` SHALL NOT rediscover sign-in
state from `gate.status` or use `gate.status` as a flow mode.

`OnboardingShell` SHALL render the current viewer step as an underlay and
z-stack blocking overlays such as `sign-up` and `book-call` above it. The
underlay SHALL be `aria-hidden` and inert while a blocking overlay is active.
The active StepStrip pill SHALL remain derived from the viewer underlay while
sign-in is active: F1-origin sign-up remains on Ingest, and sample-origin
sign-up preserves the active sample step.

#### Scenario: URL navigation to /onboarding/signup pushes a sign-up overlay

- **GIVEN** the user is on F1 with no overlays
- **WHEN** the user navigates to `/onboarding/signup`
- **THEN** a `{ kind: "sign-up", state: "pending" }` overlay is pushed
- **AND** the AppShell chat/viewer split is visible
- **AND** `<ConversationFlow />` mounts in the chat column
- **AND** the sign-up viewer widget mounts over the F1/main underlay
- **AND** the StepStrip remains on Ingest because no sample is active
- **AND** no `GateChatPanel` or `GateChatRail` live panel mounts.

#### Scenario: Navigating away from /onboarding/signup pops the overlay

- **GIVEN** the sign-up overlay is present
- **WHEN** the user navigates to `/onboarding`
- **THEN** the sign-up overlay is popped
- **AND** the F1 picker returns
- **AND** the same `ChatSession` remains the active onboarding session.

#### Scenario: Direct sample navigation from sign-up continues the session

- **GIVEN** the user is on `/onboarding/signup`
- **WHEN** the user navigates to `/onboarding/<bucketId>/utility`
- **THEN** the sign-up overlay is popped before the Utility viewer step renders
- **AND** the Utility sample activates in the same `ChatSession`
- **AND** the normal onboarding `ConversationFlow` renders the Utility experience.

#### Scenario: openGate opens sign-in in the active viewer

- **GIVEN** a user is viewing a sample on Extract, Interact, Report, or Integrate
- **WHEN** the app dispatches an `openGate` intent
- **THEN** the active session gets a pending `sign-up` overlay
- **AND** the existing viewer step remains under the overlay
- **AND** the StepStrip stays on the existing viewer step's mapped pill
- **AND** the chat column keeps the shared `ConversationFlow` mounted.

#### Scenario: Blocking overlays hide the underlay from interaction

- **GIVEN** the sign-up or book-call overlay is active
- **WHEN** the viewer stack renders
- **THEN** the viewer underlay is `aria-hidden`
- **AND** the viewer underlay is inert
- **AND** keyboard focus stays within the active overlay or chat controls.

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

`CanvasOrchestratorContext.dispatch()` SHALL be the canonical entry point that
turns a `CanvasIntent` into an in-app state change. The orchestrator SHALL
switch exhaustively over every `CanvasIntent.kind` with a `never` check so a new
intent kind without a handler or explicit retained-adapter case fails
type-checking.

The `registerAdapter` mechanism is RETAINED for current live callers whose
intent kinds are explicitly named in the dispatch switch as adapter-backed
cases. Current retained callers include `OnboardingWizard`, `DialogTitle`, and
`SignUpWidget`. New intent behavior SHOULD prefer a built-in dispatch case
unless an OpenSpec plan justifies an adapter-backed extension.

The `CanvasIntent` union SHALL be defined by the shared Zod schema in
`@groundx/shared`; every boundary that reads or writes a persisted
`CanvasIntent` SHALL validate through that shared schema.

#### Scenario: A new intent kind without a handler fails type-checking

- **GIVEN** a new `CanvasIntent` kind is added to the shared union
- **WHEN** `npx tsc --noEmit` runs
- **THEN** the dispatch exhaustiveness check fails unless the kind has a
  built-in dispatch branch or an explicit adapter-backed no-op case.

#### Scenario: Current adapter-backed intents remain explicit

- **GIVEN** a current adapter-backed intent such as `submitSignup`,
  `wizardNext`, `wizardBack`, `wizardFinish`, `dismissWizard`, or `closeDialog`
- **WHEN** `dispatch()` receives the intent
- **THEN** the switch names the kind explicitly before the retained
  `registerAdapter` fallback runs.

#### Scenario: An LLM tool dispatches its produced intent through the canonical orchestrator path

- **GIVEN** the LLM emits a tool call for `open_document`
- **WHEN** the middleware validates the call and invokes the tool's handler
- **THEN** the result is a `CanvasIntent` with `kind === "highlightCitation"`
- **AND** the frontend receives the intent via `ChatReply.intents[]`
- **AND** dispatching that intent through the orchestrator produces the same
  state change as a `CiteChip` click.

#### Scenario: A corrupt persisted intent is rejected on hydration, not blind-cast

- **GIVEN** a server `chat_sessions` row whose `current_intent_json` holds a
  malformed intent, such as `{ "kind": "openDocument" }` with no `documentId`
- **WHEN** `ChatStoreServerHydrator` hydrates the session and
  `coerceHydratedIntent` runs the value through `parseCanvasIntent`
- **THEN** the hydrated session's `currentIntent` is `null`
- **AND** the corrupt value does not masquerade as a typed `CanvasIntent` in the
  orchestrator
- **AND** the rest of the session row hydrates unaffected.

#### Scenario: A valid persisted intent round-trips unchanged

- **GIVEN** a server `chat_sessions` row whose `current_intent_json` holds a
  well-formed `{ "kind": "openDocument", "documentId": "util-1", "page": 2 }`
- **WHEN** the session hydrates through `coerceHydratedIntent` and
  `parseCanvasIntent`
- **THEN** the hydrated `currentIntent` equals the persisted intent.

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

The step-strip Extract / Interact / Report sub-pills SHALL each render with `role="button"`,
`tabindex="0"` when reachable, and an `onClick` handler that advances the canvas to the corresponding
frame. Disabled sub-pills MUST carry `aria-disabled="true"` and MUST NOT receive focus. Report is a
general capability and SHALL be reachable for anonymous users (it previews like Extract); it SHALL
NOT be treated as auth-disabled. Sign-in gating applies to report **actions** (Save / Export / BYO
scope) via the shared gate, not to the pill.

#### Scenario: Reachable sub-pill is clickable + focusable

- **GIVEN** the user has reached the Analyze step (Extract is the active sub-step)
- **WHEN** the step strip renders
- **THEN** the `Extract` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** the `Interact` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking `Interact` advances the canvas to F5 InteractView.

#### Scenario: Report is reachable for anon (preview), gated only on actions

- **GIVEN** an anonymous user who has reached the Analyze step
- **WHEN** the step strip renders
- **THEN** the `Report` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking it advances to `f4` and previews the report
- **AND** Save / Export / rendering a BYO scope trigger the sign-in gate (not the pill).

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

### Requirement: "Registry"/"Catalog" naming SHALL denote a read catalog, not mutable state

A module named `*Registry` or `*Catalog` SHALL be a read catalog satisfying `Catalog<T>`. Mutable
per-entity or per-session state SHALL NOT carry that naming. The existing `EntityRegistry` module —
a mutable state shim over `ChatStore` with an `activate`/`upsert`/`update` API — SHALL be renamed to a
state-store name (`EntitySessionStore`; the "Store" suffix avoids collision with the existing
`EntitySession` data-type already exported from that module) so the catalog vocabulary reliably means
"read lookup".

#### Scenario: Mutable session state is not named a registry

- **GIVEN** the per-entity session state formerly exported as `EntityRegistry`/`useEntityRegistry`
- **WHEN** the rename lands
- **THEN** it is exported under a state-store name (`EntitySessionStore`/`useEntitySessionStore`) with its API and behavior unchanged
- **AND** the existing `EntitySession` data-type export is left intact (the "Store" suffix avoids that collision)
- **AND** no `*Registry`/`*Catalog` export in the app has a mutate (`activate`/`upsert`/`update`) API.

### Requirement: The frame model SHALL include a report builder frame f4a

`FFrame` SHALL include `f4a` (the report builder / S3a), alongside the existing `f4` (the report
render / S3). `f4` SHALL route the shell canvas to the report **render** surface and `f4a` to the
report **builder** surface — `f4` SHALL NOT render the extract workbench. Advancing
`f4 → f4a` (via a section's edit affordance or `show_smart_report_edit`) and returning `f4a → f4`
(via `← back`) SHALL mirror the F3 ↔ F3a navigation.

#### Scenario: f4 renders report, f4a renders builder

- **GIVEN** the active frame is `f4`
- **WHEN** the shell resolves the canvas
- **THEN** it renders the report render surface (not the extract workbench)
- **AND** **WHEN** the frame is `f4a`
- **THEN** it renders the report builder surface.

### Requirement: SmartReport SHALL build on the shared ScopedViewerWidget base

SmartReport's render and builder widgets SHALL build on the `ScopedViewerWidget` base — each taking a
real `ContentScope` `scope` (plus `role: WidgetRole` per `widget-role-access`), adapting when the
scope changes (re-render in place, not a remount fork) across the full scope union (`bucket` ·
`bucket+filter` · `documents[]` · `documents[]+filter` · `group` · `group+filter`), and registering
its `show_smart_report_render` / `show_smart_report_edit` tools. The `ScopedViewerWidget` base
class/object + registry + its structural contract test are **owned by `core-data-model-hardening`**
(which establishes that the four main viewer widgets — PdfViewer, Extract, SmartReport, Integrate —
each build on a common base): this change does NOT re-declare that contract, it CONSUMES it.
Dependency: blocks on the base landing in `core-data-model-hardening`.

#### Scenario: SmartReport adapts to a scope change on the shared base

- **GIVEN** the SmartReport render widget mounted with a `bucket + project filter` scope on the shared base
- **WHEN** the scope prop changes (e.g. to `documents[]` or a `group`)
- **THEN** the widget re-renders against the new scope without a remount fork
- **AND** the widget exposes its `show_smart_report_render` canvas-dispatch tool via the shared registry.

### Requirement: The Report sub-pill SHALL be reachable for all scenarios

The Report step-strip / nav sub-pill SHALL be reachable (clickable, advancing the canvas to `f4`) for
**all scenarios** — Report is a general capability over the active `ContentScope`, not a per-scenario
feature. The hard-coded always-disabled state (`reportActive = false`) SHALL be removed. Reachability
SHALL NOT depend on `chapters.report` (which, if retained, only flavors guided-demo emphasis) and
SHALL NOT be auth-gated — anonymous users reach Report and preview it (Save/Export/BYO gate per the
`smart-report` contract, mirroring Extract).

#### Scenario: Report pill is reachable on every scenario, including for anon

- **GIVEN** any scenario (Utility, Loan, Solar) and an anonymous user
- **WHEN** the step strip renders
- **THEN** the Report sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking it advances the canvas to `f4` and previews the report.

### Requirement: On-canvas controls SHALL drive host effects through the orchestrator, not host callback props

A ScopedViewerWidget control whose effect lives outside the widget SHALL dispatch a `CanvasIntent` via the canvas orchestrator (the SAME intent the equivalent LLM tool emits) rather than rely on a callback prop the `{ scope, role }` mount contract cannot supply. The render-to-builder
edit-section control SHALL dispatch the `editTemplate` intent (the
`show_smart_report_edit` intent); the report builder SHALL pre-open the targeted
section from `session.selectedReportSectionId` when no `selectedSectionId` prop
is supplied, so the hand-off completes on the live `<ScopedCanvas>` path.

#### Scenario: Edit-section reaches the builder with the section pre-opened

- **GIVEN** the report render surface (f4) mounted via `<ScopedCanvas>`
- **WHEN** the user clicks a section's `✎ edit §N` control
- **THEN** an `editTemplate` intent dispatches through the orchestrator, the
  canvas moves to the report builder (f4a / `report-builder`), and that section's
  inline editor is open — with no `onEditSection` host callback involved.

#### Scenario: Save-to-account reaches the gate from the Interact canvas

- **GIVEN** the Interact (f5) canvas (the shared `PdfViewer`) mounted via `<ScopedCanvas>`
- **WHEN** the `save_to_account` chat tool / chip fires
- **THEN** the sign-in gate opens via the orchestrator's `openGate` routing — the
  shared `PdfViewer` grows no onboarding-only Save affordance.

### Requirement: The orphaned per-frame onboarding views SHALL be removed

The standalone per-frame views (`UnderstandView`, `ExtractView`, `InteractView`, `IntegrateView`, `ReportRenderView`, `ReportBuilderView`) SHALL be deleted once the production ScopedViewerWidgets are the SOLE canvas surfaces — they
hold no production importers and their host wiring is superseded by the
orchestrator-driven controls above. No dead per-frame view SHALL remain as
"reference."

#### Scenario: No per-frame view file remains

- **WHEN** the onboarding canvas renders any frame
- **THEN** it mounts a production ScopedViewerWidget through `<ScopedCanvas>` and
  no `*View.tsx` per-frame view file exists under `views/Onboarding/`.

### Requirement: Widgets SHALL sit at the top of the dependency tree and import no view or other widget slot

A widget under `components/chat-widgets/` or `components/viewer-widgets/` SHALL import only from the
lower tiers (`brand/`, `primitives/`, `layout/`) and, within its own slot, sibling widgets — and SHALL
NOT import from `views/` nor from the other widget slot. This dependency direction SHALL be enforced by
a `widget-contract` test assertion (rule 5), not by prose convention alone.

#### Scenario: A widget importing a view fails the guard

- **GIVEN** a widget source under `components/chat-widgets/` or `components/viewer-widgets/`
- **WHEN** it imports a module resolving into `views/` (via the `@/views/` alias or a relative path)
- **THEN** the `widget-contract` rule-5 assertion fails
- **AND** the failure names the offending file and import specifier.

#### Scenario: A within-slot widget composite is allowed

- **GIVEN** `ChatColumn` (a `chat-widgets/` widget) mounting the gate composite
- **WHEN** the gate composite lives in `components/chat-widgets/GateChatPanel/` and itself mounts the
  `chat-widgets/GateChatRail` widget
- **THEN** the `ChatColumn` → `GateChatPanel` → `GateChatRail` chain is entirely within the
  `chat-widgets/` slot and passes rule 5
- **AND** no widget imports from `views/`.

#### Scenario: A cross-slot widget import fails the guard

- **GIVEN** a widget source under one widget slot
- **WHEN** it imports a widget from the *other* widget slot (chat-widgets ↔ viewer-widgets)
- **THEN** the `widget-contract` rule-5 assertion fails.

### Requirement: API errors SHALL extend a single ApiError base

The application SHALL define one base `ApiError extends Error` carrying `status` and `detail`, and
every hand-rolled API/upstream error SHALL extend it rather than declaring its own status/detail
fields. A drift guard SHALL fail if a `*Error` class does not extend the base.

#### Scenario: An error class extends the shared base

- **GIVEN** an API or upstream error (e.g. `ExtractFieldApiError`, `ChatHandlerError`, `UpstreamTimeoutError`)
- **WHEN** an instance is constructed
- **THEN** it is `instanceof ApiError` (and `instanceof Error`) and exposes `status` and `detail`
- **AND** it does not declare its own duplicate `status`/`detail` fields.

#### Scenario: A non-conforming error fails the drift guard

- **GIVEN** a `*Error` class that does not extend `ApiError`
- **WHEN** the drift guard runs
- **THEN** the guard fails loudly, naming the offending class.

### Requirement: Entity CRUD contexts SHALL be built from a shared factory over a discriminated SdkActionResult

Entity CRUD context results SHALL be a discriminated `SdkActionResult<T>` union, and the entity
contexts SHALL be produced by a shared context-side factory over that union, so the hand-rolled
per-context duplication is removed and the success/error limbo is unrepresentable.

The api-side per-entity wrappers (`api/entities/*`) are NOT required to go through a generated client
factory: they are thin axios calls returning raw response bodies and share no `SdkActionResult` shape;
forcing them through one `createEntityClient<T>()` would be a forced abstraction (per the
earn-every-axis guardrail). They remain concrete; only the context layer is factored.

#### Scenario: SdkActionResult makes the limbo state unrepresentable

- **GIVEN** the `SdkActionResult<T>` union (`{isSuccess:true;response:T} | {isSuccess:false;error}`)
- **WHEN** a value with `{ isSuccess: false; response: null; error: null }` is written
- **THEN** it fails type-checking
- **AND** narrowing on `isSuccess` exposes exactly `response` (true) or `error` (false).

#### Scenario: Entity contexts use the factory

- **GIVEN** an entity context surface (Buckets/Documents/Groups/Projects/Workflows/ApiKeys/Search/Health)
- **WHEN** its provider runner and its `useXContext` hook are constructed
- **THEN** they are produced by the shared context factory (`useSdkRunner` + `createContextHook`)
- **AND** no hand-rolled `run`-helper or `useContext`-guard hook remains off the factory.

### Requirement: App↔middleware wire twins SHALL derive from one shared module with a description-level drift guard

Wire types shared across the app↔middleware boundary SHALL be defined once in `@groundx/shared` and
imported by both sides — including the `/api/chat/*` envelope, `AppUserMetadata`, the event-source
enum, the page-dimension shape, and the field-type union — and the tool-catalog drift guard SHALL
assert NAME + DESCRIPTION parity, not merely the name set.

#### Scenario: A wire twin is defined once

- **GIVEN** a type that crosses the app↔middleware boundary (e.g. the chat envelope, `AppUserMetadata`)
- **WHEN** both sides reference it
- **THEN** both import the single `@groundx/shared` definition rather than hand-mirroring it.

#### Scenario: A drifted tool description fails the guard

- **GIVEN** a tool whose app-side description differs from its middleware `SERVER_TOOL_CATALOG` description
- **WHEN** the tool-catalog drift guard runs
- **THEN** the guard fails on the description mismatch, not only on a name-set mismatch.

### Requirement: Persisted columns and untrusted boundaries SHALL be validated into their typed shapes

Union-typed DB columns SHALL be validated in their row→object mappers, and untrusted JSON boundaries
(localStorage rehydration, `current_intent_json`) SHALL be validated against a shared schema, so a
corrupt value is rejected or coerced rather than cast straight into application or LLM context.

#### Scenario: A corrupt union column does not flow through unchecked

- **GIVEN** a row with an out-of-union `role`/`action`/`source` value
- **WHEN** it is read through the row→object mapper
- **THEN** the value is rejected or coerced, not blind-cast into the in-memory object.

#### Scenario: An untrusted CanvasIntent is validated against the shared schema

- **GIVEN** a `current_intent_json` value read from the DB or a rehydrated localStorage snapshot
- **WHEN** it is loaded
- **THEN** it is validated against the shared `canvasIntentSchema` (and rejected to a safe default if invalid).

### Requirement: Orchestrator dispatch SHALL be exhaustive over the CanvasIntent union

The orchestrator's `dispatch()` SHALL switch over `intent.kind` with a `never` exhaustiveness check so a
new `CanvasIntent` kind without a handler fails type-checking (replacing the chain of independent
`if (intent.kind === …)` blocks that silently no-op'd an unhandled kind). Every `CanvasIntent` kind
SHALL be named by a `case` in that switch: kinds with a built-in orchestrator side effect run it in
their case; kinds routed only through the `registerAdapter` adapter registry (e.g. `submitSignup`,
`wizardNext`/`wizardBack`/`wizardFinish`, `dismissWizard`, `closeDialog`) are explicit no-op cases so
the exhaustiveness check still names them. `switchFrame`, `showSample`, `editSchema`, and
`openDocument` SHALL be built-in cases (formerly adapter-registry-only, which left them silent no-ops
on the live canvas — `switchFrame` is emitted by the middleware `suggest_intent` tool, so the LLM could
dispatch it with no canvas movement): `switchFrame` → `OnboardingSession.advanceFrame(intent.frame)`;
`showSample` → `OnboardingSession.pickScenario(intent.scenario)`; `editSchema` →
`OnboardingSession.advanceFrame("f3a")`; `openDocument` → `ChatStore.gotoDocViewer` (page defaults
to 1), mirroring `jumpToPage`. The onboarding-routed three soft-fail in the steady tree. The
`registerAdapter` mechanism is RETAINED — it has live non-test callers (the SignUpWidget, DialogTitle,
and OnboardingWizard adapters), and the `adaptersRef.get(intent.kind)` dispatch path runs after the
switch unchanged.

#### Scenario: A new intent kind fails type-check

- **GIVEN** a new `CanvasIntent` kind added to the union with no `case` in the `dispatch` switch
- **WHEN** the project is type-checked
- **THEN** the `never` exhaustiveness assertion (`assertNeverIntent(intent)`) fails with an error naming
  the unhandled kind (rather than the dispatch silently no-opping).

### Requirement: Session auth state SHALL be a discriminated union, not an empty-string sentinel

Session authentication state SHALL be modeled as `{kind:"anon"} | {kind:"authed";groundxUsername;groundxApiKey}`
so the authed-vs-anonymous distinction is the discriminant, replacing the empty-string `groundxUsername`
sentinel and its scattered empty-string checks.

#### Scenario: Anonymous and authed sessions are distinguished by kind

- **GIVEN** a session
- **WHEN** its auth state is read
- **THEN** it is either `{kind:"anon"}` or `{kind:"authed";groundxUsername;groundxApiKey}`
- **AND** no empty-string `groundxUsername` is used as the anonymous sentinel.

### Requirement: Structural debt SHALL be guarded against recurrence

Drift guards SHALL fail loudly on the recurring debt classes this hardening removed: a viewer widget
not built on the `ScopedViewerWidget` base or lacking a `show_*` tool, a duplicate exported type name
across files, a `Record<string,unknown>` placeholder in a context's typed state, a `*Error` not
extending the `ApiError` base, and a persisted DB column with no in-memory type field. A cross-layer
reconciliation matrix in `docs/agents/data-model.md` SHALL assert app type · wire type · DB column ·
persisted JSON agreement.

#### Scenario: A reintroduced placeholder fails a guard

- **GIVEN** a context whose typed state reintroduces a `Record<string,unknown>` placeholder
- **WHEN** the placeholder drift guard runs
- **THEN** the guard fails, naming the offending context.

#### Scenario: A persisted column without an in-memory field fails a guard

- **GIVEN** a DB column that is written but has no corresponding in-memory type field
- **WHEN** the persisted-column drift guard runs
- **THEN** the guard fails, naming the column (the `citations_json`/`tool_calls_json`/`attachments_json` class).

### Requirement: Every interactive control SHALL declare a real tool or an honest no-tool reason

Every interactive control SHALL declare either a real LLM `tool` or an explicit `noTool` reason. This covers Button, IconButton, TextField, DropdownMenu items, and clickable brand surfaces (GxPill / GxSectionHeader). The placeholder reason
`"legacy — Phase 7 backfills tool"` SHALL NOT appear anywhere — it is the marker of an
un-backfilled stub and its presence is a failure. Product/agent-driven controls MUST
carry a real tool; controls deliberately outside the agent surface (pre-app auth)
SHALL carry `noTool` with a specific, truthful reason.

#### Scenario: No placeholder noTool reasons remain

- **GIVEN** the app source tree
- **WHEN** grepped for `legacy — Phase 7 backfills tool`
- **THEN** there are zero matches.

#### Scenario: A product control is LLM-invocable

- **GIVEN** the F6 SignUpWidget submit control
- **WHEN** the widget's tool catalog is inspected
- **THEN** a `submit_signup` tool exists and the submit Button references it.

#### Scenario: Auth controls keep an honest no-tool reason

- **GIVEN** the standalone Login / Register / password auth forms
- **WHEN** their submit Buttons are inspected
- **THEN** each carries `noTool` with the reason `"pre-app auth — not agent-driven"`
- **AND** none carries the placeholder reason.

### Requirement: The tool-binding drift guard SHALL cover every interactive surface

`check-tool-references.mjs` SHALL enforce the `tool | noTool` declaration on every
interactive surface, not only Button / IconButton / TextField. DropdownMenu items,
GxPill (when `onClick` is supplied), and GxSectionHeader (when `onClick` is supplied)
MUST be covered, so a clickable control cannot ship without declaring whether the LLM
can reach it.

#### Scenario: An unbound interactive surface fails the guard

- **GIVEN** a `GxPill` with an `onClick` and no `tool` / `noTool`
- **WHEN** `check-tool-references` runs
- **THEN** the guard reports the unbound control and fails.

### Requirement: A tool-less widget SHALL carry a documented no-llm.md rationale

A widget SHALL be tool-less ONLY if it carries a `no-llm.md` with a specific, reviewed
`## Why` (never boilerplate) — that documented rationale, enforced by
`widget-contract.test.ts`, is the sole sanction for opting out of an LLM tool. The widget contract SHALL name the inert/dispatch
trio — `ThinkingStream` (decorative), `SuggestedActionChips` (it is itself the dispatch UI for
tools the router already returned), and `ChatColumn` (the chat surface itself) — as the canonical
exceptions, and SHALL acknowledge any other current documented opt-outs rather than claim an
exhaustive count the tree contradicts.

#### Scenario: Every tool-less widget is documented, none is silently exempt

- **GIVEN** the widget contract docs and the `widget-contract.test.ts` guard
- **WHEN** the sanctioned tool-less widgets are read
- **THEN** the inert/dispatch trio (ThinkingStream, SuggestedActionChips, ChatColumn) are named as
  the canonical exceptions
- **AND** every widget with a `no-llm.md` (the trio plus any other current opt-out) carries a
  specific `## Why`, which the guard requires — so no widget is silently tool-less.

### Requirement: Widgets and tools SHALL be real base classes/objects with a registry

ScopedViewerWidgets, widgets, and tools SHALL be backed by real base classes/objects plus a registry
— not enforced by a test convention alone. A `ScopedViewerWidget` base SHALL carry `scope`-prop
handling, adapt on scope change, and register its `show_*` tool; every main viewer widget SHALL build
on that base; and the tool registry SHALL hold real tool objects. The `widget-contract` test remains
as a guard, but the structure (base + registry) SHALL be the source of truth.

#### Scenario: A viewer widget is a registered ScopedViewerWidget instance

- **GIVEN** a main viewer widget (PdfViewer, Extract, SmartReport, Integrate)
- **WHEN** it is constructed
- **THEN** it builds on the `ScopedViewerWidget` base (scope handling + `show_*` tool registration)
- **AND** it is present in the widget/tool registry, not merely conformant to a test.

### Requirement: The active-intent type SHALL be the single CanvasIntent union

The ChatStore's active-intent slot SHALL use the single `CanvasIntent` discriminated union owned by
the orchestrator, not a `Record<string,unknown> | null` placeholder. The ChatStore SHALL re-export the
orchestrator union via a type-only import of the orchestrator's leaf types module (erased at runtime,
so no circular import forms); no placeholder SHALL remain.

#### Scenario: ChatStore stores a typed CanvasIntent

- **GIVEN** an active canvas intent on a chat session
- **WHEN** it is read from the ChatStore
- **THEN** its type is the orchestrator `CanvasIntent` union (compile-time exhaustive)
- **AND** no `Record<string,unknown> | null` placeholder remains.

### Requirement: ChatMessage SHALL carry its citations in memory

A `ChatMessage` SHALL carry its `citations: Citation[]` as a real in-memory field, written when the
turn is appended. Consumers (the Interact lit-regions, `CiteChip`, report pin-to-section) SHALL read
citations from the ChatStore message, not by polling the persistence API.

#### Scenario: Citations are available without a server poll

- **GIVEN** an assistant turn that arrives with citations
- **WHEN** it is appended to the ChatStore
- **THEN** the in-memory `ChatMessage` exposes `citations`
- **AND** the Interact surface lights the cited regions without polling `listChatMessages`.

### Requirement: ViewerStep kinds SHALL have a single source of truth

The server `ViewerStepKind` SHALL be derived from or shared with the app `ViewerStep`'s kinds, not
hand-mirrored. Adding a viewer-step kind SHALL update one source.

#### Scenario: A new step kind is declared once

- **GIVEN** a new viewer-step kind is added to `ViewerStep`
- **WHEN** the server `ViewerStepKind` is resolved
- **THEN** it reflects the new kind without a separate hand edit.

### Requirement: GroundX SDK and scenario shapes SHALL be validated or single-sourced

GroundX SDK response shapes and scenario configuration shapes SHALL NOT cross a
boundary via an `as unknown as` cast or live as an untested hand-mirrored twin.
Specifically: the live workflow → extraction-schema transform SHALL consume a
named workflow input type (not a `Record<string, unknown>` double-cast); the
`activeStepKind` wire value SHALL be validated against the shared
`viewerStepKindSchema` such that a present-but-invalid kind resolves to the
safe-minimum tool set (never the full or unrestricted-only catalog); the X-Ray
response type family SHALL be defined once in `@groundx/shared` and consumed by
both the app entity and the middleware geometry resolver; the
`getDocumentXray` SDK-boundary response SHALL be runtime-narrowed (or reduced to
a single documented guarded boundary) rather than blind-cast; the
`IngestProcess` / ingest-list shapes SHALL match the real endpoint payload with
the mutually-exclusive list keys collapsed at the reader; and the scenario
shapes (`ScenarioConfig`, `ScenarioDocument`, `ScenarioManifest`,
`SampleDocFilter`) SHALL be single-sourced onto `@groundx/shared` OR guarded by a
compile-time drift test (mirroring the `Eq<>` / widget-contract precedent), so
app↔middleware drift fails a guard instead of degrading the runtime silently.

#### Scenario: A GroundX SDK boundary is narrowed, not blind-cast

- **GIVEN** a GroundX SDK response consumed by the app (a workflow definition fed
  to `workflowToSchema`, or an X-Ray response from `getDocumentXray`)
- **WHEN** the value enters typed application code
- **THEN** it passes through a named type and/or a runtime parse that coerces or
  rejects a malformed payload
- **AND** no `as unknown as` cast is used to force the SDK shape into the app type.

#### Scenario: An invalid activeStepKind does not widen the tool surface

- **GIVEN** a chat request whose `activeStepKind` is a present-but-invalid string
- **WHEN** the RAG pipeline assembles the LLM tool catalog
- **THEN** the value is validated against `viewerStepKindSchema` and resolves to
  the safe-minimum tool set
- **AND** it does NOT fall through to the full catalog (the `undefined`/legacy
  behavior) nor to the wider unrestricted-only fall-through set.

#### Scenario: Scenario shapes cannot drift silently

- **GIVEN** the scenario shapes referenced by both `app/src/types/scenarios.ts`
  and `middleware/src/scenarios/types.ts`
- **WHEN** one side's shape diverges from the other
- **THEN** either both import the single `@groundx/shared` definition (so
  divergence is impossible) or a compile-time drift test fails on the divergence
- **AND** neither file's header relies on a prose-only "keep in sync" warning as
  the sole guard.

#### Scenario: The X-Ray type family has one source

- **GIVEN** the X-Ray response types used by the app entity
  (`groundxDocumentsEntity`) and the middleware geometry resolver
  (`citationGeometry`)
- **WHEN** both sides reference the X-Ray shape
- **THEN** both derive from the single `@groundx/shared` X-Ray type family rather
  than independent local declarations.

### Requirement: The runtime SHALL have no mock/dev-client mode

The middleware SHALL have no `MOCK_MODE` env flag and no `Dev*` client
implementations. Every service SHALL be constructed with the real `Fetch*`
clients (`FetchGroundXClient`, `FetchGroundXPartnerClient`, `FetchLlmClient`)
in all environments; the only substitute permitted is a fake explicitly
INJECTED at the dependency seam by a test. There SHALL be no env-driven path
that swaps the real clients, returns canned chat responses, returns stubbed
extract values, or renders a report from an in-code fixture at runtime. The
`config/env` schema SHALL NOT define a `MOCK_MODE` field, no service `deps`
SHALL carry a `mockMode` flag, and a drift guard SHALL fail if `MOCK_MODE`,
`useDevClients`, a `Dev*` client class, `chatMocks`, or a `mockMode` deps field
reappears in non-test runtime code.

#### Scenario: Boot uses the real clients with no MOCK_MODE path

- **GIVEN** the middleware boots in any environment (development, test, production)
- **WHEN** it constructs the app dependencies
- **THEN** `partnerClient` / `groundxClient` / `llmClient` are the real `Fetch*` clients
- **AND** there is no `MOCK_MODE` env field, no `useDevClients` selector, and no `Dev*` client class to swap them.

#### Scenario: Tests substitute fakes at the seam, not via an env flag

- **GIVEN** a test that needs deterministic upstream behavior
- **WHEN** it constructs the service or app under test
- **THEN** it injects a `Fake*` client (or real-shaped fixture) through the dependency seam
- **AND** it does NOT set any `MOCK_MODE` env var, because no such flag exists.

#### Scenario: A reintroduced mock path fails the drift guard

- **GIVEN** the mock/dev-client drift guard
- **WHEN** non-test runtime code references `MOCK_MODE`, `useDevClients`, a `Dev*` client class, `chatMocks`, or a `mockMode` deps field
- **THEN** the guard fails
- **AND** the offending file + token are reported.

### Requirement: Frontend network access SHALL be through an injected Api client

Frontend components, contexts, hooks, widgets, and views SHALL obtain network
operations from an injected `Api` client via `useApi()` (provided by
`ApiProvider`), NOT by importing the `src/api` singleton or its entity modules
directly. Exactly one composition root SHALL wire the real `Api`; the legacy
direct-import path MAY coexist only while a domain is mid-migration and SHALL be
removed or quarantined by the cleanup phase. This mirrors the middleware's
dependency-injection (`createApp({ ...deps })`) and exists so a single fake can
be substituted in tests instead of per-file module mocks.

The completed #10 scope includes the remaining app-facing runtime network
consumer domains after the archived session/chat and auth slices: resource
providers, scenario registry, canvas intent, extract, smart-report/report
templates, viewer/PDF support, reset/sign-up auth helpers, and telemetry/error
capture. Type-only imports of API wire shapes MAY remain until a dedicated
type-surface cleanup moves them.

Telemetry capture for rendered runtime consumers SHALL live on
`Api.telemetry.captureException`. Production composition SHALL forward that
method to the existing Sentry wrapper, while production Sentry initialization MAY
remain outside the injected runtime capture seam.

#### Scenario: A consumer receives the injected client

- **WHEN** a component or context needs a network operation
- **THEN** it calls `useApi()` and uses the returned client
- **AND** it does NOT `import { api }` / `import { <fn> } from "@/api/..."` directly
- **AND** `useApi()` outside an `ApiProvider` throws the not-found error

#### Scenario: The session establish is single-flight on the client

- **GIVEN** the onboarding shell and the chat-session bootstrap both need the anon session
- **WHEN** either runs
- **THEN** both await one single-flight `session.ensureAnonSession()` on the injected client (one `POST /api/onboarding/session`)
- **AND** the chat-session create never fires before the session is established (no 401 / no PATCH 404 / no ownership 403)

#### Scenario: Resource providers use injected resource groups

- **WHEN** a resource provider lists, creates, updates, deletes, or searches
  buckets, documents, groups, projects, workflows, API keys, health, or search
  data
- **THEN** it calls the corresponding injected `Api` resource group
- **AND** it does not value-import `api` from `@/api`

#### Scenario: Viewer and workflow surfaces use injected extract/report groups

- **WHEN** Extract, SchemaView, ProposeSchemaFieldCard, SmartReportBuilder, or
  SmartReportRender performs a network operation
- **THEN** it calls the injected extract, template, workflow, document, or report
  group
- **AND** it does not value-import standalone API modules such as
  `@/api/extractField`, `@/api/smartReport`, or API entity modules

#### Scenario: Scenario, canvas, and telemetry runtime use injected app-facing groups

- **WHEN** scenario registry, canvas intent, sign-up/reset, PDF-viewer runtime
  code, or rendered error-capture code performs network or telemetry work
- **THEN** it reads the injected app-facing `Api` surface
- **AND** direct app-facing imports from `@/api/...` or `@/lib/sentry` are absent

#### Scenario: Runtime consumers cannot import the legacy aggregate

- **WHEN** the final frontend API injection guard scans production runtime files
- **THEN** no component, context, hook, widget, or view value-imports `@/api`
- **AND** the only remaining value imports from API implementation modules are in
  explicit implementation allowlists such as `api/client.ts` and API module tests

### Requirement: Auth consumers SHALL use the injected Api auth group

Auth-domain production consumers SHALL obtain customer-auth network operations
from `useApi().auth`, not from the legacy `@/api` aggregate or
`@/api/entities/customerEntity` as value imports. The injected `Api` SHALL expose
an explicit `auth` group containing login, register, logout, get-user-data,
app-metadata update, password-reset, and password-confirm operations. The legacy
top-level auth members MAY coexist only while other domains migrate.

Type-only imports of auth wire shapes are allowed until those shapes move to a
separate shared/type-only surface.

#### Scenario: AuthProvider uses the injected auth client

- **WHEN** `AuthProvider` performs login, register, logout, user-data load,
  app-metadata update, reset-password, or confirm-password
- **THEN** it calls the corresponding `useApi().auth.*` operation
- **AND** it does not value-import `api` from `@/api`
- **AND** it does not value-import customer auth functions from
  `@/api/entities/customerEntity`

#### Scenario: Legacy top-level auth functions remain during migration

- **GIVEN** non-auth domains still compile against the legacy aggregate during the
  phased #10 migration
- **WHEN** the auth slice lands
- **THEN** the top-level `realApi.login/register/...` members still exist
- **AND** the new `realApi.auth.*` group is the only auth surface used by migrated
  auth consumers

### Requirement: Calendly scheduler SHALL be a session-scoped viewer widget

The booking scheduler SHALL mount through the existing session-scoped
`BookCallView` viewer widget, not as a duplicate content-scoped
`ScopedViewerWidget`. The widget SHALL accept the standard `role:
WidgetRole` and required `scope: WidgetScope` props and SHALL declare
`scope: { type: "none" }` at mount sites because booking a call is not tied to
a document, bucket, group, project, template, or generated result.

The app SHALL expose one browser-safe Calendly configuration value at
`APP_CONFIG.calendly.url`, sourced from `VITE_CALENDLY_URL`. `BookCallView`
SHALL use that app config value by default instead of reading
`import.meta.env` directly.

`BookCallView` SHALL use Calendly's advanced inline embed API by loading
`https://assets.calendly.com/assets/external/widget.js` and calling
`Calendly.initInlineWidget({ url, parentElement })` with a real owned parent
inside the viewer pane. When the URL is unset, it SHALL render an inline
placeholder instead of a broken empty embed.

At phone widths where Calendly's inline layout clips event details,
`BookCallView` SHALL render an external Calendly action using the same
configured URL instead of mounting the inline iframe.

`BookCallView` SHALL own trusted `calendly.event_scheduled` postMessage
handling from `https://calendly.com` or a Calendly subdomain and expose the
scheduled event to its host through a callback. `BookingStatusCard` is a legacy
contract-history widget only: the live `?bookCall=1` path SHALL NOT mount it,
and it SHALL NOT own Calendly iframe events.

#### Scenario: Book-call intent mounts the scheduler in the viewer

- **GIVEN** the app dispatches `{ kind: "openBookCall" }`
- **WHEN** the shell observes `?bookCall=1`
- **THEN** it mounts `BookCallView` with `scope: { type: "none" }`
- **AND** the chat column keeps the normal conversation timeline mounted
- **AND** any booking narration appears as ordinary assistant chat messages.

#### Scenario: Nav CTA uses the same viewer path

- **GIVEN** the user clicks "Book a call" in the OnboardingNav
- **WHEN** the handler runs
- **THEN** the URL gains `bookCall=1`
- **AND** the in-app booking viewer mounts
- **AND** no new browser tab is opened.

#### Scenario: Scheduled event commits the engineer-call gate

- **GIVEN** `BookCallView` is mounted
- **WHEN** Calendly posts `calendly.event_scheduled` from a trusted Calendly origin
- **THEN** the shell commits the gate with method `engineer-call`
- **AND** it clears `bookCall=1` so the call-requested state is visible.

#### Scenario: Direct book-call URL mounts the booking surface

- **GIVEN** the user lands on `/onboarding?bookCall=1`
- **WHEN** the shell renders
- **THEN** the F1 picker overlay does not mask the booking surface
- **AND** `BookCallView` is visible as a viewer overlay
- **AND** the normal chat timeline remains mounted.

#### Scenario: Phone width uses the external Calendly action

- **GIVEN** the viewer is rendered below the phone breakpoint
- **WHEN** `BookCallView` has a configured Calendly URL
- **THEN** it renders an "Open calendar" action with that URL
- **AND** it does not initialize the inline Calendly iframe.

#### Scenario: Untrusted scheduled event is ignored

- **GIVEN** `BookCallView` is mounted
- **WHEN** another origin posts `calendly.event_scheduled`
- **THEN** the scheduled callback is not invoked.

### Requirement: Viewer widget chrome SHALL be owned by a shared viewer frame

Every live viewer widget mount SHALL be wrapped by a shared viewer frame that
owns top-level viewer chrome: close/back controls, header/title metadata,
loading/status bands, outer padding, scroll bounds, and content-mode treatment.
Viewer widgets SHALL own product content and content-level callbacks only.

The frame SHALL be composed by the viewer host (`OnboardingShell`, `SteadyShell`,
`ScopedCanvas` / its adjacent frame host, or a future viewer composition root),
not independently reinvented by each viewer widget. The frame SHALL accept a
typed descriptor derived from the active `ViewerStep`, `ViewerOverlay`, or
production `CanvasKind` registry entry.

Production scoped viewer registry entries SHALL declare a viewer-frame
descriptor or policy for each built `CanvasKind`. Overlay hosts SHALL declare
equivalent descriptors for each live `ViewerOverlay` kind. A viewer widget
mount that has no descriptor SHALL fail a drift guard.

Descriptor ownership SHALL remain catalog/composition-root based. Production
viewer descriptors SHALL live on the production scoped viewer registry entry.
Overlay descriptors SHALL live in an explicit overlay descriptor map owned by
the overlay host. Adapter helpers MAY convert a selected descriptor into frame
props, but SHALL NOT inspect global route, auth, onboarding, or app-mode context
to resolve which widget or descriptor is active.

The descriptor source-of-truth SHALL be explicit:
`app/src/components/layout/ViewerWidgetFrame/viewerFrameDescriptor.ts` owns shared
types and pure adapters; `app/src/widgets/scopedViewerWidget.ts` owns the
production descriptor shape; `app/src/widgets/scopedViewerWidgetRegistryProduction.ts`
is the runtime production descriptor read path; and
`app/src/views/Onboarding/viewerOverlayFrameDescriptors.ts` owns onboarding
overlay descriptors. No other file SHALL define a competing map from
`CanvasKind` or `ViewerOverlay` to viewer-frame policy.

Viewer widgets SHALL NOT render their own top-level close/back/header chrome
unless the widget README declares a `hostless-exception` and names the host that
owns equivalent chrome. Exceptions SHALL be enforced by tests and SHALL NOT be
used for convenience styling.

The contract counts active foreground frames, not raw DOM nodes. Underlay
frames MAY remain mounted while hidden by `aria-hidden` / inert overlay
containers, but they SHALL mark `data-viewer-frame-active="false"`. Exactly one
visible, non-inert frame SHALL mark `data-viewer-frame-active="true"` for the
foreground viewer.

#### Scenario: Sign-in and booking share the same viewer frame

- **GIVEN** the sign-up overlay is active
- **WHEN** the viewer renders
- **THEN** one shared viewer frame is present
- **AND** exactly one visible, non-inert viewer frame is active
- **AND** the close/back action uses the standard frame handle
- **AND** `SignUpWidget` renders content inside the frame without its own
  top-level close/back chrome.

- **GIVEN** the book-call overlay is active
- **WHEN** the viewer renders
- **THEN** one shared viewer frame is present
- **AND** exactly one visible, non-inert viewer frame is active
- **AND** the close/back action uses the same standard frame handle
- **AND** `BookCallView` renders Calendly content inside the frame without its
  own top-level close/back chrome.

#### Scenario: ScopedCanvas-mounted widgets receive registry frame descriptors

- **GIVEN** a production `ScopedCanvas` mount resolves a `doc-viewer`,
  `extract-workbench`, `report`, `report-builder`, or `integrate` kind
- **WHEN** the viewer content renders in onboarding, steady, workspace, or
  project shells
- **THEN** the resolved widget is wrapped by the shared viewer frame or by a
  documented `hostless-exception`
- **AND** the frame content mode comes from the production registry descriptor
- **AND** the shell does not hand-roll an alternate header, gutter, or loading
  layout around that widget.

#### Scenario: Authenticated route proof uses a built viewer step

- **GIVEN** a signed-in complete `/workspaces`, `/projects`, or `/c/:sessionId`
  route is under test
- **WHEN** the test or browser fixture activates viewer content
- **THEN** the active `ViewerStep` resolves through `stepToCanvasKind(...)` to
  a built `CanvasKind`
- **AND** the route does not satisfy the requirement by rendering the default
  `ingest-picker` or `scoped-canvas-unavailable` placeholder
- **AND** the assertion proves a real registry-mounted widget body is wrapped by
  the shared viewer frame.

#### Scenario: Authenticated product routes are the base viewer-frame proof path

- **GIVEN** a signed-in user with onboarding complete opens `/workspaces`,
  `/projects`, or `/c/:sessionId`
- **WHEN** the active viewer step resolves to a built production `CanvasKind`
- **THEN** the route keeps the authenticated product shell mounted
- **AND** the route renders one normal chat surface
- **AND** the resolved viewer content is wrapped by the shared viewer frame or
  by a documented `hostless-exception`
- **AND** no anonymous sign-up overlay or onboarding-only viewer chrome is
  mounted.

#### Scenario: Signed-in onboarding overlays the product route

- **GIVEN** a signed-in user with incomplete onboarding state opens
  `/workspaces`, `/projects`, or `/c/:sessionId`
- **WHEN** the onboarding wizard opens
- **THEN** the current product route pathname is preserved
- **AND** the wizard decorates the product shell instead of replacing it with a
  parallel AppShell/chat/viewer hierarchy
- **AND** if a wizard step hosts viewer-widget content, that content uses the
  shared viewer frame contract.

#### Scenario: Anonymous product routes do not get signed-in onboarding

- **GIVEN** an anonymous user opens `/workspaces`, `/projects`, or
  `/c/:sessionId`
- **WHEN** auth routing resolves
- **THEN** the existing auth redirect/gate behavior applies
- **AND** the signed-in onboarding wizard does not open
- **AND** anonymous onboarding viewer overlays are not mounted inside the
  product route.

#### Scenario: Stacked overlays keep only the foreground frame active

- **GIVEN** sign-in is open over a sample viewer
- **AND** book-call is opened from sign-in
- **WHEN** the viewer stack renders
- **THEN** any sample or sign-in underlay frame is inside an inert or
  `aria-hidden` container and has `data-viewer-frame-active="false"`
- **AND** the book-call frame has `data-viewer-frame-active="true"`
- **AND** only the book-call frame close/back action is keyboard reachable.

#### Scenario: Frame content modes preserve widget-specific layouts

- **GIVEN** a sign-up form is mounted in the viewer
- **WHEN** the frame renders with `centered-panel` content mode
- **THEN** the form is centered within the standard viewer gutters
- **AND** the close/back action remains in the frame chrome.

- **GIVEN** a Calendly embed is mounted in the viewer
- **WHEN** the frame renders with `embed` content mode
- **THEN** the iframe region can fill the available content area
- **AND** loading/status UI appears in the frame status band, not floating over
  the loaded iframe.

#### Scenario: Hostless exceptions are explicit and test-backed

- **GIVEN** a viewer widget cannot use the shared frame because another
  standardized host already owns equivalent chrome
- **WHEN** the widget README declares `hostless-exception`
- **THEN** the README names the owning host
- **AND** a drift guard or widget test proves that the host chrome exists
- **AND** the exception is not accepted silently.

### Requirement: Viewer widgets SHALL declare a viewer chrome policy

Every directory under `app/src/components/viewer-widgets/<Name>/` SHALL document
its viewer chrome policy in its README under `## Viewer chrome`. The policy
SHALL be one of:

- `framed` - normal content inside the shared viewer frame;
- `edge-to-edge inside ViewerWidgetFrame` - document, canvas, iframe, or
  workbench content that fills the frame body while the frame still owns chrome;
- `hostless-exception` - a documented exception naming the host that owns
  equivalent chrome.

The widget contract drift guard SHALL fail when the section is missing, when
the policy is not one of the allowed values, or when the README policy
contradicts the production registry descriptor for the widget's `CanvasKind`.

#### Scenario: Missing viewer chrome policy fails the drift guard

- **GIVEN** a viewer widget README lacks `## Viewer chrome`
- **WHEN** the widget contract drift guard runs
- **THEN** the test fails naming the widget directory
- **AND** the error tells the author to choose one allowed policy.

#### Scenario: A framed widget does not own top-level close chrome

- **GIVEN** a viewer widget README declares `framed`
- **WHEN** the widget contract drift guard scans the widget source
- **THEN** undocumented top-level close/back handles fail the test
- **AND** the error directs the author to move that chrome to the shared frame.
