# Standardize viewer widget shell

## What

Introduce a shared, host-owned viewer shell for all live viewer widget mounts.
The shell owns viewer UX chrome: close/back controls, header rhythm, title /
eyebrow metadata, status/loading banners, outer padding, scroll behavior, focus
containment, and content modes such as centered form, embedded third-party
surface, document canvas, or workbench.

Viewer widgets keep owning their actual product content and behavior. They no
longer draw their own top-level close/back/header/card shell unless a documented
exception is approved by the widget contract.

This is a viewer-slot contract, not a two-widget cleanup. The implementation
must cover both blocking overlays (`sign-up`, `book-call`) and registry-mounted
viewer steps (`doc-viewer`, `extract-workbench`, `report`, `integrate`, etc.).
The central mount path should make the frame the default for future viewer
widgets, so authors opt into a declared content mode instead of inventing new
pane chrome.

The base product experience is the authenticated app: `/workspaces`,
`/projects`, and `/c/:sessionId` mount the canonical shell with chat and viewer
slots. Onboarding is a special overlay/decorator on that base model, not a
separate product architecture. This change must therefore prove the shared
viewer frame on authenticated product routes first, then prove the anonymous
onboarding overlays conform to the same viewer-slot contract.

## Why

The current SignUpWidget and BookCallView prove the architecture gap:

- Sign-up draws a centered card with a text-only close affordance inside the
  card.
- Calendly draws a full-width top bar, its own close icon, and an iframe region.
- Loading, padding, top spacing, and scroll affordances are different even
  though both are session-scoped blocking viewer overlays.

That inconsistency is not just a polish defect. It means the viewer slot does
not yet have a composable outer contract. Each new viewer widget can invent its
own shell and accidentally break the chat/viewer relationship, responsive
behavior, accessibility, or brand rhythm.

## Scope

- Add a shared `ViewerWidgetFrame` shell under the component tier that owns
  viewer chrome.
- Add small common viewer pieces for repeated inner patterns. They must either
  be private subcomponents inside `ViewerWidgetFrame.tsx`, or exported
  components under `app/src/components/layout/ViewerWidgetFrame/` with their own
  sibling README/test coverage:
  `ViewerContentPanel`, `ViewerStatusBanner`, `ViewerLoadingBanner`, and
  `ViewerEmptyState`.
- Add a typed viewer chrome descriptor for host-owned controls:
  close/back action, title, eyebrow, subtitle, status, content mode, and
  optional primary/secondary actions.
- Add a central descriptor path for all live viewer mounts:
  - shared descriptor types and adapters live in
    `app/src/components/layout/ViewerWidgetFrame/viewerFrameDescriptor.ts`;
  - overlay descriptors for `ViewerOverlay` kinds live in
    `app/src/views/Onboarding/viewerOverlayFrameDescriptors.ts` and are owned by
    `OnboardingShell`;
  - production descriptors extend `ScopedViewerWidgetDescriptor` in
    `app/src/widgets/scopedViewerWidget.ts` and are read through
    `app/src/widgets/scopedViewerWidgetRegistryProduction.ts`.
- Make descriptor ownership explicit:
  - production viewer chrome policy lives on the production scoped viewer
    registry entry;
  - overlay viewer chrome policy lives on an overlay descriptor map owned by the
    overlay host;
  - helper functions may adapt typed data to frame props, but must not become
    context-sensitive resolvers or service locators.
- Add an authenticated route matrix to the plan, tests, and browser evidence:
  - signed-in complete `/workspaces`;
  - signed-in complete `/projects`;
  - signed-in complete `/c/:sessionId`;
  - signed-in incomplete onboarding wizard over a product route;
  - anonymous public `/onboarding`;
  - anonymous product-route redirect behavior.
- Authenticated route proof must activate real built viewer content. A route
  that renders only the default `ingest-picker` / unavailable placeholder does
  not satisfy this change. Tests and browser evidence must seed or trigger
  viewer steps that resolve to built `CanvasKind` values such as `doc-viewer`,
  `extract-workbench`, `report`, `report-builder`, and `integrate`.
- Refactor live viewer overlay mounts to use the shared shell:
  - `SignUpWidget`;
  - `BookCallView`;
  - any other viewer overlay active in onboarding, including citation peek if
    it carries its own chrome.
- Refactor the shared `ScopedCanvas` mount path, or an immediately adjacent
  viewer-frame host, so steady/scoped/onboarding canvas widgets are framed by
  default according to the registry descriptor.
- Document the signed-in onboarding wizard boundary: it is a product-route
  overlay, not a viewer widget. It must stay over the authenticated route that
  opened it and must not create a second AppShell/chat/viewer hierarchy. If a
  future wizard step hosts viewer-widget content, that content must use the
  shared viewer frame.
- Audit every active `components/viewer-widgets/*` widget and classify its
  frame policy:
  - `framed` for normal viewer widgets;
  - `edge-to-edge` for document/iframe/canvas content inside the shared frame;
  - `hostless-exception` only when another already-standardized shell owns the
    same chrome, with a test and README note.
- Update widget docs and drift guards so future viewer widgets must declare
  their shell policy.
- Verify the result at desktop, tablet, and mobile widths with Chrome DevTools
  MCP, using measured DOM evidence plus screenshots.

## Out Of Scope

- Replacing AppShell, StepStrip, OnboardingNav, or the chat column.
- Changing Calendly configuration, event handling, or booking intent routing.
- Changing auth backend behavior, SSO, magic-link backend implementation, or
  anonymous-session claim semantics.
- Redesigning the inner content of Extract, Report, PdfViewer, or Integrate
  beyond the outer frame integration required to remove duplicated chrome.
- Creating an OO inheritance hierarchy. The design uses React composition:
  host-owned frame + content widgets + typed chrome metadata.

## Brainstormed approaches

### Option 1 - Local cleanup per widget

Make SignUpWidget and BookCallView visually closer by hand. This is fast, but
it keeps the root cause: every widget still owns its own chrome. The next
viewer widget can drift again.

### Option 2 - Wrapper/HOC inside each widget

Have every viewer widget import and render a shared wrapper internally. This
reduces visual drift but leaves ownership ambiguous: close/back behavior still
gets passed into arbitrary widgets, and it is easy to nest wrappers or bypass
the frame in a one-off test.

### Option 3 - Host-owned viewer shell with widget content inside

Recommended. A central viewer-frame host wraps active widget content in one
`ViewerWidgetFrame`. Overlay hosts pass a descriptor based on
`ViewerOverlay`; `ScopedCanvas` / the scoped viewer registry supplies a
descriptor based on `ViewerStep` / `CanvasKind`. The widget supplies only
content and content-level callbacks. This follows the project principle: add
an axis value (`contentMode`, `chromePolicy`) instead of forking whole
surfaces.

The frame host must distinguish DOM presence from active foreground ownership:
an inert underlay may still contain a frame, but exactly one visible,
non-inert viewer frame is active for keyboard and accessibility purposes.

## Conformance to core architectural decisions

| Principle | Plan |
| --- | --- |
| Composable over forked | Viewer chrome becomes a reusable wrapper and descriptor, not repeated widget-local shell code. The second real caller is the authenticated `ScopedCanvas` / `SteadyShell` route family, not just the two onboarding overlays. |
| Slot ownership | Chat stays chat; viewer stays viewer. The viewer shell owns pane chrome, widgets own content. |
| Authenticated base experience | `/workspaces`, `/projects`, and `/c/:sessionId` are the base product proof path. Anonymous onboarding and signed-in onboarding are overlays/decorators on that model. |
| Compose, do not dispatch | Registry entries and overlay descriptor maps own their frame metadata. Descriptor helpers adapt already-selected entries; they do not resolve context or hide entry-point choices. |
| Brand consistency | Shared frame uses tokens, flat surfaces, navy/body text, hairline borders, and literal uppercase labels. |
| Done = user-visible | Closure requires Chrome DevTools MCP verification across desktop, tablet, and mobile widths for authenticated product routes plus onboarding overlay routes. |
| Drift guard | Tests fail if future viewer widgets omit shell policy or reintroduce top-level close/back/header chrome. |
