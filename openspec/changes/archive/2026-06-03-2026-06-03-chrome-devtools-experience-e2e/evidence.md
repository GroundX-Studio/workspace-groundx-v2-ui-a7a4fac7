# Chrome DevTools MCP E2E Audit Evidence

## T0 - Scope, tool, and environment preflight

Status: passed with required-surface blockers mapped.

- Workspace: `/Users/benjaminfletcher/git/groundx-v2-ui/scaffold` on branch
  `workspace/groundx-v2-ui`.
- Active OpenSpec: `2026-06-03-chrome-devtools-experience-e2e`, `0/44` at
  preflight start.
- OpenSpec validation: `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1
  validate --all --strict` passed, `18 passed, 0 failed`.
- Chrome DevTools MCP: attached; `tool_search` exposed 32 total tools in this
  session, including 29 Chrome DevTools tools plus 3 Node REPL tools. The
  exposed Chrome DevTools tools include `new_page`, `navigate_page`,
  `take_snapshot`, `evaluate_script`, `list_console_messages`,
  `list_network_requests`, `get_network_request`, `resize_page`, `emulate`,
  `lighthouse_audit`, `performance_start_trace`, and `performance_stop_trace`.
- Port hygiene: no listeners found on `3001`, `5173`, or `4173` before boot.
- Boot path: repo scripts support `npm run dev`; frontend default is
  `localhost:5173`, middleware default is `localhost:3001`, middleware uses
  memory repository in local development when no MySQL host is configured, and
  seeded sample bucket defaults to `28454` where configured by setup/e2e.
- Actual boot for this run: `npm run dev` started frontend
  `http://localhost:5173/` and middleware `3001`; middleware logged
  repository `mysql` because the local environment explicitly sets
  `APP_REPOSITORY_MODE=mysql` and MySQL connection variables. This is an
  environment override, not mock mode.
- GitHub issue overlap:
  - `#4` F7 Integrate view is open backlog and overlaps required F7/Integrate
    audit coverage.
  - `#5` Steady-mode fidelity audit is open backlog and overlaps required
    steady-mode coverage.
  - `#1`, `#2`, `#3`, and `#6` are also open backlog items and must be deduped if
    findings touch citations, scenarios, BYO ingest, or workspace/project nav.
- Pass/fail taxonomy locked: clean-flow unexpected failure, deliberate
  negative/error probe, known live-data/LLM variance, in-scope defect, active
  non-backlog defect, deferred backlog defect, blocked required surface.

Adversarial review: passed. The plan remains executable, but required surfaces
blocked by backlog work may not be counted as complete or archived.

## T1 - Evidence report and interaction inventory

Status: passed.

### Evidence Template

Each verdict row uses:

- `route`
- `viewport`
- `browserContext`
- `surface`
- `interaction`
- `expectedUserVisibleEffect`
- `domOrA11yProof`
- `networkProof`
- `consoleProof`
- `screenshotPath`
- `verdict`
- `classification`
- `notesOrBlocker`

### Live Snapshot Baseline

- Route: `http://localhost:5173/onboarding`
- Context: isolated Chrome DevTools context `chrome-devtools-e2e-audit`
- Viewport: `1353 x 742`
- Horizontal overflow: `0`
- F1 live controls observed by a11y/DOM snapshot:
  - Step strip: `Ingest`, disabled `Understand`, `Extract`, `Interact`,
    `Report`, disabled `Integrate`
  - Nav: logo/back-home, `Workspaces`, `Projects`, `Book a call`, `Docs`
  - F1 picker: `sample-utility`
  - BYO: `byo-pdf`, `byo-url`, `byo-folder`
- Initial app-owned fetch/XHR requests:
  - `GET /api/csrf/token` -> `200`
  - `POST /api/onboarding/session` -> `200`
  - `GET /api/scenarios` -> `200` twice
  - `POST /api/chat-sessions` -> initial `401`, then `200`
  - `POST /api/viewer-events` -> initial `401`, then `201`
- Initial console state:
  - One DevTools console error entry for the initial `401 Unauthorized`
    resource failures, counted as boot noise candidate for later triage.

### Interaction Inventory

Required surfaces and controls to exercise:

- F1 Ingest picker: Utility sample, BYO upload/connect/email cards, capability
  badges, nav entries, step strip locked/reachable states.
- F2 Understand/PdfViewer: PDF viewer mount, page/thumbnail affordances, scan or
  reading beat if present, F2 -> F3 transition, viewer dimensions.
- F3 Extract: field rows, provenance panel, category tabs, rerun, save/export
  gated states, JSON/render toggle where present, schema-builder/add/edit paths
  where present, citation geometry.
- F4/F4a SmartReport: render, empty/error state if no template, section
  accept/reject, builder/edit affordances, pin/save/export gated states,
  citations, request/response bodies.
- F5 Interact/chat: chat input/send, suggested prompts/actions, persisted
  messages, assistant response, citation chips, citation click -> viewer
  page/highlight.
- F6 Gate/auth: Extract unlock banner, BYO signup route, magic-link rail, SSO,
  book-call, keep-exploring, invalid auth branches, password show/hide,
  anonymous-to-authenticated continuation where supported.
- F7 Integrate: connector/API cards, plugin/download/copy controls, unlock
  affordances, gated behavior. Existing backlog `#4` may block complete coverage.
- Steady mode: `/workspaces` or `/projects` route, workspace/project nav,
  steady chat, persisted messages, production widget parity for PdfViewer,
  Extract, SmartReport, and Integrate. Existing backlog `#5` may block complete
  fidelity coverage.
- Cross-cutting: debug reset, responsive desktop/tablet/mobile, compact nav,
  view swap, step strip, reduced motion, a11y snapshot, console/network status,
  optional Lighthouse/performance trace.

DOM checks:

- Key rendered surfaces have width and height greater than zero.
- Document/canvas/chat panes are not collapsed.
- `documentElement.scrollWidth - documentElement.clientWidth <= 1`.
- Actionable controls are not zero-size, clipped, or incoherently overlapping.
- Citation highlights expose measurable page/region state where available.

Network/console checks:

- App-owned fetch/XHR status and response bodies are inspected for the route.
- Unexpected clean-flow `4xx`, `5xx`, failed, or hung requests are candidates.
- Console `error`, `warn`, and `issue` entries are checked after navigation and
  after each interaction.

Adversarial review: passed. The inventory covers the durable `testing-suite`
surfaces and prevents screenshot-only verdicts. Known boot `401` retries are
kept as a candidate finding rather than counted as clean.

## T2 - Clean desktop first-time onboarding flow

Status: passed after in-scope fix and fresh Chrome DevTools replay.

### Pre-Fix Finding

- Fresh anonymous `/onboarding` originally reproduced closed GitHub issue `#8`:
  `POST /api/chat-sessions` returned `401 Authentication required`, followed by
  a successful retry. `POST /api/viewer-events` also returned `401` before a
  later `201`.
- Chrome DevTools also reported one issue: `A form field element should have an
  id or name attribute`; DOM inspection showed the visible chat input had
  `aria-label="Chat input"` but no `id` or `name`.
- Fix applied:
  - `app/src/api/client.ts` now routes onboarding chat-session creation through
    `ensureAnonSession()` before the shared chat-session ensure client sends
    `POST /api/chat-sessions`.
  - `app/src/conversation/chatPrimitives.tsx` now gives the live chat input
    `id="chat-live-input-field"` and `name="chatInput"`.
  - Regression: `npm --workspace app exec vitest run src/api/client.test.ts`
    passed, `5/5`.

### Fresh Patched Replay

- Route: `http://localhost:5173/onboarding`
- Context: isolated Chrome DevTools context
  `chrome-devtools-e2e-audit-t2-patched`
- Viewport: `1353 x 742`, DPR `1`, horizontal overflow `0`.
- F1 a11y snapshot:
  - Step strip: `Ingest`, disabled `Understand`, `Extract`, `Interact`,
    `Report`, disabled `Integrate`.
  - Utility sample card present as `Open sample: Utility Bill`.
  - BYO cards present: upload files, connect a source, email it in.
- Fresh F1 network:
  - `POST /api/onboarding/session` -> `200`
  - `GET /api/scenarios` -> `200` twice; response body included bucket
    `28454`, scenario `utility`, document
    `c3bfff49-6640-4213-822b-e81c3a771e45`, and
    `utility-bill-april-2026.pdf`.
  - `POST /api/chat-sessions` -> `200`
  - `POST /api/viewer-events` -> `201` twice
  - No `4xx`/`5xx`/failed fetch/XHR entries.
- Fresh F1 console: no `error`, `warn`, or `issue` messages.

### F2/F3 Utility Evidence

- Interaction: clicked `Open sample: Utility Bill`.
- F2 user-visible proof:
  - Route changed to `/onboarding/28454/utility`.
  - Chat pane showed `Reading utility-bill-april-2026.pdf now.` and the
    thinking script (`parsing layout`, `found header`, `extracting meter table`,
    `extracting charge ledger`, `confidence check`).
  - PDF viewer image rendered with alt
    `utility-bill-april-2026.pdf · page 1`.
- F3 user-visible proof:
  - Step strip showed `Ingest` and `Understand` done, `Extract` active.
  - Extract workbench rendered `Designing utility · statement`, disabled
    export/rerun/save controls, page buttons `Page 1..3`, category tabs
    `Statement· 14`, `Meters· 16`, `Charges· 6`, field rows, citations, and the
    sign-in unlock banner.
- F3 DOM proof:
  - Chat pane: `360 x 660.8`, visible.
  - Canvas: `807 x 660.8`, visible.
  - Extract workbench: `791 x 644.8`, visible.
  - Document pane: `405.3 x 492.6`, visible.
  - PDF image: `405.3 x 524.5`, visible, `data-testid=pdf-viewer-page-image`.
  - Fields panel: `337.7 x 492.6`, visible.
  - Field rows counted: `36`; citation chips counted: `22`.
  - Chat input counted: one visible input with `id=chat-live-input-field`,
    `name=chatInput`, `aria-label=Chat input`.
  - Hidden/zero-size actionable controls counted: `0`.
  - `documentElement.scrollWidth - clientWidth = 0`.
- F3 network proof:
  - `POST /api/intent` -> `201`
  - `GET /api/v1/ingest/document/c3bfff49-6640-4213-822b-e81c3a771e45` -> `200`
  - `GET /api/v1/ingest/document/xray/c3bfff49-6640-4213-822b-e81c3a771e45`
    -> `200`
  - `PUT /api/chat-sessions/<id>/entities/sample%3Autility` -> `200`
  - `PATCH /api/chat-sessions/<id>` -> `200`
  - `GET /api/chat-sessions/<id>/messages` -> `200`
  - `GET /api/v1/workflow/9910308e-3100-473e-9da6-3ac29f5958a6` -> `200`
  - `GET /api/v1/ingest/document/extract/c3bfff49-6640-4213-822b-e81c3a771e45`
    -> `200`; body included `balance_payable: 7613.2`,
    `utility_company: "City of Windom"`, `addressee: "KWIK TRIP (1147)"`, and
    meter/charge arrays matching the visible field rows.
  - `POST /api/documents/c3bfff49-6640-4213-822b-e81c3a771e45/field-geometry`
    -> `200`.
  - No unexpected `4xx`/`5xx`/failed fetch/XHR entries.
- F2/F3 console proof: no `error`, `warn`, or `issue` messages.

Adversarial review: passed. The sample path was driven through the visible UI,
not endpoints alone; the viewer could not be blank/collapsed and still pass the
recorded dimensions; response bodies match the visible scenario/document; and
the clean-flow startup failures were fixed and reverified.

## T3 - Production widget control audit

Status: passed with caveats. PdfViewer, Extract, and visible SmartReport
controls passed after in-scope fixes. Integrate was attempted and blocked by
existing backlog. SmartReport rendered-section accept/reject controls were not
available from the live Utility path because report render returned
`reason: "no_template"`; T8 must dedupe or track that gap.

### PdfViewer Controls

- Route: `http://localhost:5173/onboarding/28454/utility`
- Contexts: `chrome-devtools-e2e-audit-t3-patched`,
  `chrome-devtools-e2e-audit-t3-schema-clean`,
  `chrome-devtools-e2e-audit-t3-form-clean`
- Interaction: selected the `Balance payable` field, clicked its page citation,
  then clicked the visible `Page 3` affordance.
- Pre-fix finding: the page-1 citation highlight stayed visible after browsing
  to page 3. This was an in-scope defect because the highlight geometry belonged
  to the targeted citation page, not the currently browsed page.
- Fix applied:
  - `app/src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tsx` now
    computes `highlightPage` and only renders non-ambient highlight overlays
    when `activePage === highlightPage`.
  - Regression: `npm --workspace app exec vitest run
    src/components/viewer-widgets/PdfViewer/PdfViewerWidget.test.tsx` passed,
    `26/26`, including a new test that hides a target-page highlight when the
    user browses to another page.
- Fresh live replay:
  - Page image alt after page navigation:
    `utility-bill-april-2026.pdf · page 3`.
  - PDF image dimensions: `405.25 x 524.45`, visible.
  - `pdf-viewer-highlight` present on the target page and absent on page 3.
  - Root attrs after page 3 navigation: `data-highlight-page="1"`,
    `data-target-page="1"`.
  - Horizontal overflow: `0`.
- Console proof: no `error`, `warn`, or `issue` messages in the fresh replay.

### Extract Controls

- Field rows and citations:
  - Field row count: `36`.
  - Citation chip count: `22`.
  - Field provenance panel opened/collapsed successfully from the visible field
    UI.
- Category tabs:
  - `Meters` scrolled the fields panel to meter fields including
    `grid_connection_id`, `market_role`, and `meter_addressee`; panel
    `scrollTop=1479`.
  - `Charges` scrolled the fields panel to charge fields including
    `line_amount`, `line_currency`, `line_kind`, and `line_label`; panel
    `scrollTop=3063`.
- Menu/gated controls:
  - Field panel menu opened.
  - `Save schema...` was visible and disabled for anonymous users.
  - `Edit schema...` was visible and focusable.
- Schema builder:
  - `Edit schema...` mounted the schema-builder surface.
  - Builder showed back-to-extract, pinned sample, `+ pin another sample` with a
    sign-in description, category chooser, accepted-field rows, edit/remove
    controls, and add-field copy.
- Field editor:
  - `Edit Balance payable` mounted name/type/format/required/prompt/
    identifiers/instructions/preview/rerun/cancel/save controls.
  - Field-level `Rerun` sent `POST /api/extract-field` -> `200` and the app
    remained mounted.
- Pre-fix finding: after opening the schema field editor, Chrome DevTools
  reported form-field identity issues from visible and autosized schema-editor
  controls.
- Fix applied:
  - `app/src/components/viewer-widgets/Extract/SchemaView.tsx` now gives schema
    field editor inputs stable `id`/`name` attributes.
  - MUI multiline prompt/instructions controls were replaced with native styled
    textareas inside the existing test-id wrappers, eliminating hidden autosize
    textarea form issues while preserving the rendered editor contract.
  - Regression: `npm --workspace app exec vitest run
    src/views/Onboarding/SchemaView.test.tsx` passed, `29/29`.
- Fresh live replay:
  - Visible controls had form identities: chat input, field name, type native
    select, format, required checkbox, prompt textarea, and instructions
    textarea all had stable `id` and `name` values.
  - Console proof: no `error`, `warn`, or `issue` messages.

### SmartReport Attempt

- Interaction: clicked the visible `Report` step from the Utility scenario.
- User-visible state:
  - Canvas first showed `Rendering report...`.
  - The final SmartReport state was the clear empty state: `No report for this
    scope yet. Pin an answer or open the builder to start one.`
- Network proof:
  - `POST /api/widgets/smart-report/reports/render` -> `200` for repeated render
    requests.
- Scenario blocker:
  - The live Utility scenario returned `chapters.report: "off"`, so no report
    sections, accept/reject controls, report citations, or save/export controls
    were available from this route at this point.
- Verdict: empty state covered, full SmartReport controls pending. This evidence
  does not count as complete SmartReport control coverage.

### SmartReport Builder and Form-Identity Fix

- Interaction path: Interact -> chat answer -> `Pin this answer to a report` ->
  Report -> `Open builder`.
- User-visible proof:
  - Chat answer showed `$7,613.20`, page 1/page 2 citations, `Show source`, and
    `Pin this answer to a report`.
  - Pin action showed `Pinned to a new report draft.`
  - Report showed `You have a report draft in progress — 1 pinned answer. Open
    the builder to shape it into a report.`
  - Builder mounted `Sections` and `Render` tabs, section rows (`Billing
    Summary`, `Charge Breakdown`, `Anomalies`, `Recommendation`, `Pinned
    Answer`), section edit/menu buttons, `+ add section`, locked anonymous
    export, `Re-render report`, and `Save report template`.
- Pre-fix finding: opening `Edit` for `Billing Summary` produced Chrome DevTools
  issues: one unlabeled form field and three form fields without `id` or `name`.
- Fix applied:
  - `app/src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.tsx`
    now gives section editor controls stable `id`/`name` values, visible labels
    where needed, and native styled textareas for `Question` and `Instructions`
    so hidden autosize helpers do not create browser form issues.
  - Regression: `npm --workspace app exec vitest run
    src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx`
    passed, `13/13`, after first failing on the missing submit-name assertion.
- Fresh live replay:
  - Context: `chrome-devtools-e2e-audit-t4-report-builder-clean`.
  - Visible form controls after opening `Billing Summary` editor:
    section name, render-as select input, question textarea, instructions
    textarea, and variable-name input all had non-empty stable `id` and `name`
    values.
  - `missingIdentity` count: `0`.
  - Horizontal overflow: `0`.
  - Console proof: no `error`, `warn`, or `issue` messages.
- Render controls:
  - `Render` tab showed the render-preview hint.
  - `Re-render report` sent `POST /api/widgets/smart-report/reports/render`
    -> `200`.
  - Response body used `template_id: "rt-utility-ic-brief"`,
    `scope.bucketId: 28454`, current `chat_session_id`, `status: "complete"`,
    `sections: []`, `preview_only: true`, and `reason: "no_template"`.
  - User-visible result returned to the draft prompt with `Open builder`.
- Verdict: visible builder/render controls covered. Rendered report sections and
  section accept/reject controls are not available in the live Utility path and
  must be tracked separately before closeout.

### Integrate Attempt

- Interaction: inspected the visible top-step `Integrate` entry after reaching
  the Utility workbench/report flow.
- User-visible state: `Integrate` was disabled/locked for the anonymous Utility
  scenario.
- Blocker: existing GitHub backlog issue `#4` covers F7 Integrate view real
  surface plus live re-verification.
- Verdict: blocked required surface. The attempt is recorded, but Integrate is
  not counted as covered and must block archive/sign-off if no later coverage
  becomes available.

Adversarial review: passed with caveats. PdfViewer, Extract, and SmartReport
visible controls cannot pass without the recorded live replays and focused
regressions, which now exist. Blocked Integrate coverage is not counted as
covered. SmartReport rendered-section accept/reject coverage remains a tracked
gap rather than hidden completion.

## T4 - Report, Interact/chat, and citation round trip

Status: passed with report-render gap classified for T8.

- Route: `http://localhost:5173/onboarding/28454/utility`
- Contexts:
  - `chrome-devtools-e2e-audit-t3-form-clean` for initial chat/citation/report
    proof.
  - `chrome-devtools-e2e-audit-t4-report-builder-clean` for the fresh
    report-builder fix replay.
- Report empty state:
  - Clicking `Report` from the live Utility scenario first showed `Rendering
    report...`, then `No report for this scope yet. Pin an answer or open the
    builder to start one.`
  - `POST /api/widgets/smart-report/reports/render` returned `200`.
- Interact/chat:
  - Clicking `Interact` mounted the live chat-plus-viewer state with visible
    chat input and PDF page controls.
  - Prompt sent through visible chat input: `What is the total balance due and
    which page shows it?`
  - `POST /api/chat/messages` returned `200`; request carried
    `activeStepKind: "interact-chat"` and scope hints for
    `utility-bill-april-2026.pdf`.
  - Response body returned a RAG answer, assistant/user message IDs, two
    citations for document `c3bfff49-6640-4213-822b-e81c3a771e45`, and a
    `Show source` suggested action.
  - Visible answer showed `$7,613.20`, page 1/page 2 references, `Citation 1`,
    `Citation 2`, `Show source`, and `Pin this answer to a report`.
  - Chat pane measured `360 x 660.8125`; canvas measured `807 x 660.8125`;
    horizontal overflow `0`; zero-size actionable controls `0`.
  - Console proof: no `error`, `warn`, or `issue` messages.
- Citation round trip:
  - Clicking `Citation 2 — page 2` navigated the viewer to page 2. The citation
    was ambient, so no highlight overlay was expected or present.
  - Clicking `Citation 1 — page 1` navigated the viewer to page 1 and rendered
    an exact highlight overlay.
  - Page-1 highlight proof:
    - image alt: `utility-bill-april-2026.pdf · page 1`
    - `data-target-page="1"`
    - `data-highlight-page="1"`
    - highlight bbox:
      `{"x":0.23470588235294118,"y":0.6936363636363636,"w":0.2570588235294118,"h":0.009545454545454546}`
    - image rect: `790.984375 x 1023.640625`
    - highlight rect: `203.328125 x 5.375`
    - horizontal overflow `0`
  - Citation clicks produced app-owned `POST /api/intent` and chat-session
    `PATCH` requests with `201`/`200` statuses.
- Pin-to-report:
  - Clicking `Pin this answer to a report` showed `Pinned to a new report
    draft.`
  - Report route then showed the draft prompt and `Open builder`.
  - Builder mounted successfully and was exercised as recorded in T3.
- LLM variance:
  - The repeated prompt returned the same factual structure (`$7,613.20`, page
    1, page 2) with minor wording variance (`also repeated on` vs. `also on`).
    This was classified as acceptable LLM wording variance, not a defect.
- Deterministic report-render gap:
  - Re-render/report endpoint returned `reason: "no_template"` with empty
    sections despite visible local builder rows. This prevented rendered report
    section/citation controls and report-section accept/reject controls from
    being exercised in the live Utility path.

Adversarial review: passed. The path was driven through visible controls rather
than endpoint calls; successful network responses were reflected in visible UI;
the citation click proved viewer navigation and exact highlight geometry; and
LLM wording variance was separated from the deterministic report-template gap.

## T5 - Gates, auth/error branches, and debug reset

Status: passed with blocked F7 caveat.

### Extract Gate and BYO Signup

- Route/context: `http://localhost:5173/onboarding/28454/utility`, context
  `chrome-devtools-e2e-audit-t4-report-builder-clean`, plus BYO signup route
  `http://localhost:5173/onboarding/signup` in context
  `chrome-devtools-e2e-audit-t5-gate-clean`.
- Extract unlock:
  - Clicking the visible Extract unlock banner opened the gate value-prop
    canvas and magic-link/SSO/book-call/keep-exploring chat rail.
  - `Keep exploring` restored the Extract canvas.
  - No authed-only writes were observed from opening/dismissing the gate.
- Pre-fix gate finding:
  - Magic-link commit from Extract did not expose `Continue to Integrate`
    because the rail only allowed the button from `f6`, while Extract opens the
    gate from `f3`.
  - Chrome DevTools also surfaced visible form-label issues caused by decorative
    `Label` primitives rendering orphan `<label>` elements.
- Fixes applied:
  - `app/src/components/chat-widgets/GateChatRail/GateChatRail.tsx` now allows
    `Continue to Integrate` from pre-Integrate frames `f1` through `f6`, and
    the magic-link email field has stable `id`, `name`, and label text.
  - `app/src/components/primitives/Label/Label.tsx` now renders a real
    `<label>` only when `htmlFor` is present; decorative form/eyebrow labels
    render as text spans.
  - Regressions:
    - `npm --workspace app exec vitest run
      src/components/chat-widgets/GateChatRail/GateChatRail.test.tsx` passed,
      `22/22`, after first failing on the missing email identity and Extract
      continuation assertions.
    - `npm --workspace app exec vitest run
      src/components/primitives/Label/Label.test.tsx
      src/components/chat-widgets/GateChatRail/GateChatRail.test.tsx` passed,
      `28/28`, after first failing on the orphan-label primitive assertion.
- Fresh BYO signup replay:
  - Magic-link email input had `id="gate-rail-email-input"`,
    `name="gateRailEmail"`, and a matching label.
  - Orphan label count: `0`.
  - Magic-link commit rendered the committed card and `Continue to Integrate`.
  - Console proof: no `error`, `warn`, or `issue` messages.
- Continuation blocker:
  - `/onboarding/signup` alone has no active sample/project session, so
    continuing there cannot mount a real F7 surface.
  - From the active Utility context, magic-link continuation enabled the top
    `Integrate` step, but clicking Integrate still returned the value-prop
    canvas rather than a real F7 surface.
  - Existing backlog issue `#4` remains the blocker. The continuation affordance
    is covered; the real F7 surface is not counted as covered.

### Login Negative Branch

- Route/context: `http://localhost:5173/auth/login`, context
  `chrome-devtools-e2e-audit-t5-gate-clean`.
- Pre-fix finding: Chrome DevTools reported one auth-form autocomplete issue
  because the email/password fields did not advertise browser autofill hints.
- Fix applied:
  - `app/src/views/Auth/Form/LoginForm.tsx` now sets
    `autoComplete="email"` and `autoComplete="current-password"`.
  - Regression: `npm --workspace app exec vitest run
    src/views/Auth/Form/LoginForm.test.tsx` passed, `4/4`, after first failing
    on missing autocomplete attributes.
- Negative probe:
  - Filled invalid login credentials and toggled password visibility.
  - `POST /api/auth/login` returned expected negative-probe `404`.
  - The app stayed mounted on `/auth/login`; fields recovered/reset; no
    unexplained clean-flow network failures were mixed into the verdict.
  - Console proof after the negative branch contained only the expected resource
    failure for the deliberate `404`.
  - No visible error message was observed after the invalid login; T8 must
    decide whether this is already tracked or needs a defect issue.

### Debug Reset

- Route/context: `http://localhost:5173/auth/login?debug=true`, context
  `chrome-devtools-e2e-audit-t5-gate-clean`.
- Before reset:
  - Local storage contained onboarding chat/gate keys including
    `groundx-onboarding.chat-store.v1`,
    `groundx-onboarding.gate-composed...`, and
    `groundx-onboarding.gate-sequence-played`.
  - Session storage was empty.
  - CSRF cookie was present.
- Interaction: clicked the visible debug `Reset experience` control.
- After reset:
  - Route returned to `/onboarding`.
  - First-time F1 picker remounted with the Utility sample and BYO cards.
  - Gate localStorage keys were cleared; only the chat-store key was recreated
    by the fresh anonymous boot.
  - Session storage remained empty.
  - CSRF cookie was recreated by the fresh boot.
  - App-owned requests after reset were clean: onboarding/session/scenarios/
    chat-session/viewer-events returned `200`/`201`.
  - Console proof: no `error`, `warn`, or `issue` messages.

### Register Negative Branch

- Route/context: `http://localhost:5173/auth/register`, context
  `chrome-devtools-e2e-audit-t5-gate-clean`.
- Pre-fix finding: Chrome DevTools reported an auth-form autocomplete issue on
  the register form.
- Fix applied:
  - `app/src/views/Auth/Form/RegisterForm.tsx` now sets browser autocomplete
    hints for first name, last name, email, password, confirm password, and
    organization fields.
  - Regression: `npm --workspace app exec vitest run
    src/views/Auth/Form/RegisterForm.test.tsx` passed, `4/4`, after first
    failing on the missing first-name autocomplete attribute.
- Fresh browser replay:
  - Register inputs had stable identities and hints:
    `first/given-name`, `last/family-name`, `email/email`,
    `password/new-password`, `confirmPassword/new-password`, and
    `companyName/organization`.
  - Form rect measured `396 x 579.1875`; horizontal overflow `0`.
  - Console proof after reload: no `error`, `warn`, or `issue` messages.
- Negative probe:
  - Filled valid user fields with mismatched password confirmation.
  - Visible error rendered: `Passwords do not match`.
  - `confirmPassword` had `aria-invalid="true"`.
  - No register API request was sent; only boot/session fetches were present.
  - The app stayed mounted on `/auth/register`; horizontal overflow remained
    `0`.
  - Console proof after submit: no `error`, `warn`, or `issue` messages.

Adversarial review: passed with caveat. The deliberate negative probes did not
leave the app broken; reset cleared gate-scoped state and remounted first-time
onboarding; expected negative `404`/client-validation outcomes are explicitly
separated from clean-flow failures. The remaining continuation gap is the real
F7 Integrate surface, already blocked by backlog `#4` and not counted as
covered.

## T6 - Steady-mode navigation and widget parity

Status: passed with blocked parity caveats.

### `/home` Auth Gate

- Route/context: `http://localhost:5173/home`, context
  `chrome-devtools-e2e-audit-t6-steady`.
- User-visible result: anonymous `/home` redirected to `/auth/login` and showed
  the login form.
- Network proof:
  - `GET /api/auth/me` -> expected anonymous `401`.
  - `POST /api/onboarding/session` -> `200`.
  - `GET /api/scenarios` -> `200`.
  - `POST /api/chat-sessions` -> `200`.
- DOM proof: route ended at `/auth/login`; horizontal overflow `0`.
- Console proof: no `error`, `warn`, or `issue` messages.
- Verdict: authenticated home/deep-link path is auth-gated in this local run,
  so `/home` is not counted as steady widget coverage.

### `/workspaces`

- Route/context: `http://localhost:5173/workspaces`,
  `chrome-devtools-e2e-audit-t6-steady`.
- User-visible result:
  - Scoped shell mounted with nav, chat pane, `Workspace` heading, scope copy
    `Workspace · bucket 28454 · 1 sample ready`, view chips `Summarize`,
    `Extract fields`, and `Build a report`.
  - Canvas initially rendered the generic placeholder: `This view isn't
    available yet`.
- DOM proof:
  - `data-testid="scoped-shell"` present with `data-experience="workspace"`.
  - Chat pane measured `402 x 724`.
  - Canvas pane measured `731 x 726`.
  - Chat input retained `id="chat-live-input-field"` and `name="chatInput"`.
  - Hidden/zero-size actionable controls: `0`; horizontal overflow `0`.
- Network proof:
  - Scoped shell created and hydrated chat sessions with `POST
    /api/chat-sessions` -> `200` and `GET /api/chat-sessions/<id>/messages`
    -> `200`.
- Interaction:
  - Clicking `Extract fields` sent `POST /api/chat/messages` -> `200`.
  - The response returned citations and suggested actions; the visible chat
    showed citation chips and source/report actions.
  - The response body had an empty `answer` string for this chip-driven prompt,
    so the chat showed citations/actions without prose. This is a candidate
    steady-chat defect to dedupe in T8.
  - Clicking `Citation 2 — page 1` mounted the production PdfViewer in the
    scoped canvas.
- Viewer proof after citation:
  - Image alt: `utility-bill-april-2026.pdf · page 1`.
  - Canvas pane measured `731 x 726`.
  - PDF image measured `731 x 946`.
  - Horizontal overflow `0`; hidden/zero-size actionable controls `0`.
  - App-owned requests: `POST /api/intent` -> `201`,
    `GET /api/v1/ingest/document/xray/<doc>` -> `200`,
    `PATCH /api/chat-sessions/<id>` -> `200`.
- Console proof: no `error`, `warn`, or `issue` messages.
- Verdict: workspace scoped chat and PdfViewer citation round-trip work.
  Non-document widget parity does not: the Extract/Report chips did not mount
  production Extract or SmartReport canvases in this route.

### `/projects`

- Route/context: `http://localhost:5173/projects`,
  `chrome-devtools-e2e-audit-t6-steady`.
- User-visible result:
  - Scoped shell mounted with `Project` heading and scope copy
    `Project · bucket 28454 · filter {"project":"utility"} · 1 sample ready`.
  - Canvas initially rendered the same generic unavailable placeholder.
- DOM proof:
  - `data-testid="scoped-shell"` present with `data-experience="project"`.
  - Chat pane measured `402 x 724`.
  - Canvas pane measured `731 x 726`.
  - Hidden/zero-size actionable controls `0`; horizontal overflow `0`.
- Network proof:
  - Created/hydrated a project-scoped chat session with app-owned `200`
    requests.
- Console proof: no `error`, `warn`, or `issue` messages.
- Verdict: project nav/route is mounted and scoped, but production widget
  parity is not complete until the route can mount real non-document canvas
  widgets.

### `/c/:sessionId`

- Route/context:
  `http://localhost:5173/c/c-ddcc7f0f-cff6-4edc-845d-c429447de00b`,
  `chrome-devtools-e2e-audit-t6-steady`.
- User-visible result:
  - True steady session shell mounted with the session id, session switcher,
    previous workspace chat turn, persisted citation chips, and chat input.
  - Initial canvas showed `Pick a document to view`, not an onboarding canvas.
- Hydration proof:
  - `data-testid="steady-shell"` present.
  - `steady-shell-session-id` matched the URL session id.
  - `steady-shell-unknown-session` absent.
  - `GET /api/chat-sessions/<id>/messages` -> `200`.
- Citation round trip:
  - Clicking persisted `Citation 2 — page 1` mounted the production PdfViewer.
  - Chat column measured `342 x 724`.
  - Canvas measured `807 x 742`.
  - PDF image alt: `utility-bill-april-2026.pdf · page 1`.
  - PDF image measured `790.984375 x 1023.640625`.
  - Horizontal overflow `0`; hidden/zero-size actionable controls `0`.
  - App-owned requests: `POST /api/intent` -> `201`,
    `GET /api/v1/ingest/document/xray/<doc>` -> `200`,
    `PATCH /api/chat-sessions/<id>` -> `200`.
- Typed chat proof:
  - Filled the steady chat input with `What is the total amount due?` and
    clicked `Send`.
  - Chat rendered the user message, disabled input while thinking, then
    re-enabled the input.
  - Assistant answer rendered `$7,613.20` and a page-1 citation.
  - `POST /api/chat/messages` -> `200`.
  - Existing PdfViewer remained mounted.
- Console proof: no `error`, `warn`, or `issue` messages.
- Verdict: true steady session chat, persistence hydration, typed input, and
  PdfViewer citation round-trip are covered.

### Blocked Parity

- Extract and SmartReport production-widget parity in steady/scoped routes is
  not covered: the visible scoped view chips dispatch chat but do not mount the
  Extract or SmartReport canvases; the canvas remains `This view isn't
  available yet` until a citation-driven document viewer step exists.
- Integrate parity is not covered: F7 remains blocked by backlog `#4`.
- Existing backlog issue `#5` covers steady-mode fidelity/wireframe parity and
  overlaps the missing non-document steady widget surfaces.

Adversarial review: passed with caveats. T6 did not use onboarding as a proxy:
`/home`, `/workspaces`, `/projects`, and `/c/:sessionId` were each attempted in
Chrome. Steady `/c/:sessionId` chat/PdfViewer behavior passed with measured DOM,
network, and console proof. Missing Extract/SmartReport/Integrate parity is
recorded as blocked/deferred, not counted as complete or eligible for archive
sign-off.

## T7 - Responsive, reduced-motion, accessibility, and performance checks

Status: passed after in-scope fixes.

### Desktop and Tablet F1 Measurements

- Route/context: `http://localhost:5173/onboarding`,
  `chrome-devtools-e2e-audit-t7-responsive`.
- Desktop viewport:
  - Effective viewport: `1353 x 742`, DPR `1`.
  - Nav measured `177.3 x 730.87`.
  - Chat measured `354.6 x 650.9`.
  - Canvas/main measured `794.9 x 650.9`.
  - Utility sample card measured `370.66 x 140`.
  - BYO upload card measured `370.66 x 134`.
  - Hidden/zero-size actionable controls `0`; horizontal overflow `0`.
  - A11y snapshot exposed F1 heading, Utility sample, BYO cards, and disabled
    locked steps.
  - Console proof: no `error`, `warn`, or `issue` messages.
- Tablet viewport:
  - Requested/effective viewport: `900 x 700`, DPR `1`.
  - Nav measured `177.3 x 689.5`.
  - Chat measured `354.6 x 609.53`.
  - Canvas/main measured `348.69 x 609.53`.
  - Utility sample card measured `265.66 x 141.33`.
  - BYO upload card measured `265.66 x 134`.
  - Hidden/zero-size actionable controls `0`; horizontal overflow `0`.
  - Console proof: no `error`, `warn`, or `issue` messages.

### Mobile Compact Mode

- Initial `resize_page(390, 844)` was constrained by browser/window minimums to
  an effective `500 px` layout width. The pass then used Chrome DevTools
  `emulate` with `390x844x1,mobile,touch`; effective viewport was `390 x 844`.
- F1 compact measurements:
  - Chat pane measured `384.15 x 745.46`.
  - Canvas/main measured `390 x 1026.7`.
  - Visible compact controls: icon-only `Open navigation` and `View canvas`.
  - Hidden/zero-size actionable controls `0`; horizontal overflow `0`.
- F1 note:
  - In F1, the visible AppShell underlay is intentionally wrapped with
    `aria-hidden`/`inert`; compact topbar controls in that underlay are not the
    active F1 a11y surface. The real compact AppShell controls were tested
    after selecting the Utility sample.
- F2/F3 compact controls:
  - After selecting Utility in mobile emulation, a11y snapshot exposed
    `Open navigation` and `View canvas`.
  - Clicking `Open navigation` opened a modal dialog labelled
    `Primary navigation` with `Back to onboarding home`, disabled
    `Workspaces`/`Projects`, `Book a call`, and `Docs`.
  - Pre-fix finding: pressing Escape did not close the nav drawer.
  - Fix applied:
    - `app/src/components/layout/AppShell/AppShell.tsx` now closes the compact
      nav drawer on Escape while it is open.
    - Regression: `npm --workspace app exec vitest run
      src/components/layout/AppShell/AppShell.test.tsx` passed, `28/28`, after
      first failing on the Escape close assertion.
  - Fresh Chrome replay: pressing Escape closed the drawer and returned the
    a11y tree to the topbar + step strip.
  - Clicking `View canvas` changed the compact toggle to `View chat` and
    mounted the mobile Extract/PDF canvas.
- Mobile F3 canvas proof:
  - Effective viewport: `390 x 844`, DPR `1`.
  - Canvas measured `390 x 756.8125`.
  - Extract workbench measured `390 x 756.8125`.
  - PDF image alt: `utility-bill-april-2026.pdf · page 1`.
  - PDF image measured `365.984375 x 473.640625`.
  - Field rows counted `36`.
  - Hidden/zero-size actionable controls `0`; horizontal overflow `0`.
  - App-owned requests after mobile F3 included onboarding/session/scenarios,
    chat-session entity/message hydration, workflow, document/extract/xray, and
    field-geometry requests with `200`/`201` statuses.
  - Console proof: no `error`, `warn`, or `issue` messages.

### Reduced Motion

- Method: navigated with an init script that made
  `window.matchMedia("(prefers-reduced-motion: reduce)")` return `true` before
  app boot.
- Browser proof:
  - `matchMedia("(prefers-reduced-motion: reduce)").matches` returned `true`.
  - AppShell root reported `data-app-shell-reduced-motion="true"`.
  - Horizontal overflow `0`.

### Lighthouse and Contrast Fix

- Pre-fix Lighthouse snapshot:
  - Mode/device: snapshot/mobile.
  - Accessibility `96`, Best Practices `100`, SEO `60`, Agentic Browsing `50`.
  - Failed product-facing audit: `color-contrast`.
  - Failed metadata audits: missing meta description, invalid robots.txt, and
    llms.txt recommendations.
- Color contrast details:
  - Flagged nodes included compact step metadata (`· Ingest`, `0/4 done`) and
    F1 small copy (`shortDesc`, `demonstrates`, `hollow = not in this sample`,
    `BRING YOUR OWN...`).
  - Pre-fix computed colors included `rgba(41, 51, 92, 0.55)`,
    `rgba(41, 51, 92, 0.65)`, and `rgb(243, 102, 63)` on white.
- Fix applied:
  - `app/src/components/layout/StepStrip/StepStrip.tsx` darkened compact
    progress metadata to `alpha(NAVY, 0.75)`.
  - `app/src/views/Onboarding/IngestView/SampleScenarioCard.tsx` and
    `app/src/views/Onboarding/IngestView/IngestView.tsx` use `BODY_TEXT` for
    the small F1 text Lighthouse flagged.
  - Regressions: `npm --workspace app exec vitest run
    src/components/layout/StepStrip/StepStrip.test.tsx
    src/views/Onboarding/IngestView/IngestView.test.tsx` passed, `27/27`,
    after first failing on contrast ratios `3.21` and `4.23`.
- Fresh browser contrast proof:
  - `· Ingest` and `0/4 done`: contrast `5.636`.
  - F1 secondary/BYO copy: contrast `8.811`.
  - Console proof after refresh: no `error`, `warn`, or `issue` messages.
- Post-fix Lighthouse snapshot:
  - Accessibility `100`, Best Practices `100`, SEO `60`, Agentic Browsing
    `50`.
  - Remaining failures: missing meta description, invalid robots.txt, and
    llms.txt recommendations. These are metadata/content issues, not direct
    flow blockers for this E2E experience audit; T8 must dedupe/track if not
    already represented.
  - Report paths: `/tmp/groundx-v2-ui-t7-lighthouse-postfix/report.json` and
    `/tmp/groundx-v2-ui-t7-lighthouse-postfix/report.html`.

### Performance Trace

- Trace path: `/tmp/groundx-v2-ui-t7-trace.json.json.gz`.
- Route: `http://localhost:5173/onboarding`.
- Environment: local dev server, CPU throttling `1x`, network throttling
  `none`; no CrUX field data for this page.
- Metrics:
  - LCP `356 ms`.
  - TTFB `2 ms`.
  - Render delay `355 ms`.
  - CLS `0.00`.
- Available insights: `LCPBreakdown`, `NetworkDependencyTree`, and
  `ThirdParties`.
- Verdict: local lab trace is healthy enough for this audit, but it is not a
  production performance claim.

Adversarial review: passed. Responsive verdicts use measured DOM and a11y
evidence rather than screenshots. Mobile evidence names the actual emulated
viewport and distinguishes the intentionally hidden F1 underlay from the active
compact shell. Lighthouse and performance results are reported with local
environment caveats, and the two product-facing T7 regressions were fixed and
replayed in Chrome.

## T8 - Findings triage, fixes, and regression coverage

Status: passed.

### Dedupe Snapshot

- OpenSpec active changes at T8: only
  `2026-06-03-chrome-devtools-experience-e2e`.
- Existing open GitHub backlog overlaps:
  - `#4` F7 Integrate view real surface + live re-verification.
  - `#5` Steady-mode fidelity audit; overlaps Workspaces/Projects non-document
    widget parity.
  - `#6` Per-entry session selection for Workspace/Project nav entries.
  - `#1`, `#2`, `#3` remain backlog but did not require new tracking from this
    audit except as contextual overlap.
- Existing ChatColumn tests already encode the empty-answer-with-chips behavior:
  the UI suppresses an empty assistant bubble while keeping citations/actions.
  The `/workspaces` chip response with an empty answer was recorded as a
  user-visible limitation, but not filed as a new defect because it matches an
  explicit existing behavior contract and the typed steady chat path returned a
  prose answer.

### In-Scope Fixes Completed

- Anonymous onboarding chat bootstrap:
  - Fixed in T2 with `client.ts`/`client.test.ts`.
  - Fresh Chrome replay removed clean-flow `401` chat-session bootstrap noise.
- Live chat input identity:
  - Fixed in T2 with `chatPrimitives.tsx`.
  - Fresh Chrome replay showed `id="chat-live-input-field"` and
    `name="chatInput"`.
- PdfViewer stale highlight:
  - Fixed in T3 with `PdfViewerWidget.tsx`/test.
  - Fresh Chrome replay proved page-1 target highlight is hidden on page 3.
- Extract schema editor form identity:
  - Fixed in T3 with `SchemaView.tsx` and existing SchemaView tests.
  - Fresh Chrome replay showed stable ids/names and no form issues.
- SmartReport builder form identity:
  - Fixed in T3 with `SmartReportBuilder.tsx`/test.
  - Fresh Chrome replay showed no missing id/name controls.
- Gate continuation and form labels:
  - Fixed in T5 with `GateChatRail.tsx`/test and `Label.tsx`/test.
  - Fresh Chrome replay showed no orphan labels and visible
    `Continue to Integrate` after Extract/BYO gate commit.
- Auth form autocomplete:
  - Fixed in T5 with LoginForm/RegisterForm tests and components.
  - Fresh Chrome replay showed login/register autocomplete hints and no form
    issues.
- Invalid login visible recovery:
  - Fixed in T8 with `Login.tsx` and `Login.test.tsx`.
  - Focused regression passed: `npm --workspace app exec vitest run
    src/views/Auth/Login.test.tsx`, `4/4`, after first failing on the missing
    alert.
  - Fresh Chrome replay: invalid login rendered `role="alert"` with `Login data
    is not valid`, reset fields, stayed on `/auth/login`, had horizontal
    overflow `0`, and only the deliberate negative-probe
    `POST /api/auth/login [404]` resource error.
- Compact nav Escape close:
  - Fixed in T7 with `AppShell.tsx`/test.
  - Fresh Chrome replay proved Escape closes the mobile nav drawer.
- Mobile F1 contrast:
  - Fixed in T7 with `StepStrip.tsx`, `SampleScenarioCard.tsx`, and
    `IngestView.tsx` plus focused contrast tests.
  - Post-fix Lighthouse mobile snapshot improved Accessibility from `96` to
    `100`.

### Deferred / Tracked Findings

- Existing `#4` `backlog`, `feature`, `area:integrate`:
  - F7 Integrate real surface remains blocked/uncovered.
  - This audit must not count F7 as covered or archive as full sign-off.
- Existing `#5` `backlog`, `design-fidelity`, `area:steady`:
  - Steady Workspaces/Projects non-document canvas parity remains
    blocked/uncovered.
  - `/c/:sessionId` chat/PdfViewer works; Extract/SmartReport/Integrate parity
    does not.
- Existing `#6` `backlog`, `enhancement`, `area:conversation`:
  - Per-entry session selection still overlaps Workspaces/Projects scoped
    conversation behavior.
- New `#11` `backlog`, `content`, `area:report`, `severity:med`:
  - `SmartReport Utility render returns no_template, blocking rendered-section
    e2e coverage`.
  - Tracks the live Utility report path returning `reason: "no_template"` with
    empty sections, preventing rendered report sections and section
    accept/reject controls from being exercised.
- New `#12` `backlog`, `tech-debt`, `area:metadata`, `severity:low`:
  - `Lighthouse metadata cleanup: meta description, robots.txt, llms.txt`.
  - Tracks the remaining non-flow Lighthouse failures after accessibility was
    fixed.

Adversarial review: passed. Every confirmed in-scope defect has a focused
regression and live Chrome proof. Every deferred finding has a GitHub issue with
evidence and backlog status. Backlog blockers are explicitly not counted as
coverage.

## T9 - Full validation, commit, GitHub/OpenSpec cleanup, and summary

Status: passed with blocked-active caveat.

### Final Validation

- `npm test` passed:
  - Shared package build passed.
  - Alias, setup-env, and deploy asset checks passed.
  - App vitest: `190` files, `1551` tests passed.
  - Middleware vitest: `44` files, `730` tests passed.
- Targeted Playwright E2E passed after the stale locator repair:
  - Command: `PLAYWRIGHT_MIDDLEWARE_PORT=3101 PLAYWRIGHT_APP_PORT=4174
    npm --workspace app run test:e2e -- onboarding-compact.spec.ts
    onboarding-utility.spec.ts`.
  - Result: `31` passed, `32` intentionally skipped.
  - The previously failing magic-link continuation test passed in the full
    targeted run, not only in the focused `--grep` replay.
- `npm run scan:secrets` passed.
- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
  passed after this closeout entry: `18` passed, `0` failed.

### Final Chrome DevTools MCP Smoke

- Browser context: fresh isolated Chrome DevTools MCP context
  `chrome-devtools-e2e-audit-t9-smoke`.
- F1 `/onboarding` clean-flow smoke:
  - A11y tree exposed `Pick a starting point`, the Utility sample, BYO cards,
    and disabled authenticated-only step/nav controls.
  - Main region measured `1200 x 625`; horizontal overflow `0`.
  - App-owned requests were clean: `/api/onboarding/session [200]`,
    `/api/scenarios [200]`, `/api/chat-sessions [200]`, and
    `/api/viewer-events [201]`.
  - Console proof: only the expected frame debug log before sample selection.
- Utility sample `/onboarding/28454/utility` smoke:
  - The real chat pane and PDF canvas mounted.
  - Chat pane measured `360 x 661`; canvas measured `807 x 661`; PDF image
    measured `791 x 1024`; horizontal overflow `0`.
  - Live chat input exposed `id="chat-live-input-field"`, `name="chatInput"`,
    and `aria-label="Chat input"`.
  - App-owned onboarding/session/entity/message/workflow/document/xray requests
    returned `200`/`201`; no anonymous chat-session `401` remained.
  - Console proof after sample mount: no console messages.
- Login negative-branch smoke:
  - Route: `/auth/login`.
  - Filled visible Email and Password controls through the a11y snapshot.
  - Invalid submit rendered `role="alert"` with `Login data is not valid`,
    re-enabled the submit button, stayed on `/auth/login`, and left horizontal
    overflow at `0`.
  - The `POST /api/auth/login [404]` network response and matching resource
    console error are deliberate negative-probe evidence, not clean-flow
    failures.

### OpenSpec and GitHub Cleanup Decision

- GroundX Studio MCP account context was attached, but reported
  `workspaceTools:false`; no `commit_push` tool was available. Closeout uses
  ordinary git fallback after reading the Harness git fallback guidance.
  The first noninteractive HTTPS push with credential helpers disabled failed
  because the remote required credentials; the successful fallback used a
  one-shot SSH push to the same GitHub repo/branch, leaving the repo's configured
  HTTPS remote unchanged.
- This OpenSpec change is intentionally **not archived**. Required audit
  surfaces remain blocked/unexercised:
  - F7 Integrate real surface: backlog `#4`.
  - Steady Workspaces/Projects non-document widget parity: backlog `#5`/`#6`.
  - SmartReport rendered sections and section accept/reject controls on the live
    Utility path: backlog `#11`.
  - Lighthouse metadata cleanup: backlog `#12`; non-flow blocker only.
- No backlog blocker is counted as completed coverage.

Adversarial review: passed with blocked-active caveat. The final validation and
Chrome smoke evidence cover the fixed paths. Required blocked surfaces are named
with GitHub tracking and prevent archive/sign-off. Final live OpenSpec/GitHub
status is reported in the user closeout.
