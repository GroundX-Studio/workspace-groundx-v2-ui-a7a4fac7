# Design - standardized viewer widget shell

## Problem statement

The viewer slot has a widget taxonomy but not a viewer-frame contract. Current
viewer widgets correctly live under `components/viewer-widgets/`, but they also
own inconsistent chrome: close/back controls, outer cards, padding, iframe
loading surfaces, and scroll behavior. That violates composability because the
same slot produces different UX rules depending on which widget happens to be
mounted.

The screenshots show this clearly: sign-in appears as a centered form card with
an internal text close action, while Calendly appears as a full-pane iframe with
a separate close bar. Both are blocking session-scoped viewer overlays, so the
outer behavior should be the same even though the content is different.

## Recommended architecture

Create a shared `ViewerWidgetFrame` mounted by the viewer host, not by each
widget. The frame receives a typed descriptor and renders the standard chrome.
Add a small `ViewerFrameHost` / descriptor helper so both overlay mounts and
`ScopedCanvas` registry mounts go through the same frame decision.

The design treats the authenticated product shell as the base case. The
anonymous onboarding flow and signed-in onboarding wizard are overlays or
decorators on the same model, not alternate shell architectures. A viewer frame
that only works for `/onboarding/signup` and `?bookCall=1` has not solved the
problem.

Conceptual API:

```ts
type ViewerContentMode =
  | "centered-panel"
  | "padded-scroll"
  | "edge-to-edge"
  | "embed";

type ViewerChromePolicy =
  | "framed"
  | "edge-to-edge"
  | "hostless-exception";

interface ViewerFrameAction {
  id: string;
  label: string;
  icon?: "back" | "close" | "external" | "download" | "save";
  testId?: string;
  onClick: () => void;
}

interface ViewerWidgetFrameProps {
  widgetId: string;
  active: boolean;
  chromePolicy: ViewerChromePolicy;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  closeAction?: ViewerFrameAction;
  primaryAction?: ViewerFrameAction;
  secondaryActions?: ViewerFrameAction[];
  contentMode: ViewerContentMode;
  loading?: { label: string } | null;
  status?: React.ReactNode;
  children: React.ReactNode;
}
```

The exact prop names may change during implementation, but the ownership must
not: the host owns frame controls and layout; the widget owns content.

The frame must expose stable state attributes, not only test ids:
`data-testid="viewer-widget-frame"`, `data-viewer-frame-active="true|false"`,
and `data-viewer-content-mode="<mode>"`. Tests should count active frames by
visible, non-inert state; inactive underlay frames may remain mounted.

## Route and auth model

The frame contract must be proven across the route/auth matrix below.

| State | Route | Expected shell behavior |
| --- | --- | --- |
| Signed-in, onboarding complete | `/workspaces` | Product route stays mounted. `ScopedConversationShell` composes `AppShell`, one `ConversationFlow`, and registry-mounted viewer widgets through the shared frame when a viewer step is active. |
| Signed-in, onboarding complete | `/projects` | Same as `/workspaces`, with project scope as the selected `ContentScope`. No anonymous sign-up surface is mounted. |
| Signed-in, onboarding complete | `/c/:sessionId` | `SteadyShell` composes the active chat session and mounts `ScopedCanvas` viewer content through the shared frame when a viewer step resolves to a built `CanvasKind`. |
| Signed-in, onboarding incomplete | `/workspaces`, `/projects`, or `/c/:sessionId` | The signed-in onboarding wizard opens over the current product route without changing the pathname or creating a second AppShell/chat/viewer tree. The wizard is not a viewer widget unless a step explicitly hosts viewer-widget content; any such content must use the shared frame. |
| Anonymous | `/onboarding` and sample routes | Public onboarding remains reachable. `SignUpWidget`, `BookCallView`, and other viewer overlays use the same frame contract while `ConversationFlow` remains the chat surface. |
| Anonymous | `/workspaces`, `/projects`, or `/c/:sessionId` | Product-route auth handling redirects or gates according to the existing router/auth policy. It must not open the signed-in wizard or mount anonymous viewer overlays inside product routes. |

This matrix is part of done. Unit tests and browser evidence must cover it, not
only the two widgets from the screenshots.

Authenticated route assertions must activate a real built viewer step. The
default `ScopedConversationShell` viewer state falls back to `ingest-picker`,
which maps to the unavailable placeholder and does not prove a widget-frame
contract. Route tests and browser verification must seed or trigger viewer steps
that map to built `CanvasKind` values:

- `/workspaces` and `/projects`: use the chat store/viewer API, a tool response,
  or a fixture action to push at least one of `{ kind: "extract-workbench" }`,
  `{ kind: "report" }`, `{ kind: "integrate" }`, or a valid `doc-viewer` step.
- `/c/:sessionId`: open an existing chat session with a `doc-viewer` step or
  click a citation/tool action that calls the same viewer-step path used by the
  product.
- Every proof must assert that `stepToCanvasKind(...)` is non-null for the
  mounted step, `scoped-canvas-unavailable` is absent, and the active frame wraps
  the real widget body for the resolved `data-canvas-kind`.

Browser verification also needs explicit auth/data seeding. Use the root
`npm run dev` command with the local mock/memory backing store required for
repeatable browser tests, then record how each state was created:

```bash
MOCK_MODE=true APP_REPOSITORY_MODE=memory npm run dev
```

The browser pass must create or load:

- a signed-in user with onboarding complete;
- a signed-in user with onboarding incomplete;
- an anonymous session for public onboarding and product-route redirect/gate
  checks;
- seeded sample data sufficient to resolve at least one built viewer step on
  `/workspaces`, `/projects`, and `/c/:sessionId`.

## Descriptor ownership

Frame metadata is data owned by the entry that selected the viewer content:

- Production `CanvasKind` entries declare their viewer chrome policy and content
  mode in the production scoped viewer registry.
- Overlay hosts declare viewer chrome policy and content mode in an explicit
  overlay descriptor map for `sign-up`, `book-call`, and any future overlay kind.
- Adapter helpers may convert an already-selected descriptor into
  `ViewerWidgetFrameProps`, but they must not inspect global app context to pick
  a widget, route, or mode.

This keeps the registry a catalog and the route/shell a composition root. It
also gives drift guards one source of truth for every frame policy.

The concrete source-of-truth files are:

- `app/src/components/layout/ViewerWidgetFrame/viewerFrameDescriptor.ts` -
  shared descriptor types, frame action types, and pure adapter helpers only.
- `app/src/widgets/scopedViewerWidget.ts` - extends
  `ScopedViewerWidgetDescriptor` with production viewer-frame metadata.
- `app/src/widgets/scopedViewerWidgetRegistryProduction.ts` - runtime catalog
  read path for production `CanvasKind` descriptors and mounted components.
- `app/src/views/Onboarding/viewerOverlayFrameDescriptors.ts` - explicit
  `ViewerOverlay` descriptor map for `sign-up`, `book-call`, and other
  onboarding overlay kinds.

No other file may create an alternate `CanvasKind` or `ViewerOverlay` to frame
descriptor map.

## Component responsibilities

| Unit | Responsibility |
| --- | --- |
| `ViewerWidgetFrame` | Standard outer viewer shell: header, close/back action, optional title area, loading/status band, content-mode padding, scroll bounds, focus landmarks, and test handles. |
| `ViewerFrameHost` / descriptor helper | Adapts already-selected registry or overlay descriptors into `ViewerWidgetFrameProps`; centralizes the active/inert frame decision without resolving route context. |
| `ViewerContentPanel` | Inner white panel for centered forms or compact explanatory states. No close/back, no top-level frame. |
| `ViewerStatusBanner` | Inline status row for loading, errors, or external-service notices. Used by the frame so loaders do not float over third-party embeds. |
| `ViewerEmptyState` | Standard centered empty/error state for unset data or unavailable integrations. |
| `ScopedCanvas` or adjacent frame host | Wraps registry-mounted viewer widgets with the descriptor declared by the production scoped viewer registry. |
| `OnboardingShell` | Builds overlay descriptors from active `ViewerOverlay` records and remains the owner of close/back navigation and overlay stacking for anonymous onboarding viewer overlays. |
| `SteadyShell` / `ScopedConversationShell` | Prove the authenticated base case by consuming the same `ScopedCanvas` frame path on `/c/:sessionId`, `/workspaces`, and `/projects`. |
| `OnboardingWizard` | Signed-in product-route onboarding overlay. It does not own viewer-widget chrome and must not fork AppShell; if it later hosts viewer content, it delegates that content to the shared frame path. |
| Viewer widgets | Render content only. They may expose content-level events such as `onSubmit`, `onScheduled`, `onFieldSelect`, or `onOpenExternal`, but not top-level close/back chrome. |

Common viewer pieces follow the component-tier contract. If
`ViewerContentPanel`, `ViewerStatusBanner`, `ViewerLoadingBanner`, or
`ViewerEmptyState` are exported, they live under
`app/src/components/layout/ViewerWidgetFrame/` with sibling README and test
coverage. If they are not exported, they stay private inside
`ViewerWidgetFrame.tsx` and are covered by `ViewerWidgetFrame.test.tsx`.

## Frame variants

`centered-panel` is for forms and compact account flows such as sign-in. The
frame supplies the pane gutter and optional header; the widget renders a
`ViewerContentPanel` with the form.

`embed` is for third-party surfaces such as Calendly. The frame supplies the
header and loading/status band above the embed. The widget owns only the iframe
mount region and any third-party event handling.

`edge-to-edge` is for document and canvas-style widgets such as PDF viewing.
The frame may be visually minimal, but it still declares the policy and owns
any host-level controls.

`padded-scroll` is for workbench surfaces such as Extract or Report where the
content naturally scrolls inside a standard viewer pane.

## Action ownership

Frame actions are host/navigation actions: close sign-in, back to samples,
close booking, open external document, save/download from a host toolbar, and
other controls that affect the viewer slot rather than the content model.
Content actions stay in widgets: submit sign-up, send magic link, continue with
SSO, book a call from sign-in, accept/reject a proposal, edit a schema field, or
select a report section. If a control is ambiguous, prefer widget ownership only
when it is part of the widget's domain workflow and does not replace the frame's
close/back/header role.

Widget-owned content controls are preserved. PDF thumbnail strips, PDF zoom,
Extract field controls, Report section controls, Integrate connector controls,
and editor-local close/menu actions remain inside the owning widget when they are
part of the content workflow. The shared frame removes duplicated pane chrome; it
does not flatten legitimate widget UI into a global toolbar.

## Active and inert frames

Overlay stacking can legitimately leave multiple frames in the DOM. For
example, the sample viewer underlay may contain a frame, sign-in may contain a
second frame, and booking may be pushed over sign-in. The contract is not "one
frame element in the whole DOM"; it is "one visible, non-inert, active viewer
frame for the foreground viewer." Inactive underlay frames must be inside
`aria-hidden` / inert containers and mark `data-viewer-frame-active="false"`.
The foreground frame marks `data-viewer-frame-active="true"` and owns the only
keyboard-reachable close/back action.

## Calendly loading lifecycle

The booking frame shows a status/loading band immediately when the booking
overlay opens and before the Calendly iframe/script has produced visible
content. `BookCallView` should expose embed lifecycle state to the host or
frame through a small callback/state prop:

- `initializing`: URL/config accepted, no iframe element yet;
- `embedding`: iframe/container inserted but iframe has not fired `load`;
- `ready`: iframe fired `load` or Calendly emitted a known ready/scheduled event;
- `error`: URL missing, script error, or timeout fallback.

The loading band is visible for `initializing` and `embedding`, hidden for
`ready`, and replaced by an error/status banner for `error`. It must be laid out
above the embed body, not absolutely positioned over the iframe.

## Migration strategy

1. Add the frame and primitive components with tests.
2. Add the central descriptor path for overlay descriptors and production
   `ScopedCanvas` / registry descriptors.
3. Add failing route/widget tests showing SignUpWidget and BookCallView share
   the same frame header, close/back handle, and content bounds.
4. Add failing authenticated-base route tests showing `/workspaces`,
   `/projects`, and `/c/:sessionId` consume the same frame path for
   registry-mounted viewer content, and that the signed-in onboarding wizard
   stays over the product route without introducing a parallel shell.
5. Migrate SignUpWidget to content-only:
   - remove the widget-owned outer full-height centering shell;
   - remove its top-level close/back button;
   - keep the form, magic-link/SSO, book-call action, validation, and submit
     behavior.
6. Migrate BookCallView to content-only:
   - remove widget-owned close bar;
   - move loading display into the frame status band;
   - keep Calendly embed asset loading, event handling, unset-url state, and
     mobile external fallback.
7. Audit remaining viewer widgets and classify their shell policy. Migrate any
   duplicated top-level chrome discovered by the audit.
8. Update docs and drift guards so the contract remains enforceable.

## Accessibility and responsive behavior

The frame must expose a stable landmark and label for the active viewer widget.
The close/back action must be keyboard reachable, have a concrete label, and
use a consistent icon treatment. The frame is a labelled `region` by default,
not a modal dialog, because chat must remain reachable through the surrounding
AppShell controls. Blocking overlays still inert the underlay at the
viewer-stack level. If a future viewer must trap focus, that must be declared
as a separate modal policy and tested separately.

Desktop and tablet use the same frame rhythm. Compact layouts may foreground
the viewer, but the frame chrome remains consistent and the chat toggle remains
outside the widget content.

## Brand rules

The frame and primitives use the GroundX Studio visual system:

- Inter for product UI.
- Navy and Body Text for text, not black.
- Flat white surfaces with hairline Border.
- Green for go/commit states; coral for labels/highlight only.
- Literal uppercase labels for eyebrows.
- No shadows, gradients, or locally-minted hex values.

## Rejected designs

Per-widget restyling was rejected because it leaves no durable guard. An OO
base-class or inheritance pattern was rejected because React composition is the
local idiom and keeps widget content independently testable. A widget-internal
wrapper was rejected because close/back behavior belongs to the host that owns
navigation and overlay stacking.

## Verification target

The user-visible pass is:

- Authenticated `/workspaces`, `/projects`, and `/c/:sessionId` routes preserve
  one product shell and use the shared viewer frame for active registry-mounted
  viewer content.
- The signed-in onboarding wizard opens over the current product route without
  changing route or creating a parallel AppShell/chat/viewer hierarchy.
- Sign-in and Calendly share the same viewer frame header and close/back
  treatment.
- The SignUpWidget content no longer appears as an unrelated card floating in
  a differently padded pane.
- Calendly loading is visible while the pane would otherwise be blank and does
  not overlay the loaded Calendly widget.
- Desktop, tablet, and mobile screenshots show consistent spacing and chrome.
- Tests fail if a future viewer widget bypasses the shell contract.
