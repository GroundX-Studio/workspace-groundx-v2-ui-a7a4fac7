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

The `CanvasIntent` union SHALL be defined by a single shared Zod schema (`canvasIntentSchema`) in `@groundx/shared`; the app `CanvasIntent` type SHALL be derived from it via `z.infer` (one source of truth — the app MUST NOT hand-declare a rival union). The dispatch exhaustiveness check SHALL continue to switch on the same `kind` discriminator. Every boundary that reads or writes a persisted `CanvasIntent` (the `chat_sessions.current_intent_json` arbitrary-JSON column) SHALL validate it through the shared schema rather than blind-casting it: an intent that fails validation SHALL coerce to `null` rather than flow into the orchestrator as a typed intent, and a valid intent SHALL pass through unchanged.

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

#### Scenario: A corrupt persisted intent is rejected on hydration, not blind-cast

- **GIVEN** a server `chat_sessions` row whose `current_intent_json` holds a malformed intent (a real-looking `kind` but missing the variant's required fields, e.g. `{ "kind": "openDocument" }` with no `documentId`)
- **WHEN** `ChatStoreServerHydrator` hydrates the session and `coerceHydratedIntent` runs the value through `parseCanvasIntent`
- **THEN** the hydrated session's `currentIntent` is `null` (the corrupt value does NOT masquerade as a typed `CanvasIntent` in the orchestrator)
- **AND** the rest of the session row hydrates unaffected

#### Scenario: A valid persisted intent round-trips unchanged

- **GIVEN** a server `chat_sessions` row whose `current_intent_json` holds a well-formed `{ "kind": "openDocument", "documentId": "util-1", "page": 2 }`
- **WHEN** the session hydrates through `coerceHydratedIntent` / `parseCanvasIntent`
- **THEN** the hydrated `currentIntent` equals the persisted intent (behavior preserved for valid intents)

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

Every data catalog SHALL satisfy a shared `Catalog<T>` contract exposing `all(): readonly T[]` and
`byId(id: string): T | undefined`. A data catalog is a collection looked up by id and enumerated —
today `ScenarioRegistry`, `toolRegistry`, and `chatExperienceRegistry`. Locally-sourced catalogs
(static or glob-discovered) SHALL additionally enforce a unique-id invariant that fails at build/boot
on a duplicate id. A catalog SHALL be lookup + enumeration only: it SHALL NOT resolve an entry from a
route/entry context and SHALL NOT mount or otherwise dispatch behavior.

The unique-id helper SHALL accept an optional source-label extractor; when a glob-discovered catalog
supplies it (e.g. each entry's module path), the duplicate-id error SHALL name the colliding source
modules. Without it, the error names the duplicate id only.

Sourcing and delivery MAY differ and SHALL NOT be flattened: a remote catalog MAY add an async status
machine + `refresh()` and be delivered via a React Context; a local catalog MAY be a plain singleton.
The shared contract governs the data-access API only. No catalog base class or runtime catalog
framework SHALL be introduced — the contract is a type plus a unique-id helper.

#### Scenario: Each catalog satisfies the shared read API

- **GIVEN** `ScenarioRegistry`, `toolRegistry`, and `chatExperienceRegistry`
- **WHEN** their public APIs are inspected
- **THEN** each exposes `all()` and `byId(id)` conforming to `Catalog<T>`
- **AND** `toolRegistry` retains `byName` as a documented alias (a tool's id is its `name`) and its
  tool-specific `forStep(...)` extension
- **AND** `ScenarioRegistry` retains its async status + `refresh()` as the remote-catalog extension.

#### Scenario: A local catalog rejects a duplicate id at boot

- **GIVEN** a glob-discovered catalog (e.g. `toolRegistry` or `chatExperienceRegistry`) with two entries sharing an id, assembled via the unique-id helper with a source-label extractor (each entry's module path)
- **WHEN** the catalog is assembled at boot
- **THEN** assembly throws an error naming the duplicate id
- **AND** because the source-label extractor was supplied, the error also names the colliding source modules.

#### Scenario: A catalog does not dispatch

- **GIVEN** any data catalog
- **WHEN** its surface is inspected
- **THEN** it offers lookup (`byId`) and enumeration (`all`) only
- **AND** it exposes no `resolve(context)`-style method that selects or mounts an entry from a route/entry context.

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
`wizardNext`/`wizardBack`/`wizardFinish`, `dismissWizard`, `closeDialog`, `showSample`, `openDocument`,
`editSchema`, `switchFrame`) are explicit no-op cases so the exhaustiveness check still names them. The
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

