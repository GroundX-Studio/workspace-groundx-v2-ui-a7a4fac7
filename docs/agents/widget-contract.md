# Widget Contract

> **Status: locked 2026-05-26.** Backlog tickets ARCH-01..ARCH-13 implement
> this contract. The drift-guard test at
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

3. Accept a `mode: "onboarding" | "steady"` prop that locks editable
   affordances when set to `"onboarding"`:
   - Chat widgets: locked affordances mean the user can't send custom
     messages outside the scripted thinking-stream; the input is
     present but greyed.
   - Viewer widgets: locked affordances mean editable controls
     (toolbars, dropdowns, save buttons) are hidden, but read-only
     viewing is still functional.

4. Ship a sibling `README.md` describing:
   - What the widget does + what slot it occupies
   - Required + optional props (including config-only knobs)
   - Locked affordances under `mode="onboarding"`
   - Events / callbacks it fires
   - How the host wires it (one-line integration example)

5. Ship a sibling `.test.tsx` covering:
   - Mounts in both modes without crashing
   - Locked affordances are absent / disabled when `mode="onboarding"`
   - Required events fire on user action

The drift-guard test (`app/src/test/widget-contract.test.ts`)
auto-discovers all widgets and enforces 1, 2, 4, 5.

## Slot-specific rules

### Chat widgets

- Render inside the chat scroll body (the `OnboardingChatColumn`
  conversation flow or the steady `ChatWithSources` stream).
- Use the canonical chat primitives from
  `components/chat-widgets/_primitives/` (see "Primitives" below).
- Should be vertically composable — multiple chat widgets stack in the
  scroll body without ceremony.
- Never render anything full-bleed; respect the chat column's padding.

### Viewer widgets

- Render inside the viewer pane (right of the resize handle).
- Fill the pane: `width: 100%, height: 100%`. The AppShell handles
  edges + scrolling; widgets don't manage their own outer width.
- May ship their own toolbar / thumbnail strip / footer as long as
  those parts are locked behind `mode="onboarding"` where appropriate.
- Heavy data fetches are the widget's responsibility, but the widget
  must surface loading + error states inline.

## Primitives

Shared, slot-scoped UI primitives the widgets compose from. These
themselves are NOT widgets — they're the building blocks. Locked
2026-05-26 catalog:

| Primitive | Location | Used by |
|---|---|---|
| `BotBubble` | `chat-widgets/_primitives/BotBubble.tsx` | ThinkingStream, GateBotResponse, ChatWithSources |
| `UserBubble` | `chat-widgets/_primitives/UserBubble.tsx` | ThinkingStream, ChatWithSources |
| `ThinkingNote` | `chat-widgets/_primitives/ThinkingNote.tsx` | ThinkingStream |
| `PillRow` | `chat-widgets/_primitives/PillRow.tsx` | PickAViewPills, GateChatRail, BookingStatusCard |
| `StatusCard` | `chat-widgets/_primitives/StatusCard.tsx` | BookingStatusCard, GateChatRail, BookCallConfirmed |
| `LoadingDots` | `shared/components/LoadingDots.tsx` (already exists) | GateBotResponse, ThinkingStream |
| `MagicLinkInput` | `chat-widgets/_primitives/MagicLinkInput.tsx` | GateChatRail |

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
| `ExtractWorkbench` | future (per backlog UI-01) | scaffold inside ExtractView |
| `SmartReport` | future | scaffold inside ReportView |
| `InteractCanvas` | future | scaffold inside InteractView |
| `IntegrateBoard` | future (UI-02) | scaffold inside IntegrateView |
| `WorkspacesIndex` | future (UI-05) | placeholder in SteadyShell |

### Chat widgets

| Widget | Status | Replaces |
|---|---|---|
| `BookingStatusCard` | shipped as `BookCallChatPanel` (move + rename in ARCH-03) | n/a |
| `GateChatRail` | shipped (ARCH-05 · 2026-05-26) | the chat half of monolithic `GateView` (deleted in ARCH-05C) |
| `ChatWithSources` | future (UI-05 / steady) | placeholder in SteadyShell |
| `ThinkingStream` | ARCH-11 | inline `F2ConversationFlow` block in `OnboardingChatColumn` |
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

### Dependency rule

```
viewer-widgets/  →  brand/, primitives/, layout/ (rare)
chat-widgets/    →  brand/, primitives/, layout/ (rare)
layout/          →  brand/, primitives/
brand/           →  primitives/
primitives/      →  (theme only)
```

Cycles fail TypeScript's no-cycle ESLint rule and the project's
`madge`-based dependency check.

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
| `views/Auth/` | Standalone login/register/forgot-password pages. Today partially used for magic-link landing; ARCH-23 (P2) audits whether each page is still load-bearing. | `/auth/*` | partially active; revisit on AU-01 / AU-02 |
| `views/Banned/` | Stub "this account is not available" surface. Kept because the `/banned` route IS load-bearing — `api/axios.ts` redirects there on the archived-customer 403 and `Login.tsx` on the banned-login branch. The text inside is scaffold-default and should grow into a real account-recovery surface (separate follow-up; not in the ARCH epic). | `/banned` | active (stub content; route load-bearing) |
| `views/_scaffold/` | Non-product scaffold pages held away from product directories. Currently houses `Health/` (returns "OK" for k8s probes). Moved here in ARCH-24 (2026-05-26). `AppStatus/` was deleted in the same ticket (no callers, no real product surface). | `/health` | active |

### Contexts catalog (added 2026-05-26)

18 contexts today. Active in the product = 10; scaffold-default
Partner-API state holders that the product doesn't use yet = 8
(ARCH-25 audits these — most are deferred to UI-05 wiring).

| Context | Status | Purpose |
|---|---|---|
| `AgentToolBusContext` | active | Dispatches LLM tool calls to widgets |
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

ARCH-25 audits the scaffold-default contexts during the UI-05
work — at that point we'll know which become real consumers vs
which are dead.

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

ARCH-04 in the backlog records the decision to drop the planned F1
refactor in favor of this exception.

## How to add a new widget

1. Decide the slot: does it render in the chat scroll (chat-widget) or
   the viewer pane (viewer-widget)?

2. Create the directory under `components/<slot>-widgets/<Name>/`.

3. Write the README first. Document props, locked affordances under
   `mode="onboarding"`, and the host-side wiring. This is the contract
   surface; everything else implements it.

4. Write the `.test.tsx` next. Failing tests covering both modes,
   locked affordances, and required event firings.

5. Implement the widget. Compose from primitives where possible.

6. Run `npm test app/src/test/widget-contract.test.ts` — the
   drift-guard should pass without modification.

## How to mount a widget into the AppShell

```tsx
<AppShell
  nav={<OnboardingNav ... />}
  header={<StepStrip ... />}                          // optional
  chat={<ChatScroll>                                  // host scroll
    <ThinkingStream mode="onboarding" ... />
    <PickAViewPills mode="onboarding" ... />
    <GateChatRail mode="onboarding" ... />            // when gate open
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

## Cross-references

- `memory/feedback_no_onboarding_duplicates.md` — the locked rule
  that motivated this contract
- `scaffold/docs/agents/backlog.md` Epic: ARCH — execution tickets
- `scaffold/docs/agents/architecture.md` — high-level architecture
  this contract slots into
- `scaffold/docs/agents/harness-audit-widget-architecture.md` —
  authored at end of epic per ARCH-13; the memo to the harness team
  asking them to codify this contract scaffold-side
