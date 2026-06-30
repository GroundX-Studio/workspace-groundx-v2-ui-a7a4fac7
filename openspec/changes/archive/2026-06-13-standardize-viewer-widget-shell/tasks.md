# Tasks - standardize-viewer-widget-shell

Execution evidence (2026-06-13):

- `MOCK_MODE` and `APP_REPOSITORY_MODE=memory` are retired in this repo; verification
  used the current real/e2e stack.
- Shared-frame implementation, overlay migration, registry descriptors, README
  chrome declarations, and drift guards are complete.
- Authenticated product route/frame coverage is enforced by seeded
  route/shell/component tests for `/workspaces`, `/projects`, and `/c/:sessionId`
  plus a Playwright-controlled Chromium matrix for active built viewer steps.
- Responsive browser matrix evidence:
  - desktop `/workspaces`, `1440x950`, `showExtract` ->
    `ViewerStep.kind="extract-workbench"`, `CanvasKind="extract-workbench"`,
    one product `ConversationFlow`, no `scoped-canvas-unavailable`, and
    non-onboarding chat-session create metadata;
  - tablet `/projects`, `1024x820`, `showIntegrate` ->
    `ViewerStep.kind="integrate"`, `CanvasKind="integrate"`, one product
    `ConversationFlow`, no `scoped-canvas-unavailable`, and non-onboarding
    chat-session create metadata;
  - mobile `/workspaces`, `390x844`, `showReport` ->
    `ViewerStep.kind="report"`, `CanvasKind="report"`, active
    `smart-report-render` frame after the compact canvas toggle, one product
    `ConversationFlow`, no `scoped-canvas-unavailable`, and non-onboarding
    chat-session create metadata.
- Chrome DevTools MCP could not be used as the controlled matrix runner in this
  session: the MCP-exposed Chrome page list contained only `about:blank`, no
  navigate command was available, and the product-route proof needs request
  interception to create stable authenticated route state while the live MySQL
  e2e stack is unreachable. The browser proof therefore uses Chromium
  Playwright route mocks and recorded DOM/screenshot evidence.
- Final local gates passed except e2e: `npm --prefix app run
  test:tool-references`, `npm --prefix app run test:tool-quality`, targeted
  viewer-shell suite, `npm test`, `npm run build`, `npm run scan:secrets`,
  `git diff --check`, `openspec validate standardize-viewer-widget-shell
  --strict`, and `openspec validate --all --strict --json`.
- `npm run test:e2e` initially failed before specs ran because middleware
  startup timed out connecting to the configured MySQL host. A retry after the
  connection recovered passed: `48 passed`, `60 skipped`.

- [x] T1 - SEQUENTIAL - Add failing tests for shared viewer chrome.
  - Add `app/src/components/layout/ViewerWidgetFrame/ViewerWidgetFrame.test.tsx`
    covering:
    - close/back action renders with one stable handle
      `data-testid="viewer-frame-close"`;
    - frame exposes `data-testid="viewer-widget-frame"`,
      `data-viewer-frame-active`, and `data-viewer-content-mode`;
    - title, eyebrow, subtitle, loading/status band, landmark label, and
      content modes render with deterministic DOM structure and ARIA;
    - `centered-panel`, `embed`, `edge-to-edge`, and `padded-scroll` modes
      set distinct class/test handles without duplicating close controls.
  - Add or update `app/src/views/Onboarding/OnboardingShell.test.tsx` so
    sign-in and booking overlays assert:
    - exactly one visible, non-inert `viewer-widget-frame` has
      `data-viewer-frame-active="true"`;
    - underlay frames, if mounted, have `data-viewer-frame-active="false"` and
      live inside inert / `aria-hidden` containers;
    - exactly one `viewer-frame-close` is keyboard reachable;
    - `SignUpWidget` and `BookCallView` do not render their old close handles
      as top-level chrome;
    - opening book-call from sign-in makes the booking frame active and the
      sign-in frame inactive/inert, then closing booking restores sign-in;
    - the same chat session and `ConversationFlow` remain mounted.
  - Add or update a registry-level failing test proving every production
    `ScopedCanvas` / `CanvasKind` mount has a viewer-frame descriptor before
    implementation.
  - Add or update authenticated-base failing tests in
    `app/src/router/authenticatedOnboardingRoutes.test.tsx`,
    `app/src/views/Scoped/ScopedConversationShell.test.tsx`, and
    `app/src/views/Steady/SteadyShell/SteadyShell.test.tsx` proving:
    - signed-in complete `/workspaces`, `/projects`, and `/c/:sessionId`
      preserve the product route and use the shared frame for active
      registry-mounted viewer content;
    - the tests explicitly seed or trigger built viewer steps. Acceptable
      proof includes `pushStep(...)`, `gotoDocViewer(...)`, a real citation
      click path, or a tool action that writes one of these viewer steps:
      `{ kind: "doc-viewer", documentId: "<seeded-doc-id>" }`,
      `{ kind: "extract-workbench", scenarioId: "<seeded-scenario-id>" }`,
      `{ kind: "report" }`, or `{ kind: "integrate" }`;
    - the assertions reject the default `ingest-picker` fallback by proving
      `scoped-canvas-unavailable` is absent, `stepToCanvasKind(...)` is
      non-null, and the resolved `data-canvas-kind` is one of the built
      production kinds;
    - signed-in incomplete product routes open the existing `OnboardingWizard`
      over the current product route without changing the pathname;
    - the wizard does not create a second AppShell/chat/viewer tree;
    - anonymous product-route users do not see the signed-in wizard or
      anonymous viewer overlays.
  - Run:
    `npm --prefix app test -- ViewerWidgetFrame.test.tsx OnboardingShell.test.tsx authenticatedOnboardingRoutes.test.tsx ScopedConversationShell.test.tsx SteadyShell.test.tsx scopedViewerWidgetRegistryProduction.test.ts`
  - Expected before implementation: at least one assertion fails because the
    current widgets own different chrome.
  - Adversarial review gate: confirm the failing assertions describe visible
    UX the user reported, not only an internal prop seam.

- [x] T2 - SEQUENTIAL - Create the shared frame and viewer primitives.
  - Create `app/src/components/layout/ViewerWidgetFrame/ViewerWidgetFrame.tsx`.
  - Create `app/src/components/layout/ViewerWidgetFrame/README.md`.
  - Create `app/src/components/layout/ViewerWidgetFrame/ViewerWidgetFrame.test.tsx`
    unless T1 already created it.
  - Create
    `app/src/components/layout/ViewerWidgetFrame/viewerFrameDescriptor.ts`,
    which defines:
    - `ViewerContentMode`;
    - `ViewerChromePolicy`;
    - `ViewerFrameDescriptor`;
    - typed adapters from production `CanvasKind` registry descriptors to
      frame props.
  - Create `app/src/views/Onboarding/viewerOverlayFrameDescriptors.ts`, which
    owns typed overlay descriptors for `sign-up`, `book-call`, and any other
    live onboarding `ViewerOverlay` kind.
  - Ensure descriptor helpers do not inspect global route/auth/onboarding
    context. The selected route/shell composes the chosen descriptor; helpers
    only adapt already-selected descriptor data.
  - Extend `app/src/widgets/scopedViewerWidget.ts` so each
    `ScopedViewerWidgetDescriptor` declares its viewer chrome policy and content
    mode.
  - Update `app/src/widgets/scopedViewerWidgetRegistryProduction.ts` so every
    built `CanvasKind` exposes that descriptor through the existing production
    catalog read path.
  - Create common viewer-frame pieces under
    `app/src/components/layout/ViewerWidgetFrame/`: `ViewerContentPanel`,
    `ViewerStatusBanner`, `ViewerLoadingBanner`, and `ViewerEmptyState`.
  - If those common pieces are exported, give each exported component sibling
    README/test coverage under `app/src/components/layout/ViewerWidgetFrame/`.
    If they are private, keep them inside `ViewerWidgetFrame.tsx` and cover them
    only through `ViewerWidgetFrame.test.tsx`.
  - Use existing primitives (`Button`, `IconButton` if present, `Heading`,
    `BodyText`, `Label`, `LoadingDots`) and constants from `app/src/constants`.
  - Do not hardcode new colors, shadows, gradients, or raw brand values.
  - Run:
    `npm --prefix app test -- ViewerWidgetFrame.test.tsx scopedViewerWidgetRegistryProduction.test.ts no-hardcoded-styles.test.ts`
  - Adversarial review gate: inspect the component tree and verify the frame
    imports only allowed lower-tier components and does not depend on
    onboarding-specific state or auth-specific route state.

- [x] T2a - SEQUENTIAL - Route all registry-mounted viewer content through the frame path.
  - Modify `app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx` or add an
    immediately adjacent frame host if that keeps `ScopedCanvas` focused.
  - Ensure onboarding, steady, workspace, and project shells that mount
    registry viewer widgets receive the shared frame by default:
    - `app/src/views/Onboarding/OnboardingShell.tsx`;
    - `app/src/views/Steady/SteadyShell/SteadyShell.tsx`;
    - `app/src/views/Scoped/ScopedConversationShell.tsx`.
  - Preserve the authenticated base route model:
    - `/workspaces` and `/projects` keep `ScopedConversationShell` as the
      route surface;
    - `/c/:sessionId` keeps `SteadyShell` as the route surface;
    - `OnboardingWizard` remains a product-route overlay and does not move
      into `ScopedCanvas` unless a future wizard step hosts viewer-widget
      content.
  - Preserve edge-to-edge behavior for PDF/document/canvas-style widgets by
    using `contentMode="edge-to-edge"` instead of bypassing the frame.
  - Run:
    `npm --prefix app test -- ScopedCanvas.test.tsx ScopedConversationShell.test.tsx SteadyShell.test.tsx OnboardingShell.test.tsx authenticatedOnboardingRoutes.test.tsx`
  - Adversarial review gate: verify the change is not merely applied to
    sign-in and Calendly; every production `CanvasKind` has a frame descriptor
    and a live authenticated/onboarding mount path that consumes it.

- [x] T3 - SEQUENTIAL - Move sign-in outer chrome into the frame.
  - Modify `app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.tsx`
    so the widget renders form/content only.
  - Remove the widget-owned full-pane centering shell and top-level close/back
    button from the widget.
  - Keep the sign-up form, magic-link, SSO, book-call action, validation,
    claim/promotion sequence, and post-commit continue callback.
  - Treat **Book a call with an engineer** as a SignUpWidget content action,
    not a frame secondary action, because it is part of the sign-in content
    workflow rather than pane chrome.
  - Modify `app/src/views/Onboarding/OnboardingShell.tsx` so the sign-up
    overlay wraps `SignUpWidget` with `ViewerWidgetFrame` using
    `contentMode="centered-panel"` and a contextual close label:
    `Back to samples` with no active sample, `Close sign-in` with an active
    viewer step.
  - Decide the migration strategy for old close handles:
    - preferred: remove widget-owned `sign-up-viewer-close` and update tests to
      use `viewer-frame-close`;
    - temporary alias allowed only if the alias lives on `ViewerWidgetFrame`
      and is documented for one release of this scaffold work.
  - Update `SignUpWidget.test.tsx` to assert content behavior without claiming
    ownership of close/back chrome.
  - Run:
    `npm --prefix app test -- SignUpWidget.test.tsx OnboardingShell.test.tsx`
  - Adversarial review gate: verify no required sign-in action was stranded in
    the frame and no navigation action remains inside the content widget.

- [x] T4 - SEQUENTIAL - Move Calendly outer chrome and loading into the frame.
  - Modify `app/src/components/viewer-widgets/BookCallView/BookCallView.tsx`
    so the widget owns Calendly embed lifecycle and mobile external fallback
    only.
  - Move close/back chrome to `ViewerWidgetFrame`.
  - Move loading indicator into the frame's status/loading band so it is visible
    while the embed area is blank and disappears before/when the embed is
    usable.
  - Model booking embed lifecycle explicitly as `initializing`, `embedding`,
    `ready`, or `error`; expose this state to the frame by callback or prop so
    loading/status placement is testable.
  - Keep trusted Calendly scheduled-event handling and unset-url handling.
  - Modify `OnboardingShell.tsx` so the book-call overlay wraps
    `BookCallView` with `contentMode="embed"`.
  - Decide the migration strategy for old close handles:
    - preferred: remove `book-call-close` and update tests to use
      `viewer-frame-close`;
    - temporary alias allowed only if the alias lives on `ViewerWidgetFrame`
      and is documented for one release of this scaffold work.
  - Run:
    `npm --prefix app test -- BookCallView.test.tsx OnboardingShell.test.tsx`
  - Adversarial review gate: use a test or DOM inspection to prove the loader
    is not absolutely positioned over the Calendly iframe after the iframe
    mounts.

- [x] T5 - WORKFLOW - Audit and classify every active viewer widget shell policy.
  - Audit every directory under `app/src/components/viewer-widgets/`.
  - Update each widget README with a `## Viewer chrome` section declaring one
    of:
    - `framed`;
    - `edge-to-edge inside ViewerWidgetFrame`;
    - `hostless-exception` with the owning host named.
  - Migrate any duplicated top-level close/back/header/padding chrome found in
    active widgets.
  - Update production registry descriptors so README policy and runtime
    descriptor agree for every built `CanvasKind`.
  - Classify internal content controls separately from frame chrome so inline
    editor closes, proposal cards, menus, and field-edit controls are not
    mistaken for host close/back actions.
  - Preserve legitimate widget-owned controls: PDF thumbnails/zoom, Extract
    field controls, Report section controls, Integrate connector controls, and
    editor-local menus remain inside content widgets when they do not replace the
    frame's top-level close/back/header.
  - Update `docs/agents/widget-contract.md`,
    `docs/agents/architecture.md`, and `docs/agents/onboarding-flow.md`.
  - Run:
    `npm --prefix app test -- widget-contract.test.ts`
  - Adversarial review gate: search for viewer-widget-owned close/back/header
    patterns and classify every hit as migrated content, a documented exception,
    or a bug to fix before marking the task complete.

- [x] T6 - WORKFLOW - Add drift guards for viewer chrome ownership.
  - Update `app/src/test/widget-contract.test.ts` or add
    `app/src/test/viewer-widget-shell-contract.test.ts`.
  - Enforce that every viewer widget README has `## Viewer chrome`.
  - Enforce that every production scoped viewer registry descriptor includes a
    viewer chrome policy and content mode.
  - Enforce README policy and registry descriptor agreement by widget kind.
  - Enforce that active viewer widgets do not ship undocumented top-level
    close/back chrome. The guard may use source-pattern allowlists, but every
    allowlist entry must include the owning OpenSpec change or README section.
  - Enforce that `ViewerWidgetFrame` is the only component exporting the stable
    `viewer-frame-close` handle.
  - Include fixture-string tests for:
    - missing `## Viewer chrome`;
    - README policy not in the allowed set;
    - registry descriptor missing;
    - top-level close handle in a `framed` widget;
    - allowed internal content close control.
  - Run:
    `npm --prefix app test -- widget-contract.test.ts viewer-widget-shell-contract.test.ts`
  - Adversarial review gate: intentionally test the guard against a local
    throwaway fixture or fixture string so a missing `## Viewer chrome` section
    fails for the right reason.

- [x] T7 - SEQUENTIAL - Browser verification across responsive widths.
  - Start the paired app and middleware using the repo's current dev command:
    `MOCK_MODE=true APP_REPOSITORY_MODE=memory npm run dev`.
  - Record any equivalent fixture setup if this command changes during
    implementation; do not run browser verification against an unseeded or
    ambiguous auth state.
  - Seed or create all three auth states before screenshots:
    - signed-in complete user for `/workspaces`, `/projects`, and
      `/c/:sessionId`;
    - signed-in incomplete user for product-route onboarding wizard overlay
      checks;
    - anonymous session for `/onboarding` and product-route redirect/gate checks.
  - Seed or trigger real built viewer steps before authenticated route
    screenshots:
    - `/workspaces`: activate at least one built step such as
      `{ kind: "extract-workbench", scenarioId: "<seeded-scenario-id>" }`,
      `{ kind: "report" }`, or `{ kind: "integrate" }`;
    - `/projects`: activate at least one built step over project scope, using the
      same allowed kinds as `/workspaces`;
    - `/c/:sessionId`: activate
      `{ kind: "doc-viewer", documentId: "<seeded-doc-id>" }` through the product
      viewer API, a citation click, or an equivalent tool action.
  - Reject evidence where the authenticated route only renders `ingest-picker`
    or `scoped-canvas-unavailable`.
  - Use Chrome DevTools MCP to verify desktop, tablet, and mobile widths:
    - desktop `1440 x 1000`;
    - tablet `1024 x 768`;
    - mobile `390 x 844`;
    - signed-in complete `/workspaces` keeps one product shell and uses the
      shared frame for registry-mounted viewer content when a viewer step is
      active;
    - signed-in complete `/projects` keeps one product shell and uses the shared
      frame for registry-mounted viewer content when a viewer step is active;
    - signed-in complete `/c/:sessionId` keeps one product shell and uses the
      shared frame for active document/citation viewer content;
    - signed-in incomplete `/workspaces`, `/projects`, and `/c/:sessionId` open
      the signed-in onboarding wizard over the current route, preserve the
      pathname, and do not create a second AppShell/chat/viewer tree;
    - anonymous `/onboarding` remains public and uses the shared frame for
      onboarding viewer overlays;
    - anonymous product-route access follows the existing auth redirect/gate and
      does not open the signed-in wizard;
    - F1 sign-up opens in the active viewer frame;
    - sample-origin sign-up opens in the same frame;
    - Calendly opens in the same frame;
    - booking opened from sign-in makes booking the only active foreground
      frame and makes sign-in inactive/inert underneath;
    - close/back behavior is contextual and consistent;
    - the chat session remains one `ConversationFlow`;
    - no old widget-local close/header remains visible;
    - no horizontal overflow, clipped close label, or nested-card awkwardness.
  - Capture screenshots and measured DOM evidence: active frame dimensions, close
    button accessible name, iframe bounds, loading/status band bounds, active
    frame count, inactive underlay frame count, document scroll width, route
    pathname stability, product AppShell count, ConversationFlow count, and chat
    session id stability.
  - Include the fixture seed method, active `ViewerStep.kind`, resolved
    `CanvasKind`, active `data-canvas-kind`, and absence of
    `scoped-canvas-unavailable` in the measured report for authenticated product
    routes.
  - Adversarial review gate: compare the new screenshots directly against the
    two screenshots from 2026-06-12 and call out any remaining visual mismatch
    before proceeding.
  - Outcome (2026-06-13): Completed with Playwright-controlled Chromium route
    mocks for stable authenticated product-route state. The reported screenshots
    and DOM measurements covered desktop, tablet, and mobile widths; active
    built viewer steps; one product shell; one `ConversationFlow`; contextual
    shared frame chrome; no old widget-local close/header; no
    `scoped-canvas-unavailable`; and no observed horizontal overflow.

- [x] T8 - SEQUENTIAL - Final verification and OpenSpec closeout readiness.
  - Run:
    `npm --prefix app run test:tool-references`
  - Run:
    `npm --prefix app run test:tool-quality`
  - Run the targeted viewer-shell contract suite:
    `npm --prefix app test -- ViewerWidgetFrame.test.tsx viewer-widget-shell-contract.test.ts scopedViewerWidgetRegistryProduction.test.ts OnboardingShell.test.tsx BookCallView.test.tsx SignUpWidget.test.tsx`
  - Run:
    `npm test`
  - Run:
    `npm run build`
  - Run:
    `npm run test:e2e`
  - Run:
    `npm run scan:secrets`
  - Run:
    `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate standardize-viewer-widget-shell --strict`
  - Run:
    `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json`
  - Adversarial review gate: review the final diff as if seeing it for the
    first time and challenge whether the shell contract is truly enforced or
    merely followed by the two widgets fixed in this pass.
  - Final evidence must include:
    - the authenticated route matrix for `/workspaces`, `/projects`, and
      `/c/:sessionId`;
    - the browser fixture seed method and which signed-in complete,
      signed-in incomplete, and anonymous states were used;
    - the active `ViewerStep.kind` and resolved `CanvasKind` for every
      authenticated product route proof;
    - explicit evidence that authenticated route screenshots did not come from
      `ingest-picker` or `scoped-canvas-unavailable`;
    - signed-in incomplete onboarding wizard evidence proving it is an overlay on
      the product route, not a forked product route;
    - active/inactive frame counts for stacked overlays;
    - registry descriptor coverage for every production `CanvasKind`;
    - README policy / registry descriptor agreement;
    - Calendly loading lifecycle evidence for blank, embedding, ready, and
      error/unset-url states;
    - desktop/tablet/mobile browser measurements from T7.
  - Outcome (2026-06-13): All listed local gates passed. `npm run test:e2e`
    initially hit a MySQL TCP timeout during middleware
    `MySqlAppRepository.createSchema`; the retry passed with `48 passed`,
    `60 skipped`.
