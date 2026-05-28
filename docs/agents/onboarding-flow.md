# Onboarding Flow (F1–F7)

How a user actually moves through the app. The frame inventory +
the transitions + the rules that decide which surface mounts.

## Frame inventory

| Frame | URL | Canvas content | Chat-column content |
|---|---|---|---|
| F1 | `/onboarding` | IngestView (sample picker + BYO) — mounted as overlay above the AppShell | IdleChatPlaceholder underneath |
| F1 BYO sign-up | `/onboarding/signup` | `sign-up` overlay z-stacked on the current step (master-viewer-session Phase 2). Underlying canvas keeps its content | GateChatPanel |
| F2 | `/onboarding/<bucketId>/<scenarioId>` | UnderstandView (PdfViewerWidget mount; reads doc-viewer ViewerStep when present) | F2ConversationFlow (header + bubbles + streaming notes + Pick-a-view pills + live chat input + CiteChips on assistant turns) |
| F3 | (URL stays at F2's; frame state advances) | ExtractView (schema-driven fields panel + citation chips) — `?focus=<categoryId>` opens to a specific slice | F2ConversationFlow stays mounted (chat persists across F2→F5) |
| F3a | (URL stays the same) | SchemaView — schema-agent loop: inline editor, ProposeCard above the field list, save → sign-in gate. Reached from F3's fields-panel hamburger menu (NOT a chat pill) | F2ConversationFlow with Schema-Agent header chip + earlier-turns compaction summary |
| F4 | — | retired; folded into F3a 2026-05-27 | — |
| F5 | … | InteractView (chat-with-sources placeholder) | F2ConversationFlow continues |
| F6 (gate active) | `/onboarding/signup` OR `/onboarding/<…>?gate=save\|export` | Underlying canvas (whatever step is active) stays mounted; `sign-up` overlay z-stacks on top | GateChatPanel takes over the chat column (legacy bridge — overlay model in viewer; chat side still on `gate.status` until Phase 6 close-out) |
| F7 | … (post-sign-in) | IntegrateView (API snippets + plugin downloads — stub) | IdleChatPlaceholder |

The URL is the **source of truth** for which surface mounts. The
URL → state useEffect in `OnboardingShell` reads `useParams()` + 
`useLocation()` and calls the right session action. Direct
`advanceFrame()` calls from views are short-circuits that don't
change the URL (which is sometimes wrong — prefer navigate).

## Transitions

### F1 → F2 (sample picked OR BYO sign-up clicked)

- User clicks sample card or BYO tile in F1.
- `pickScenario(id)` activates the entity in ChatStore + URL
  navigates to `/onboarding/<bucketId>/<scenarioId>`.
- OnboardingShell's `transitionPhase` flips to `"entering"` for
  ~700ms.
- During entering: F1 stays mounted underneath (`showF1=true`);
  the SlideOverlay renders THREE panes:
  - `nav-pane` (slides in from left)
  - `chat-pane` (slides in from left, same direction + duration)
  - `canvas-pane` (slides in from right)

  Per wireframe, F1 itself has NO nav — the nav appears for the
  first time during this transition. Pane contents are EMPTY
  during entering so internal animations (composing dots, scan
  line) don't pre-fire before the pane arrives.
- After SWIPE_DURATION_MS the phase goes idle, F1 unmounts, the
  AppShell idle render takes over with the real OnboardingNav.

### F2 → F1 (Ingest pill click)

- User clicks Ingest in StepStrip.
- `OnboardingShell.handleStepClick` captures
  `session.scenario` into `leavingScenarioSnapshot` BEFORE the
  navigate fires (the URL change synchronously flips the active
  entity, so we need a frozen copy).
- URL navigates to `/onboarding`.
- `transitionPhase` flips to `"leaving"`.
- During leaving: F1 mounts underneath; SlideOverlay renders all
  three panes sliding OUT (nav + chat to the left, canvas to the
  right). Chat + canvas pane contents are `ChatColumn`
  + `UnderstandView` with `overrideScenarioId={leavingScenarioSnapshot}` + `overrideFrame="f2"` so the user sees the F2 chrome slide away with content intact.
- After SWIPE_DURATION_MS all three panes unmount + the snapshot
  clears. The nav is gone (F1 has no nav per spec).

### F2 → F3 (Pick-a-view pill click)

- Pills are derived from `scenario.manifest.extractionSchema.categories`
  (one pill per category) plus `edit schema`. Schemaless scenarios
  (Solar) get a single `show me chat` pill that jumps to F5.
- Clicking a category pill calls `advanceFrame("f3")` + navigates
  with `?focus=<categoryId>`. ExtractView reads the focus param
  on mount and pre-selects the first field in that category.
- "edit schema" pill goes to F3a. "show me chat" pill goes to F5.

### F5/F6 → F7 (gate committed)

- Gate commit calls `commitGate(method)` which marks
  `state.gate.status = "committed"` + emits a ViewerEvent.
- Frame advance to F7 + URL navigate.

## Scenarios

Three scenarios ship today, loaded via `/api/scenarios` from the
GroundX samples bucket manifest:

| Scenario | Capabilities | Schema | Notes |
|---|---|---|---|
| utility | Extract / Interact | full (statement / meters / charges) | The "aha" reference path: messy bill → clean structured fields with citations |
| loan | Extract / Interact | applicant + risk categories | JSON render-mode toggle on F3 for workflow-handoff demo |
| solar | Interact / Report | none (skips Extract) | F3 shows a "this sample skips extract" message; chat is the demo |

Per-scenario data lives in `app/src/test/scenarioFixtures.ts` (for
tests) and `middleware/src/scenarios/registry.ts` (for the runtime
load). The middleware reads the manifest doc filter from a sample
bucket; updating a scenario's `manifest` means re-running the
seed.

## Chat-column narrative model

`ChatColumn` is the single component for the chat side.
Its dispatch (in order):

1. Gate active (`open` / `committed`) → `<GateChatPanel />`.
2. F2 + scenario picked → `<F2ConversationFlow />` (the wireframe
   conversation: header + sample switcher + user bubble + bot lead
   + streaming italic notes + Done + Pick-a-view pills).
3. F1 → `<IdleChatPlaceholder />` ("Ask anything about the sample…").
4. No scenario → `<ByoChatPlaceholder />` (defensive; in practice
   the gate path covers this).
5. Everything else (F3+) → `<IdleChatPlaceholder />`.

Future F3+ specific conversations land in branches 5 — extend the
dispatch, don't rewrite the whole component.

## Gate (F6)

Three doors (`commitGate(method)`):
- `register` — real Partner API `POST /api/auth/register` + claim
  (was "magic-link" pre-2026-05-25; renamed when the magic-link
  enum stopped tracking an unimplemented backend endpoint).
- `sso` — placeholder for OAuth.
- `engineer-call` — Calendly book-a-call.

Master-viewer-session Phase 2 changes: the gate is now a `sign-up`
ViewerOverlay z-stacked on the current canvas step, not a canvas
swap. The chat-side `GateChatPanel` still drives off the legacy
`gate.status` slot during the transitional bridge — Phase 6 (deferred)
reshapes it into a widget message and retires the slot.

Gate state machine in `OnboardingSessionContext`:

```
idle  →  open  →  committed
             ↘
              dismissed  →  open  (re-trigger replays composing animation)
```

GateChatPanel mounts an N-second typing indicator before the
GateView card fades in (`COMPOSING_DELAY_MS` per trigger). Don't
remove the delay — it's the "agent typing back" beat.

On commit, the `claimAnonymousChat(serializeChatPayload(...))`
utility (in `app/src/api/`) is the hook the auth flow should call
to migrate localStorage content to DB. The exact moment to invoke
it lands when the real sign-in flow does — for now it's a
callable primitive.
