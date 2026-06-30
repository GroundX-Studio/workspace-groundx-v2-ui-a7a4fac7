# Design — Onboarding shell adopts the shared main view

## Current state (evidence)

- `views/Steady/SteadyShell/SteadyShell.tsx` — mounts `AppShell` with `nav={OnboardingNav}`,
  `chat={<ChatColumn mode="steady"/>}`, `canvas={PdfViewerWidget | placeholder}`. The shared-view
  primitive already works here.
- `views/Onboarding/OnboardingShell.tsx` — ALREADY mounts `AppShell` (`nav` = `OnboardingNav`,
  `chat` = `GateChatPanel`, `canvas` = a `canvasContent` slot). The fork is in that canvas slot: a
  `canvasContent` `useMemo` that switches on `effectiveStepKind` / `session.currentFrame` to render
  standalone `UnderstandView` / `ExtractView` / `InteractView` / `IntegrateView` / `IngestView` /
  `BookCallView` / `GateValueProp`. This is the per-frame canvas fork.
- `components/layout/AppShell/AppShell.tsx` — already a slot primitive: `nav` + (header) + `chat` +
  `canvas`, with focus modes, `hideNav`, `hideChat`, compact/drawer. Built to host either shell.
- `components/layout/OnboardingNav/OnboardingNav.tsx` — Workspaces/Projects entries exist but disabled.
- The per-frame views read `scenario.manifest.*` (mock) — the drift `real-data-rewire-gap.md` documents.

## Target

### 1. One `AppShell` main view, hosted by both shells
`OnboardingShell` already mounts `AppShell` like `SteadyShell` does; this change swaps its bespoke
`canvasContent` slot for the shared scope-driven canvas (and aligns the chat slot to `ConversationFlow`):
```tsx
<AppShell
  nav={<OnboardingNav .../>}
  chat={<ConversationFlow chatSessionId={activeId} experience={onboardingExperience} />}
  canvas={<ScopedCanvas scope={experienceScope} step={viewer.currentStep} />}
  hideChat={isF1}            // F1 picker is the overlay entry, no chat yet
/>
```
The difference between shells collapses to: which `nav`, whether the onboarding overlay/picker is shown,
and which `experience` is composed. The `chat` and `canvas` are the same components.

### 2. The canvas is experience/scope-driven — `<ScopedCanvas>`
A single selector replaces the per-frame switch. It maps the active **viewer step kind** to the
`ScopedViewerWidget` to mount, and feeds it the active experience's `ContentScope` + `documentId`:
```tsx
function ScopedCanvas({ scope, step, role }: { scope: ContentScope; step: ViewerStep; role: WidgetRole }) {
  switch (step.kind) {
    // Widgets take a required `scope: ContentScope` (no raw `documentId` prop — widget-role-access rule 6).
    // Read ONLY fields the real ViewerStep arm carries (ChatStoreContext/types.ts):
    //   doc-viewer → { documentId };  extract-workbench → { scenarioId };  report/integrate → {} (scope only).
    case "doc-viewer":        return <PdfViewerWidget   scope={{ type: "documents", documentIds: [step.documentId] }} role={role} />;
    case "extract-workbench": return <ExtractWidget     scope={scope} role={role} />;   // doc set comes from the experience scope
    case "report":            return <SmartReportWidget scope={scope} role={role} />;
    case "integrate":         return <IntegrateWidget   scope={scope} role={role} />;
    case "interact-chat":     return <PdfViewerWidget   scope={scope} role={role} />;  // chat is the chat slot; canvas shows the cited source being discussed
    // ingest-picker / book-call / gate-value-prop are pre-conversation / widget surfaces — see §4
  }
}
```
This is NOT a new abstraction — it is the `ScopedViewerWidget` contract (core-data) consumed at the
canvas slot. `session.currentFrame` is no longer on the canvas render path; it survives only as derived
state for the StepStrip pills (already the case per the OnboardingShell comments).

### 3. The entry point composes the experience (no frame→view branching)
The shell picks an **experience**, not a view. In the onboarding journey it composes
`makeOnboardingExperience({ scenarioId, thinkingScript })` (unified-conversation-flow). The experience
carries the `ContentScope` the canvas renders. Frame advances (f2→f5) change the **viewer step**, which
`<ScopedCanvas>` reacts to — they do not select a different bespoke view.

### 4. Pre-conversation + widget surfaces stay
- **F1 ingest picker** = the onboarding overlay entry (full-screen, no chat) — keep, drive via `hideChat`.
- **Gate** = widgets (`GateChatPanel` in chat, `GateValueProp`/`BookCallView` in canvas, `SignUpWidget`
  overlay). Shown by the onboarding surface as today; NOT experiences. The canvas may show
  `GateValueProp`/`BookCallView` as a widget when the gate/book-call is active — that's a widget mount,
  not a per-frame standalone view.

### 5. The per-frame views
Per `real-data-rewire-gap.md`: `UnderstandView`/`ExtractView`/`InteractView`/`IntegrateView` either
become thin wrappers that delegate to the production widget (transitional) or are deleted once
`<ScopedCanvas>` mounts the widgets directly. Endpoint: deleted; `<ScopedCanvas>` is the single selector.

## Why this shape (vs alternatives)
- **vs collapsing the shells**: rejected (per product) — onboarding vs authenticated are different
  contexts with different chrome + entry points, and future contexts may want their own shell. Only the
  VIEW is shared.
- **vs keeping the per-frame canvas switch**: that IS the fork `no-onboarding-duplicates` forbids; it
  re-implements the canvas per frame and reads mock manifest data.
- **vs a new canvas abstraction**: none introduced — `<ScopedCanvas>` is a thin selector over the
  existing `ScopedViewerWidget` contract.

## Risks / watch-items
- **Ordering**: depends on `ScopedViewerWidget` + the 4 viewer widgets (core-data) and `ConversationFlow`
  (unified-conversation-flow) already shipping. Sequence LAST among the foundation set.
- **StepStrip / pills**: must keep working off derived `currentFrame`/viewer-step state after the canvas
  stops switching on frame — pin with the existing OnboardingShell tests.
- **F1 overlay**: ensure `hideChat` + the picker overlay reproduce today's F1 (no chat, picker grid).
- **Gate widget surfaces in canvas**: `GateValueProp`/`BookCallView` mount as widgets, not views — verify
  they still appear at the right gate/book-call moments.
