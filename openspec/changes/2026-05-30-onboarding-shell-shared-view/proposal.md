# Onboarding shell adopts the shared main view (one experience/scope-driven canvas)

## Why

The target architecture is **one main view that loads chat experiences**, hosted by per-context shells.
Shells stay separate by design (onboarding vs authenticated vs future contexts — different chrome +
entry points). What must be shared is the **view inside them**: chat + an experience/scope-driven canvas.

Today the shell is shared but the canvas inside it is forked:
- `SteadyShell` already mounts the shared `AppShell` (`nav` + `chat` + `canvas`) with `ChatColumn` +
  `PdfViewerWidget` (`views/Steady/SteadyShell/SteadyShell.tsx`).
- `OnboardingShell` ALSO already mounts `AppShell` (`nav` = `OnboardingNav`, `chat` = `GateChatPanel`,
  `canvas` = a `canvasContent` slot) — `views/Onboarding/OnboardingShell.tsx`. What it forks is the
  **canvas**: a **bespoke per-frame `canvasContent` switch** (a `useMemo` keyed on
  `effectiveStepKind` / `session.currentFrame`) that renders standalone `UnderstandView` /
  `ExtractView` / `InteractView` / `IntegrateView`. Those are the duplicated, mock-reading views the
  `no-onboarding-duplicates` rule + `real-data-rewire-gap.md` already flag.

So the canvas is forked: a different surface per onboarding frame, and a different surface again in
steady. That is the last structural blocker to "one main view." This change keeps `OnboardingShell`'s
existing `AppShell` mount but replaces its per-frame `canvasContent` switch with a canvas driven by the
active experience's `ContentScope` + viewer step (the `ScopedViewerWidget` set) rather than a frame switch.

## What

- **`OnboardingShell` keeps its `AppShell` mount; the canvas slot changes.** The shell already mounts
  `AppShell` (`nav` = `OnboardingNav`, `chat` = `GateChatPanel`, `canvas` = `canvasContent`). This change
  replaces the bespoke `canvasContent` per-frame switch with the scope-driven `ScopedViewerWidget` canvas,
  and aligns the chat slot to `ConversationFlow` + an onboarding `ChatExperience` — the same assembly
  `SteadyShell` uses.
- **The canvas is experience/scope-driven.** The mounted viewer widget (PdfViewer · Extract · SmartReport
  · Integrate) is selected by the active viewer step + fed the active experience's `ContentScope` +
  `documentId` — NOT by `session.currentFrame`. The per-frame views become thin wrappers (or are deleted)
  per `real-data-rewire-gap.md`.
- **The entry point composes the experience.** Onboarding's full-screen overlay/picker composes
  `makeOnboardingExperience(...)` and passes it to the shared view (unified-conversation-flow's
  composition model). The shell does not branch on frame to pick a *view*; it picks an *experience*.
- **The gate stays a widget.** `SignUpWidget` / `GateChatPanel` / `GateValueProp` (anonymous-only) are
  shown by the onboarding surface as before — not turned into experiences.
- **Shells are NOT collapsed.** Routes + `OnboardingShell`/`SteadyShell` remain; only the view they host
  is unified.

## Conformance to core architectural decisions

- **`no-onboarding-duplicates`**: deletes the last per-frame standalone canvas views — the canvas is now
  one production `ScopedViewerWidget` surface, fed real data, used identically in both shells.
- **Template/Scope/Results + `ScopedViewerWidget`**: the canvas is exactly the `ScopedViewerWidget`
  contract (takes `scope`, adapts, exposes `show_*`). This change consumes that base, does not fork it.
- **One main view + entry points**: realizes the `real-data-rewire-gap.md` §"One main view" target.

## Dependencies (this is a FOLLOW-ON — runs after the foundations)

- **unified-conversation-flow** — `ConversationFlow` + `ChatExperience` + `makeOnboardingExperience`.
- **core-data-model-hardening** — the `ScopedViewerWidget` base + the 4 viewer widgets onto it.
- **widget-role-access** — the `role` contract (widgets are role-native, not `mode`).
- **smart-report-screen** — the SmartReport canvas widget (one of the four).
- The `real-data-rewire-gap.md` fold of `UnderstandView`/`ExtractView`/`InteractView`/`IntegrateView`.

## Out of scope

- Authoring the **Workspace / Project / document** experiences and enabling the nav-rail entries
  (today disabled stubs in `OnboardingNav`) — tracked in unified-conversation-flow's deferred list.
- Collapsing the shells (explicitly NOT done — shells are per-context by design).
- Per-entry **session selection** (which `chat_sessions` row a nav-rail entry uses).

## Affected

`views/Onboarding/OnboardingShell.tsx` (keep `AppShell` mount, delete `canvasContent` frame switch),
`views/Onboarding/{Understand,Extract,Interact,Integrate}View.tsx` (thin-wrapper or delete),
`views/Steady/SteadyShell` (align canvas to the same scope-driven selector), `components/layout/AppShell`,
the `ScopedViewerWidget` canvas selector, `OnboardingShell.test`. Net **deletion** of the per-frame
canvas fork.
