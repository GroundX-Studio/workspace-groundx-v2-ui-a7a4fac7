# Widget Contract

> **Status: locked 2026-05-26.** Originally landed via the
> ARCH-01..ARCH-13 epic; durable shape now lives in
> `openspec/specs/app-architecture/spec.md`. The drift-guard test at
> `app/src/test/widget-contract.test.ts` enforces it programmatically.
> Updates to this file require updating the drift-guard test in lockstep.

## TL;DR

This codebase has **one** application shell:

```
AppShell = nav | (header + (chat | viewer))
```

Used at every route. Onboarding is an **overlay** decorating that shell,
not a parallel hierarchy.

Two **slot-scoped** widget contracts:

- **Chat widgets** — render inside the chat scroll
  (`components/chat-widgets/<Name>/`)
- **Viewer widgets** — render inside the viewer pane
  (`components/viewer-widgets/<Name>/`)

Every non-trivial product capability is a widget of exactly one slot.
The **chat column** and the **viewer pane** are widget territory; no
one-off canvas or chat panels are allowed.

## Rationale

We kept hitting a recurring failure mode where, in onboarding, we'd
build a bespoke `UnderstandView` / `ExtractView` / `InteractView` /
`IntegrateView` that hardcoded scenario manifest fields and looked
identical to but was not the production widget. After signup, the user
would land in steady mode and see a completely different code path
with subtly different behavior.

The fix is **build for steady, decorate for onboarding**. Onboarding
lasts ~30 seconds of the user's life with the product. Steady is the
rest. A widget designed for steady that gets a `mode="onboarding"`
lock is a one-line override; the inverse is a rewrite.

This contract makes that the only legal path.

## The contract

Every widget MUST:

1. Live in `app/src/components/chat-widgets/<Name>/` OR
   `app/src/components/viewer-widgets/<Name>/`. The directory placement
   is the slot declaration. There is no `slot:` prop or const —
   placement is self-documenting.

2. Export a single React component as the default consumer-facing
   entry point, named after the directory (e.g.
   `viewer-widgets/PdfViewer/PdfViewerWidget.tsx`).

3. Accept required `role: WidgetRole` and `scope: WidgetScope` props.
   Role describes authorization / affordance availability
   (`anonymous` / `member` today). Scope describes the content set. A
   widget does not receive raw `documentId`, `bucketId`, or `projectId`
   props; those collapse into `scope`.

4. Ship a sibling `README.md` describing:
   - What the widget does + what slot it occupies
   - Required + optional props, including `role` and `scope`
   - Locked affordances by role
   - For viewer widgets: the `## Viewer chrome` policy section
   - Events / callbacks it fires
   - How the host wires it (one-line integration example)

5. Ship a sibling `.test.tsx` covering:
   - Mounts for supported roles without crashing
   - Locked affordances are absent / disabled for the locked role
   - Required events fire on user action

The drift-guard tests (`app/src/test/widget-contract.test.ts` and
`app/src/test/viewer-widget-shell-contract.test.ts`) auto-discover widgets
and enforce the directory, README, role/scope, dependency, LLM-tool, and
viewer-chrome contracts.

## Slot-specific rules

### Chat widgets

- Render inside the chat scroll body (the `ChatColumn`
  conversation flow or the steady `ChatWithSources` stream).
- Use the canonical chat primitives from
  `components/chat-widgets/_primitives/` (see "Primitives" below).
- Should be vertically composable — multiple chat widgets stack in the
  scroll body without ceremony.
- Never render anything full-bleed; respect the chat column's padding.

### Viewer widgets

- Render inside the viewer pane (right of the resize handle).
- Fill the pane content region: `width: 100%, height: 100%`. The host wraps
  them in `ViewerWidgetFrame`, which owns pane chrome, close/back actions,
  outer padding, loading/status bands, and active/inert state.
- Do not render host-level close/back/header/pane cards inside a viewer
  widget. Local content controls are allowed: PDF thumbnails/zoom, Extract
  field controls, report row editors, connector cards, menus, and inline
  editor close buttons stay in the widget.
- Heavy data fetches are the widget's responsibility. Third-party embed
  lifecycle can be reported to the host so `ViewerWidgetFrame` places loaders
  above the embed instead of overlaying the iframe.

### Viewer chrome

Every viewer-widget README MUST include `## Viewer chrome` with:

- policy `framed` for standard workbench/form surfaces;
- policy `edge-to-edge inside ViewerWidgetFrame` for PDF/canvas-style
  surfaces that need minimal visual chrome but still use the shared frame; or
- policy `hostless-exception` with the owning host named.

It must also declare a content mode: `centered-panel`, `padded-scroll`,
`edge-to-edge`, or `embed`.

Runtime descriptors live in exactly two places:

- production `CanvasKind` widgets: their `.tools.ts` descriptor via
  `scopedViewerWidgetRegistryProduction.ts`;
- onboarding overlays: `views/Onboarding/viewerOverlayFrameDescriptors.ts`.

No widget should invent its own outer shell. If a widget needs a close/back
control that changes the viewer slot, add it to the host frame descriptor. If
the control edits or closes an item inside the widget, document it as content
chrome in that widget README.

## Primitives

Shared, slot-scoped UI primitives the widgets compose from. These
themselves are NOT widgets — they're the building blocks. Locked
2026-05-26 catalog:

| Primitive | Location | Used by |
|---|---|---|
| `BotBubble` | `chat-widgets/_primitives/BotBubble.tsx` | ThinkingStream, GateBotResponse, ChatWithSources |
| `UserBubble` | `chat-widgets/_primitives/UserBubble.tsx` | ThinkingStream, ChatWithSources |
| `ThinkingNote` | `chat-widgets/_primitives/ThinkingNote.tsx` | ThinkingStream |
| `PillRow` | `chat-widgets/_primitives/PillRow.tsx` | PickAViewPills, BookingStatusCard, legacy GateChatRail |
| `StatusCard` | `chat-widgets/_primitives/StatusCard.tsx` | BookingStatusCard, BookCallConfirmed, legacy GateChatRail |
| `LoadingDots` | `shared/components/LoadingDots.tsx` (already exists) | GateBotResponse, ThinkingStream |
| `MagicLinkInput` | `chat-widgets/_primitives/MagicLinkInput.tsx` | legacy GateChatRail |

ARCH-03 moves the existing inline implementations into these
primitive files; ARCH-11 extracts ThinkingStream proper.

## Widget catalog (locked 2026-05-26)

Widgets that exist or will exist after ARCH-03..ARCH-11 land:

### Viewer widgets

| Widget | Status | Replaces |
|---|---|---|
| `PdfViewer` | shipped (move-only in ARCH-03) | the dead `shared/components/PdfViewer.tsx` |
| `BookCallView` | shipped (move-only in ARCH-03) | n/a |
| `SignUpWidget` | shipped (ARCH-05 · 2026-05-26) | the canvas half of monolithic `GateView` (deleted in ARCH-05C) |
| `ExtractWorkbench` | future (see `openspec/specs/onboarding-schema-editor/`) | scaffold inside ExtractView |
| `SmartReport` | future | scaffold inside ReportView |
| `InteractCanvas` | future | scaffold inside InteractView |
| `IntegrateBoard` | future (UI-02) | scaffold inside IntegrateView |
| `WorkspacesIndex` | future (UI-05) | placeholder in SteadyShell |

### Chat widgets

| Widget | Status | Replaces |
|---|---|---|
| `BookingStatusCard` | shipped as `BookCallChatPanel` (move + rename in ARCH-03) | n/a |
| `GateChatRail` | legacy (not mounted by live sign-in) | historical chat half of monolithic `GateView` |
| `ChatWithSources` | future (UI-05 / steady) | placeholder in SteadyShell |
| `ThinkingStream` | ARCH-11 | inline `F2ConversationFlow` block in `ChatColumn` |
| `PickAViewPills` | ARCH-11 (extract from F2ConversationFlow) | inline pill row in F2ConversationFlow |

## The full component taxonomy (added 2026-05-26 in ARCH-14)

Beyond the two widget slots, the codebase has three more reusable
component tiers. Five sibling directories under `components/`:

```
components/
  primitives/       ← unbranded atoms. No product context. Pull tokens from theme.
  brand/            ← Gx-prefixed branded molecules + decorative chrome.
  layout/           ← app chrome singletons (mounted at root or once per route).
  chat-widgets/     ← chat-slot widgets (this contract).
  viewer-widgets/   ← viewer-slot widgets (this contract).
```

### `primitives/`

**What lives here:** unbranded atoms — `Button`, `TextField`,
`IconButton`, `Tooltip`, `Heading`, `BodyText`, `Label`, `Caption`,
`LoadingDots`, `DialogTitle`, `DropdownMenu`. Each is a single-purpose
wrapper around an MUI element OR a small composition of one.

**Rules:**

- **Follow MUI where it makes sense.** When a primitive has a clear
  MUI counterpart, mirror MUI's component split (`Button` vs
  `IconButton`, `Dialog` vs `Drawer`, etc.), prop names (`variant`,
  `size`, `color`, `htmlFor`, `aria-label`, `component`, `sx`), and
  variant taxonomy. Don't invent novel APIs for the sake of it. Layer
  brand-locked semantics ON TOP, don't replace. Document any
  deliberate deviation in the primitive's README under a
  "Why split from MUI" or "Why not MUI's X" section — the
  `IconButton/README.md` carries the canonical example (split from
  Button 2026-05-26). See `memory/feedback_follow_mui.md` for the
  full rule + failure modes it prevents.
- No product-specific names. No `Onboarding*`, no `Gx*`, no `Chat*`.
- All visible styling resolves to theme tokens. No inline `fontSize:
  13`, no hex literals, no raw `borderRadius: 6`. The
  no-hardcoded-styles drift guard (`app/src/test/no-hardcoded-styles.test.ts`)
  enforces this for every file under `primitives/` once ARCH-17
  expands its coverage.
- Accept `sx` pass-through so callers can compose without forking.
- Ship a sibling README + test file.
- Should not import from `brand/`, `layout/`, `chat-widgets/`, or
  `viewer-widgets/`. Primitives are at the bottom of the dependency
  tree.

### `brand/`

**What lives here:** branded molecules and decorative chrome —
`GxCard`, `GxPill`, `GxSectionHeader`, `CapabilityBadge`, `CiteChip`,
`ConnectorGlyph`, `DocThumb`, `EducationalTooltip`, `WireframeFilters`.
These have GroundX-specific styling (colors, treatments) baked in.

**Rules:**

- Naming: either `Gx`-prefixed OR named for the specific concept they
  visualize (`CapabilityBadge`, `CiteChip`).
- May compose from `primitives/` but never from widget slots.
- Ship a sibling README + test file.
- All visible styling still resolves to theme tokens — drift guard
  applies here too.

### `layout/`

**What lives here:** app chrome singletons — `AppShell`,
`AppErrorBoundary`, `OnboardingNav`, `StepStrip`, `MotionRoot`. These
are mounted once at the root or once per route. They define the
shape of the screen, not the content.

**Rules:**

- Each must have a clear singleton role; if a thing renders multiple
  times per screen, it's a `brand/` molecule or a widget, not layout.
- May compose from `primitives/` + `brand/`.
- Ship a sibling README + test file (drift-guard expanded in ARCH-17
  will assert this).

### `chat-widgets/` and `viewer-widgets/`

Already documented above (§ The contract, § Slot-specific rules).
They live at the top of the dependency tree — they may import from
any of the three lower tiers.

### Dependency rule (rule 5 — test-backed)

```
viewer-widgets/  →  brand/, primitives/, layout/ (rare) + sibling viewer-widgets/
chat-widgets/    →  brand/, primitives/, layout/ (rare) + sibling chat-widgets/
layout/          →  brand/, primitives/
brand/           →  primitives/
primitives/      →  (theme only)
```

**Rule 5 — dependency direction.** A widget's production source imports
ONLY the three lower tiers (`brand/ · primitives/ · layout/`) and, within
its OWN slot, sibling widgets (e.g. `chat-widgets/ChatColumn` →
`chat-widgets/BookingStatusCard`). A widget
SHALL NOT:

- import from `views/` (a higher-level surface — widgets sit ABOVE views), nor
- import from the OTHER widget slot (`chat-widgets/` ↛ `viewer-widgets/` and
  vice-versa — lift any shared piece to a lower tier instead).

Cycles fail TypeScript's no-cycle ESLint rule and the project's
`madge`-based dependency check — but those catch only *literal* import
cycles. A widget → view → widget cycle (the original `ChatColumn` →
`views/Onboarding/GateChatPanel` → `chat-widgets/GateChatRail`) routes
through a view and slips past them. Rule 5 closes that gap at the
*direction* level: it is enforced by `app/src/test/widget-contract.test.ts`
("rule 5 — dependency direction"), which walks every non-test `.ts`/`.tsx`
under `chat-widgets/` + `viewer-widgets/` and fails on any import resolving
into `views/` (alias `@/views/` or a relative climb) or into the other
widget slot. Test files are exempt (they import views/other widgets as
render targets). A small, sanity-checked allowlist tolerates known
separately-ticketed inversions (today: `Extract` → `SchemaView`, owned by
the `onboarding-shell-shared-view` view-retirement step); new code may not
add to it without an owning ticket.

## Project folder catalog (added 2026-05-26 in ARCH-14)

Every directory under `app/src/`, what it's for, and what it should
NOT contain. The intent is that any spawned agent reading this file
can place a new file correctly without guessing.

| Folder | Purpose | Anti-rule |
|---|---|---|
| `api/` | Frontend HTTP clients for middleware routes. `entities/` = typed Partner API entities. | No React components. No business logic — just request/response shapes. |
| `components/primitives/` | Unbranded atoms. Pull tokens from theme. | No product context. No `Gx*` / `Onboarding*` names. |
| `components/brand/` | Gx-prefixed branded molecules + decorative chrome. | No app singletons (those go to `layout/`). |
| `components/layout/` | App chrome singletons (`AppShell`, `OnboardingNav`, `StepStrip`, etc). | No reusable content — content lives in widgets. |
| `components/chat-widgets/` | Chat-slot widgets. | Must have `mode` prop + README + test. No widget without the contract. |
| `components/viewer-widgets/` | Viewer-slot widgets. | Must have `mode` prop + README + test. |
| `constants/` | **Single theme/token source.** `constants.generated.ts` (brand tokens) + `constants.chrome.ts` (chrome tokens) + barrel. | No business logic. No React. No env-var reads (those go to `lib/`). |
| `contexts/` | React contexts for cross-cutting state. See § Contexts catalog. | No styling. No HTTP — contexts compose `api/` entities. |
| `lib/` | Third-party SDK wrappers (Sentry, PostHog, GA) + non-React utilities. | No React components. No business logic. |
| `router/` | React Router v6 config — `router.tsx` + `routerPaths.ts`. | No view definitions. Routes import views; views never import routes. |
| `shared/hooks/` | Reusable React hooks (`useFocusMode`, `useResizableSplit`). | No components. No JSX. |
| `shared/utils/` | Pure utility functions. | No React. No `lib/` SDK deps. |
| `test/` | Test harness + drift guards (`renderWithOnboardingProviders.tsx`, `scenarioFixtures.ts`, `widget-contract.test.ts`, `no-hardcoded-styles.test.ts`). | No production code. |
| `theme.ts` + `ThemeProvider.tsx` | MUI theme builder. Reads tokens from `constants/`. | No business logic. |
| `types/` | Cross-feature TypeScript types (`onboarding.ts`, `scenarios.ts`, etc.). | No runtime values. Types only. |
| `views/` | Route handlers. Each subfolder = one route (or one route family). After ARCH-19/20: each view is ≤ 20 lines, just composes widgets. | No reusable content — that goes to widgets. No styling — that resolves through primitives. |

### Views catalog (added 2026-05-26)

Each route handler under `views/` is one of:

| Folder | Purpose | Routes | Status |
|---|---|---|---|
| `views/Onboarding/` | F1-F7 flow + OnboardingShell + Gate*. Heavy today; goes on a diet in ARCH-06 + ARCH-10. | `/onboarding/*` | active |
| `views/Steady/` | Post-signup app shell (`/c/:sessionId`). Becomes a thin AppShell mount after ARCH-07. | `/c/:sessionId`, `/c/new` | active |
| `views/Home/` | Auth-aware redirect at `/`. Anonymous → `/onboarding`; signed-in with a persisted ChatStore session → `/c/<id>`; signed-in without one → `/onboarding`. Replaced the scaffold-default 161-line marketing card in ARCH-21 (2026-05-26). | `/` | active |
| `views/Auth/` | Standalone login/register/forgot-password pages. Today partially used for magic-link landing; `openspec/specs/app-architecture/spec.md` carries the requirement to audit per-page load-bearing-ness. | `/auth/*` | partially active; revisit on AU-01 / AU-02 |
| `views/Banned/` | Stub "this account is not available" surface. Kept because the `/banned` route IS load-bearing — `api/axios.ts` redirects there on the archived-customer 403 and `Login.tsx` on the banned-login branch. The text inside is scaffold-default and should grow into a real account-recovery surface (separate follow-up; not in the ARCH epic). | `/banned` | active (stub content; route load-bearing) |
| `views/_scaffold/` | Non-product scaffold pages held away from product directories. Currently houses `Health/` (returns "OK" for k8s probes). Moved here in ARCH-24 (2026-05-26). `AppStatus/` was deleted in the same ticket (no callers, no real product surface). | `/health` | active |

### Contexts catalog (added 2026-05-26)

18 contexts today. Active in the product = 10; scaffold-default
Partner-API state holders that the product doesn't use yet = 8.
The `contexts/` audit requirement lives at
`openspec/specs/app-architecture/spec.md` — most cleanup is deferred
to UI-05 follow-on work.

| Context | Status | Purpose |
|---|---|---|
| `AppModeContext` | active | Onboarding vs steady mode + auth state |
| `AuthContext` | active | Auth state for the scaffold's auth pages |
| `CanvasOrchestratorContext` | active | Which widget the canvas should mount |
| `ChatStoreContext` | active | Multi-session chat + message store |
| `DocumentsContext` | active | GroundX document xray + extract fetches |
| `EntityRegistryContext` | active | Cross-frame entity persistence |
| `LoadingContext` | active | Global spinner overlay |
| `MessageBarContext` | active | Toast / snackbar |
| `OnboardingSessionContext` | active | F-frame state + gate lifecycle + scenario state |
| `OnboardingSkillContext` | active | SDR skill (currently empty stub for plugin system) |
| `ScenarioRegistryContext` | active | Scenarios from `/api/scenarios` middleware route |
| `ApiKeysContext` | scaffold-default | Partner API state — unused by product today |
| `BucketsContext` | scaffold-default | Partner API state — unused by product today |
| `GroupsContext` | scaffold-default | Partner API state — unused by product today |
| `ProjectsContext` | scaffold-default | Partner API state — unused by product today |
| `SearchContext` | scaffold-default | Partner API state — unused by product today |
| `WorkflowsContext` | scaffold-default | Partner API state — unused by product today |
| `HealthContext` | scaffold-default | Partner API state — unused by product today |
| `OnboardingContext` (original) | superseded | Replaced by `OnboardingSessionContext`. Anon-id-tracker stub. |

The scaffold-default contexts get audited during UI-05 follow-on
work — at that point we'll know which become real consumers vs
which are dead. The durable requirement lives at
`openspec/specs/app-architecture/spec.md`.

## Component mapping table (added 2026-05-26 in ARCH-15)

Every file currently under `app/src/shared/components/` mapped to
its new home. Source for ARCH-16 execution. Each row = one move.

### → `components/primitives/`

| Today | New location | Action | Notes |
|---|---|---|---|
| `shared/components/CommonSubmitButton.tsx` | `components/primitives/Button/Button.tsx` | **consolidate** | Becomes `<Button variant="primary">`. Submit = primary + `type="submit"`. |
| `shared/components/CommonCancelButton.tsx` | `components/primitives/Button/Button.tsx` | **consolidate** | Becomes `<Button variant="secondary">`. |
| `shared/components/CommonCloseIcon.tsx` | `components/primitives/IconButton/IconButton.tsx` | **move + rename** | Split from Button per user direction 2026-05-26 ("follow MUI; split"). Becomes `<IconButton icon={...} aria-label={...} />`; defaults `icon=<CloseIcon />` + `aria-label="close"`. |
| `shared/components/CommonTextField.tsx` | `components/primitives/TextField/TextField.tsx` | move + rename | Drop the `Common` prefix. Public API: same. |
| `shared/components/CommonToolTip.tsx` | `components/primitives/Tooltip/Tooltip.tsx` | move + rename | Drop the `Common` prefix. Capitalization fix. |
| `shared/components/LoadingDots.tsx` | `components/primitives/LoadingDots/LoadingDots.tsx` | move | Already brand-neutral. |
| `shared/components/DialogTitle.tsx` | `components/primitives/DialogTitle/DialogTitle.tsx` | move | Wraps MUI DialogTitle with consistent close-X. |
| `shared/components/DropdownMenu.tsx` | `components/primitives/DropdownMenu/DropdownMenu.tsx` | move | MUI Menu wrapper. |
| `shared/components/MotionRoot.tsx` | `components/primitives/MotionRoot/MotionRoot.tsx` | move | Framer-motion config singleton. |
| (new from ARCH-18) | `components/primitives/Heading/Heading.tsx` | **create** | Typography wrapper with `level: "h1" \| "h2" \| ...` and brand defaults. |
| (new from ARCH-18) | `components/primitives/BodyText/BodyText.tsx` | **create** | Typography wrapper for body copy. |
| (new from ARCH-18) | `components/primitives/Label/Label.tsx` | **create** | Typography wrapper for labels / eyebrows. |
| (new from ARCH-18) | `components/primitives/Caption/Caption.tsx` | **create** | Typography wrapper for captions. |
| (new from ARCH-18) | `components/primitives/Stack/Stack.tsx` | **create** | MUI Stack re-export with brand defaults (gap, alignment). |

### → `components/brand/`

| Today | New location | Action | Notes |
|---|---|---|---|
| `shared/components/GxCard.tsx` | `components/brand/GxCard/GxCard.tsx` | move | Already brand-prefixed. |
| `shared/components/GxPill.tsx` | `components/brand/GxPill/GxPill.tsx` | move | Already brand-prefixed. |
| `shared/components/GxSectionHeader.tsx` | `components/brand/GxSectionHeader/GxSectionHeader.tsx` | move | Already brand-prefixed. |
| `shared/components/CapabilityBadge.tsx` | `components/brand/CapabilityBadge/CapabilityBadge.tsx` | move | E / I / R round badges. |
| `shared/components/CiteChip.tsx` | `components/brand/CiteChip/CiteChip.tsx` | move | Citation pill. |
| `shared/components/ConnectorGlyph.tsx` | `components/brand/ConnectorGlyph/ConnectorGlyph.tsx` | move | F7 connector SVGs. |
| `shared/components/DocThumb.tsx` | `components/brand/DocThumb/DocThumb.tsx` | move | Document thumbnail decoration. |
| `shared/components/EducationalTooltip.tsx` | `components/brand/EducationalTooltip/EducationalTooltip.tsx` | move | Branded green-accent tooltip with overlay. |
| `shared/components/WireframeFilters.tsx` | `components/brand/WireframeFilters/WireframeFilters.tsx` | move | Rough-border SVG filter defs. |

### → `components/layout/`

| Today | New location | Action | Notes |
|---|---|---|---|
| `shared/components/AppShell/` | `components/layout/AppShell/` | move | Already a directory. Whole dir moves. |
| `shared/components/AppErrorBoundary.tsx` | `components/layout/AppErrorBoundary/AppErrorBoundary.tsx` | move | Root-level error boundary. |
| `shared/components/OnboardingNav.tsx` | `components/layout/OnboardingNav/OnboardingNav.tsx` | move | App chrome singleton. |
| `shared/components/StepStrip/` | `components/layout/StepStrip/` | move | Already a directory. |

### → into the orphan's view folder (per user direction 2026-05-26)

| Today | New location | Action | Notes |
|---|---|---|---|
| `shared/components/SampleScenarioCard.tsx` | `views/Onboarding/IngestView/SampleScenarioCard.tsx` | move + nest | F1-only — lives with the view that uses it. |
| `shared/components/ByoTile.tsx` | `views/Onboarding/IngestView/ByoTile.tsx` | move + nest | F1-only. |
| `shared/components/OnboardingWizard.tsx` | `views/Onboarding/OnboardingWizard.tsx` | move | Onboarding-only orchestration. |
| `shared/components/SessionSwitcher.tsx` | `views/Steady/SteadyShell/SessionSwitcher.tsx` | move + nest | Steady-only. |

Note: `views/Onboarding/IngestView.tsx` is a file today, not a folder.
ARCH-16 promotes it to `views/Onboarding/IngestView/IngestView.tsx`
so its companions (`SampleScenarioCard`, `ByoTile`) can sit alongside.
Same for `views/Steady/SteadyShell.tsx` → `views/Steady/SteadyShell/SteadyShell.tsx`.

### Net change

- 24 files in `shared/components/` → distributed across `primitives/`
  (9 moved + 5 created from ARCH-18), `brand/` (9), `layout/` (4),
  and 4 nested under their views.
- 3 components consolidate into one `Button` (saves 2 files, simpler
  API).
- `shared/components/` is deleted at end of ARCH-16.
- `shared/hooks/` and `shared/utils/` stay where they are.



**F1 `IngestView` is the explicit exception to this contract.** It
remains an onboarding-only route-level component at
`views/Onboarding/IngestView.tsx`, NOT a viewer widget.

Reason (per locked memory `feedback_no_onboarding_duplicates.md`): F1,
sign-up, and the onboarding-nav are the *only* surfaces the product
will ever render that don't have a steady-mode counterpart. F1 is the
"pick a sample / try BYO / preview the journey" picker shown for the
user's first ~10 seconds before they pick a scenario. There is no
imaginable steady-mode surface that needs the same widget.

Forcing F1 into the contract would require either inventing a steady
surface for it (which won't exist) or building a viewer widget with no
`mode="steady"` branch (which violates the contract). The cleaner
path is to carve it out explicitly here.

The decision to drop the planned F1 widget-conformance refactor in
favor of this exception is recorded in git history (commit messages
referencing the ARCH-04 decision); the durable architecture
requirements live at `openspec/specs/app-architecture/spec.md`.

## How to add a new widget — worked example (`ChipsBar`)

The seven steps below walk a fresh agent from zero to a green
drift-guard in roughly five minutes. The example builds a tiny
`ChipsBar` chat-widget that renders one chip per item and fires an
`onPick(item)` callback. Every step shows the actual file contents
you'd commit. Skim once, follow on the next widget.

The canonical starting point lives at
[`app/src/components/_template/`](../../app/src/components/_template).
Copy it instead of typing from scratch.

### Step 1 — Pick the slot + name

Decision tree:

- Does the widget render inside the chat scroll (between bubbles)?
  → `chat-widgets/`. Examples today: `SuggestedActionChips`,
  `ThinkingStream`, `ProposeSchemaFieldCard`.
- Does the widget render in the viewer pane (the right-hand side)?
  → `viewer-widgets/`. Examples today: `PdfViewer`, `BookCallView`,
  `SignUpWidget`.

For `ChipsBar` we pick **chat-widgets** — it's a chip row beneath an
assistant bubble. Name it `ChipsBar` (PascalCase, no `Widget`
suffix unless ambiguity demands it).

### Step 2 — Copy `_template/` → `chat-widgets/ChipsBar/`

```bash
cp -r app/src/components/_template app/src/components/chat-widgets/ChipsBar
cd app/src/components/chat-widgets/ChipsBar
mv Template.tsx          ChipsBar.tsx
mv Template.test.tsx     ChipsBar.test.tsx
mv Template.tools.ts     ChipsBar.tools.ts
# README.md keeps its name
```

Then rename `Template` → `ChipsBar` everywhere inside those files
(search / replace), and delete the "COPY THIS DIR" header comments.

### Step 3 — Fill in `ChipsBar/README.md`

```markdown
# ChipsBar

**Slot:** `chat-widgets` · **Status:** shipped

## What it does

Renders a horizontal row of pill-shaped chips beneath an assistant
bubble. One chip per item; click fires `onPick(item)`. Used for
quick-pick affordances (sample picker, view picker, action picker).

## Props

```ts
interface ChipsBarProps {
  items: { id: string; label: string }[];
  mode?: "onboarding" | "steady";
  onPick?: (id: string) => void;
}
```

## Locked affordances under `mode="onboarding"`

No mode-conditional behavior today — the prop exists to satisfy the
widget contract and to absorb future onboarding-only locks (e.g.,
disabling destructive picks during guided steps).

## Events

- `onPick(id)` — fires when the user activates a chip via click or
  keyboard Enter / Space.

## How to mount

`​`​`tsx
<ChipsBar
  items={[{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }]}
  mode="onboarding"
  onPick={(id) => console.log("picked", id)}
/>
`​`​`

## LLM tools

`ChipsBar.tools.ts` exposes `pick_chip` (`read`). Tool name uses the
allowlisted `pick_` verb prefix; description carries a "Use when"
clause; the `chipId` parameter on the Zod schema carries a
`.describe()`.
```

### Step 4 — Fill in `ChipsBar.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChipsBar } from "./ChipsBar";

const items = [
  { id: "a", label: "Option A" },
  { id: "b", label: "Option B" },
];

describe("ChipsBar", () => {
  it("renders one chip per item with a stable testid", () => {
    render(<ChipsBar items={items} />);
    expect(screen.getByTestId("chipsbar-chip-a")).toHaveTextContent("Option A");
    expect(screen.getByTestId("chipsbar-chip-b")).toHaveTextContent("Option B");
  });

  it("reflects the mode prop on data-mode", () => {
    const { rerender } = render(<ChipsBar items={items} mode="onboarding" />);
    expect(screen.getByTestId("chipsbar-root")).toHaveAttribute("data-mode", "onboarding");
    rerender(<ChipsBar items={items} mode="steady" />);
    expect(screen.getByTestId("chipsbar-root")).toHaveAttribute("data-mode", "steady");
  });

  it("clicking a chip fires onPick with the item id", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<ChipsBar items={items} onPick={onPick} />);
    await user.click(screen.getByTestId("chipsbar-chip-a"));
    expect(onPick).toHaveBeenCalledWith("a");
  });
});
```

### Step 5 — Implement `ChipsBar.tsx`

```tsx
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC } from "react";

import {
  BORDER,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";

export interface ChipsBarProps {
  items: { id: string; label: string }[];
  mode?: "onboarding" | "steady";
  onPick?: (id: string) => void;
}

export const ChipsBar: FC<ChipsBarProps> = ({ items, mode = "onboarding", onPick }) => {
  if (items.length === 0) return null;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      data-testid="chipsbar-root"
      data-mode={mode}
      sx={{ pl: 0.25, flexWrap: "wrap", rowGap: 0.5 }}
    >
      {items.map((item) => (
        <Box
          key={item.id}
          role="button"
          tabIndex={0}
          data-testid={`chipsbar-chip-${item.id}`}
          onClick={() => onPick?.(item.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onPick?.(item.id);
            }
          }}
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: BORDER_RADIUS_PILL,
            backgroundColor: WHITE,
            border: `1px solid ${BORDER}`,
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            cursor: "pointer",
            "&:hover": { backgroundColor: BORDER },
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
          }}
        >
          {item.label}
        </Box>
      ))}
    </Stack>
  );
};
```

### Step 6 — Declare `ChipsBar.tools.ts`

```ts
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const pickChip: WidgetTool = {
  name: "pick_chip",
  description:
    "Activate one of the chips in the ChipsBar. Use when the user names " +
    "one of the available options or asks to proceed with a specific choice.",
  category: "read",
  input: z.object({
    chipId: z.string().min(1).describe("The id of the chip the user wants to activate"),
  }),
  // ChipsBar's onPick is the host's job. The app declaration is
  // metadata only; the middleware SERVER_TOOL_CATALOG owns any
  // executable intentBuilder once `pick_chip` is wired into a real host.
};

export const tools: WidgetTool[] = [pickChip];
```

### Step 7 — Mount it in a host + verify

```tsx
// Wherever the chat surface decides to render quick-pick chips:
<ChipsBar
  items={proposedPicks}
  mode={isOnboarding ? "onboarding" : "steady"}
  onPick={(id) => activatePick(id)}
/>
```

Then run the verification gate from the scaffold root:

```bash
cd scaffold/app
npx vitest run \
  src/test/widget-contract.test.ts \
  src/test/no-hardcoded-styles.test.ts \
  src/components/chat-widgets/ChipsBar
```

Expected output:

```
 ✓ src/test/widget-contract.test.ts            (29 tests)
 ✓ src/test/no-hardcoded-styles.test.ts        (64 tests)
 ✓ src/components/chat-widgets/ChipsBar/ChipsBar.test.tsx  (3 tests)

 Test Files  3 passed (3)
      Tests  96 passed (96)
```

If the widget-contract guard fails, the error names the missing
piece (README, sibling test, mode prop, or `<Name>.tools.ts` /
`no-llm.md`). Fix and re-run; no other gate is needed for the
widget to land.

## Sanctioned tool-less widgets — the inert trio

The `no-llm.md` fork is NOT a general escape hatch. A widget may be tool-less
ONLY if it ships a `no-llm.md` carrying a specific, reviewed `## Why` (never
boilerplate) — that documented rationale, enforced by `widget-contract.test.ts`,
IS the sanction. The **inert/dispatch trio** below are the canonical exceptions:

| Widget | Why no tool |
| --- | --- |
| `ThinkingStream` | Decorative. A timer-driven reveal of pre-supplied thinking notes — the LLM picks neither the notes nor the timing, so there is no expressive surface to drive. |
| `SuggestedActionChips` | It IS the dispatch UI for tools the router already returned (`reply.suggestedActions[]`). The LLM drives it by emitting actions; a tool to "click its own chip" adds no expressivity. |
| `ChatColumn` | The chat surface itself, not an affordance. Its tools live on the widgets it composes. The LLM already drives the column by being the other side of the conversation; a `send_message` tool would loop. |

Other widgets also currently carry a documented `no-llm.md` opt-out — `BookCallView`,
legacy `GateValueProp`, and legacy `GateChatPanel` (gate/booking chrome that is
presentational or whose actions live on composed widgets). These are NOT silent exemptions: each ships its own
`## Why`, which the guard requires. (Whether any of them should instead expose a real tool
is a separate review — tracked, not assumed-fine.)

Adding a new `no-llm.md` opt-out is a contract decision: it must carry a reviewed `## Why`,
not just be dropped in. This mirrors the `app-architecture` spec requirement
"A tool-less widget SHALL carry a documented no-llm.md rationale."

## How to mount a widget into the AppShell

```tsx
<AppShell
  nav={<OnboardingNav ... />}
  header={<StepStrip ... />}                          // optional
  chat={<ChatScroll>                                  // host scroll
    <ConversationFlow experience={onboardingExperience} />
  </ChatScroll>}
  viewer={
    bookCallActive ? <BookCallView mode="onboarding" /> :
    signUpActive   ? <SignUpWidget mode="onboarding" /> :
    /* otherwise the per-frame viewer widget */
    <PdfViewer documentId={...} mode="onboarding" />
  }
/>
```

Steady mode mounts the same `<AppShell />` with the same widget set,
just with `mode="steady"`. No parallel shell, no different code path.

## Drift-guard test contract

`app/src/test/widget-contract.test.ts` runs on every `npm test`. It:

1. Walks `components/chat-widgets/` + `components/viewer-widgets/`
2. For each widget directory:
   - Asserts a `README.md` exists
   - Asserts a `*.test.tsx` sibling exists
   - Reads the widget's main `.tsx` file
   - Asserts the default-exported component's props type includes `mode`
3. Fails with a clear error pointing at the offending directory if
   any check fails.

When ARCH-03 lands, the test runs against the moved widgets and
passes. Future widgets must conform on landing.

## Anti-examples — what is NOT a widget

The widget contract has a strong floor and ceiling; the cheapest way
to honor both is to recognize the shapes that DON'T belong in
`chat-widgets/` or `viewer-widgets/`. Five running examples from
this codebase:

### `CiteChip` (`components/brand/CiteChip/`)

Not a widget — a **brand primitive**. It renders one citation chip
with a single visual treatment, has no `mode` lock, no host-side
contract, and is composed by widgets (e.g. ChatColumn's live-turn
list maps citations to chips). Rule of thumb: if the component is a
visual atom that other widgets COMPOSE WITH, it belongs in `brand/`.

### `Heading` (`components/primitives/Heading/`)

Not a widget — a **typography primitive**. It's a thin `<h1>`/`<h2>`
wrapper that resolves brand tokens (weights, sizes). No mode prop,
no LLM-callable surface. Rule of thumb: typography wrappers belong
in `primitives/`. They're the building blocks widgets use to render
their content; they're not "widgets" themselves.

### `OnboardingNav` (`components/layout/OnboardingNav/`)

Not a widget — a **layout shell component**. It sits in `AppShell`'s
nav slot and renders the F1-F7 progress strip plus a per-frame
title. It's the chrome AROUND widgets, not a widget itself; the
LLM doesn't navigate via the nav (it dispatches `switchFrame`
intents). Rule of thumb: anything in `layout/` is host chrome —
widgets fill the slots layout components expose.

### `AppShell` (`components/layout/AppShell/`)

Not a widget — the **canonical layout shell** itself. It's the
universe widgets live IN: a flex row that exposes a chat-column slot
and a viewer-pane slot. The shell never renders user-facing content;
it stages widgets that do. Rule of thumb: shells are infrastructure;
their job is to compose widgets, not to be widgets.

### `IconButton` (`components/primitives/IconButton/`)

Not a widget — an **interactive primitive**. It's the icon-only
sibling of `Button`. Both primitives now require a `tool`/`noTool`
prop (widget-llm-integration Phase 5b) so the LLM-drivability gate
fires at compile time, but primitives ARE NOT widgets — they don't
carry mode-conditional affordances, README + test contracts, or
LLM tool declarations of their own. The widget that USES the
primitive declares the tool; the primitive references it via the
`tool="…"` prop. Rule of thumb: if it doesn't have a `mode` lock
and doesn't ship a README, it's not a widget.

## Promote brand → widget

A brand primitive becomes a widget when one or more of the following
fires:

- **Complexity threshold** — the file grows past ~150 LOC OR its
  prop surface adds a third semantic axis (e.g. a `CiteChip` that
  also handles tooltip placement, popover positioning, and inline
  vs. floating renders is no longer "one chip").
- **Multi-instance state** — the component owns state that
  coordinates instances (cross-chip highlighting, focus management
  across a list), and that coordination is host-specific.
- **Mode-conditional affordances** — the component starts taking
  branched behavior on `mode="onboarding"` vs `"steady"` (locked
  controls under one mode, different defaults under the other).
- **LLM-callable surface** — the component owns an in-app action
  the LLM should be able to drive (not just a visual atom inside a
  larger widget's action).

### File-level migration

1. **Move the directory**: `components/brand/<Name>/` →
   `components/chat-widgets/<Name>/` or `components/viewer-widgets/<Name>/`.
   The drift guard's slot walk picks it up automatically.
2. **Update the imports** at every call site. The `@/` alias means
   most files only need the path segment changed.
3. **Add the contract surfaces** the brand-tier file lacked:
   - `README.md` with the 6 required section headers (see "How to
     add a new widget" above for the worked example).
   - Sibling `<Name>.test.tsx` covering both `mode` values + locked
     affordances + every event the widget fires.
   - Either `<Name>.tools.ts` (LLM-drivable) OR `no-llm.md` (with a
     `## Why` justification).
4. **Add the `mode` prop** to the props type. Default it to
   `"onboarding"` unless the brand component was steady-only.

### Test-suite migration

Brand primitives typically have a single visual / a11y test. The
widget-tier sibling test must additionally cover:

- Both modes mount without crashing.
- Locked affordances under `mode="onboarding"` are absent / disabled.
- Every event the widget exposes fires on the documented trigger
  (click, keyboard, postMessage).

Don't delete the brand-tier visual / a11y assertions during the move
— port them into the new widget test. The widget contract is
additive over the brand-tier floor.

### What stays in `brand/`

- Visual atoms — chip + glyph + lockup components that other widgets
  COMPOSE WITH. Once they cross the complexity threshold, they
  promote.
- Brand-token resolvers — components whose only job is to translate
  a brand abstraction (a heading level, a card surface) into the
  exact tokens for the current theme. These never have mode locks.
- Lockups — multi-element brand assemblies (logo + wordmark, etc.)
  that have one canonical render.

If the brand file starts to fit one of the four promotion signals
above, move it.

## Cross-references

- `memory/feedback_no_onboarding_duplicates.md` — the locked rule
  that motivated this contract
- `openspec/specs/app-architecture/spec.md` — architecture-level
  capability spec; this contract is its implementation guide
- `scaffold/docs/agents/architecture.md` — high-level architecture
  this contract slots into
