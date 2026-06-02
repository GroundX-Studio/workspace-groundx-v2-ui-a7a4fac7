# E2E audit — defect log (live-data run, 2026-06-01)

Audited the post-`retire-mock-mode` build against REAL GroundX (no MOCK_MODE). One row per finding:
`id · surface · measured actual · expected · severity · status`.

## Defects

### DL-1 · Interact / live chat RAG · P1 · REVERIFIED ✅ (fixed via `2026-06-01-projects-rbac-scope-filter`)
- **LIVE RE-VERIFY (2026-06-02, done=user-visible):** fresh onboarding session, asked "What is the total
  amount due on this bill?" → **"The total amount due is $7,613.20. Due date is Jul 30, 2025."** with **2
  citation chips** + Show source (screenshot captured). Middleware log confirms the search dispatched
  `filter:{projectId:{$in:["proj_c7701da7-…"]}}` (the RBAC filter) → matched. Was: "no snippets were found
  for this bill." Fix = projects/RBAC layer (producer emits the real projectId + `rbacFilter` scopes to the
  caller's authorized projects) + the GroundX server-side filter-bug fix. Middleware suite 713 green.
- **ROOT CAUSE (confirmed 2026-06-02, supersedes the "likely cause" guess below):** two things, NOT
  the relevance floor — (1) the onboarding scope filtered by `projectId` but the seeded doc carried no
  `projectId` (its filter had `scenarioId` + a manifest blob); (2) a GroundX **server-side filter-matching
  bug** (now FIXED by the GroundX team). With the bug fixed + a `projectId` stamped, the exact query
  returns count 12, score 210, answer `$ 7,613.20`. The fix (projects table + RBAC grants + producer emits
  the real projectId + document-filter stamp) lives in **`2026-06-01-projects-rbac-scope-filter`**, which
  SUPERSEDES the withdrawn `2026-06-01-rag-retrieval-correctness` (its ground-truth regression suite was
  folded into that plan's Task 6). The relevance-floor hypothesis below is FALSIFIED (the reprocessed doc
  scores 210, well above the floor).
- **Measured (original):** asked "What is the total amount due on this bill?" in onboarding chat (scope =
  bucket 28454 / utility, doc c3bfff49). Live RAG returned **0 citation chips** and the answer:
  *"I can't determine the total amount due because no snippets were found for this bill. If you open
  or re-run extraction on utility-bill-april-2026.pdf, I can read the amount due from the bill text."*
  No client console error — the server RAG search returned no usable snippets.
- **Expected:** the demo sample's chat SHOULD answer "amount due" with a grounded citation (the
  WF-05b/WF-06 work targets exactly this line on this doc).
- **Likely cause (needs focused investigation, not assumed):** the utility sample is
  **extract-workflow-indexed**, so its searchable text is the extraction JSON and scores below
  GroundX's default relevance floor (see `project_groundx_search_geometry`). The chatRouter's
  zero-result low-floor retry (`RAG_FALLBACK_RELEVANCE`) is supposed to surface the JSON chunks — it
  either isn't firing, returns nothing usable, or the scope filter isn't matching. **Pre-existing**
  (the RAG path was always live; MOCK_MODE's canned chat answer was hiding it) — surfaced now that
  chat is always live. NOT attributable to the groundedAnswerOverScope migration (that's
  generation/verify; this is a search-results-empty issue upstream of it).
- **NEW TRIAGE (2026-06-01, live):** the SAME live RAG, queried at the **workspace/BUCKET scope** (steady
  `/workspaces`, bucket 28454), returned a RICH grounded answer with 21 citation chips (charge details off
  page 3) — i.e. RAG **works at bucket scope but returned 0 snippets at the single-DOCUMENT scope** (onboarding
  `documents:[c3bfff49]`). This strongly localizes the bug to the **document-scoped search path / filter**
  (a `documentId`-narrowed query suppressing the extract-indexed chunks), NOT generation and NOT a blanket
  RAG failure. The deep-dive should diff the search request body (filter/scope) bucket-scope vs doc-scope.
- **Fix candidates (decide in a focused change):** confirm/repair the low-floor retry actually
  surfaces the extract-JSON chunks for this doc; or route "amount due"-style questions through the
  extracted-field data (Extract already has `amount`/`balance_payable` values) rather than raw RAG
  search; or re-ingest the sample as plain-layout so search carries prose. → ticket as its own change.

### DL-5 · Steady mode (scoped shell canvas) · P1 · REVERIFIED (fixed in `2026-06-01-steady-canvas-mount`)
- **FIX (2026-06-01):** `ScopedConversationShell` now renders `<ScopedCanvas step={activeViewerStep}
  scope={canvasScope} role={widgetRole} reportSurface="render">` in its canvas slot (was an empty `<Box>`),
  reading the active viewer step via `selectActiveStep` and narrowing scope to `documents:[docId]` for a
  doc-viewer step — the same shared mount path OnboardingShell uses.
- **Test:** `ScopedConversationShell.test.tsx` "a doc-viewer viewer step mounts the production PdfViewer in
  the steady canvas pane" — confirmed RED against the stub, GREEN after the fix.
- **Live re-verify (MEASURED, /workspaces):** sent a query → grounded answer (6 citations) → clicked
  `cite-chip-1` (page 2) → `pdf-viewer-widget` now mounts in `scoped-shell-canvas-pane` (0→1 children), real
  page renders 658×852, viewer jumped to `data-highlight-page="2"`. Screenshot corroborated (page-2 "Charge
  Detail" in canvas). NOTE: the highlight BOX is absent because chat-search citations for this
  extract-indexed doc are bare (no bbox) — the known geometry limitation, separate from DL-5.
- **Gate:** revert→RED proven; OnboardingShell + ScopedCanvas tests (48) still green; drift guards (238) +
  full app suite (1513) + `tsc` + `npm run build` green; no direct viewer-widget import (registry path used),
  no fork.
- **Measured (live, /workspaces):** the steady shell (`scoped-shell`) renders and the live LLM chat WORKS
  (workspace/bucket scope returned a rich grounded answer with `cite-chip-1..21` + a
  `suggested-action-chip-show-source` + pin). BUT the canvas NEVER mounts a widget: clicking the
  `scoped-chat-pick-view-workspace-extract` pill, the `suggested-action-chip-show-source` chip, AND a
  `cite-chip` (which dispatches `highlightCitation` to the CanvasOrchestrator) all leave
  `scoped-shell-canvas-pane` with **0 children** (no `pdf-viewer-widget`, no `extract-workbench`, ever).
  No console error.
- **Root cause (code-confirmed):** `app/src/views/Scoped/ScopedConversationShell.tsx` (~L132-138) hardcodes
  `canvasPane` as an EMPTY `<Box data-testid="scoped-shell-canvas-pane" />` — it does NOT render
  `<ScopedCanvas>` (the component whose own docstring says it is "the SOLE viewer-widget mount path in
  BOTH shells", resolving the active `ViewerStep` → `CanvasKind` → production-registry widget). OnboardingShell
  DOES mount `<ScopedCanvas>` (OnboardingShell.tsx:524); the steady shell was left with a stub. Nothing the
  orchestrator pushes is ever read by the steady canvas.
- **Expected:** the steady shell's canvas mounts `<ScopedCanvas>` fed by the active viewer step + scope +
  role, so cite-chip / Show-source / pick-view mount the production PdfViewer · Extract · SmartReport ·
  Integrate on real data (2.12 parity; `feedback_no_onboarding_duplicates` — same production widgets in the
  authed experience).
- **Why unit tests missed it:** ScopedCanvas + the CanvasOrchestrator's `highlightCitation` handler are
  each unit-tested in isolation and pass; the GAP is the steady shell never WIRING ScopedCanvas to its
  canvas slot — an integration seam only a live/shell-level test catches.
- **Fix (own change, NOT inline):** render `<ScopedCanvas>` in `ScopedConversationShell`'s canvas slot
  (mirror OnboardingShell's step→scope→role wiring + idle state) with a FAILING shell-integration test
  first (assert a cite-chip dispatch mounts `pdf-viewer-widget` in `scoped-shell-canvas-pane`). → ticket.

### DL-2 · global · P3 · REVERIFIED (fixed in-place, e2e-audit §4)
- **Measured:** React Router **v7 future-flag warning** logged ~24× to the console
  (`v7_startTransition`). Harmless but noisy; pollutes the console sweep.
- **Expected:** clean console.
- **FIX (2026-06-01):** added `export const ROUTER_FUTURE_FLAGS = { v7_startTransition: true }` in
  `router.tsx` and applied it on `<RouterProvider future={ROUTER_FUTURE_FLAGS}>` in `App.tsx` — the flag
  lives on RouterProvider, NOT the `createBrowserRouter` `future` arg (that was the initial mis-wire the
  behavioral test caught). Deliberately did NOT opt into `v7_relativeSplatPath` (it changes relative-link
  resolution inside our `/:bucketId/:scenarioId/*` splat route — out of scope for a console-noise fix).
- **Test:** `router.future.test.tsx` — `<RouterProvider future={ROUTER_FUTURE_FLAGS}>` produces ZERO
  "Future Flag" `console.warn` calls (RED first: failed with no export, then with the flag mis-placed on
  createMemoryRouter → 1 residual warning; GREEN once moved to RouterProvider). + a guard asserting the
  flag stays `true`.
- **Live:** the Vite-served `App.tsx`/`router.tsx` modules confirmed to carry the fix
  (`future: ROUTER_FUTURE_FLAGS` + `v7_startTransition: true`). NOTE: the Claude_Preview console buffer is
  cumulative + FIFO-capped, so it still shows pre-fix warnings from this session's earlier reloads — the
  unit test + served-module grep are the authoritative proof, not the stale buffer.
- **Gate:** full app suite (1515) + `tsc` + app `npm run build` green; no routing-path behavior change.

### DL-4 · Report (pin → render reflection) · P3 · REVERIFIED (fixed in-place, e2e-audit §4)
- **Decision (user, 2026-06-01):** keep `Pin→template = NO auto`, but the render's empty/no-content state
  MUST surface a reachable entry to an existing draft so a pinned draft isn't orphaned.
- **FIX:** `SmartReportRender` now reads the active session's `reportOverlay.addedFields` (the pinned
  draft sections). When the scope renders empty BUT a draft exists, the `smart-report-empty` state shows
  "You have a report draft in progress — N pinned answers…" + a reachable `smart-report-open-draft-builder`
  `<button>` that dispatches the `editTemplate` intent (→ builder f4a) — the SAME hand-off the per-section
  `✎ edit` affordance and `show_smart_report_edit` tool use (no fork). No auto-open, no saved template
  created (decision honored).
- **Test:** `SmartReportRender.test.tsx` — (1) draft present → affordance renders (button, "open builder",
  "draft in progress" copy); (2) no draft → affordance absent. Revert-check: reverting the component change
  makes test (1) FAIL (testid not found) while (2) stays green — a real regression test.
- **Gate:** drift guards (238) + full app suite (1517) + `tsc` + app `npm run build` green; affordance reuses
  the existing editTemplate dispatch path (proven by the per-section edit test); sx uses theme constants
  (no-hardcoded-styles guard green).
- **Live note:** onboarding chat-intro bootstrap was stuck post-`resetExperience` this session (input
  renders, NO console errors, full suite green → environmental, not a regression), so the onboarding live
  corroboration was blocked; the affordance renders deterministically from `chatState` and is authoritatively
  covered by the unit tests above. (Steady chat path is healthy — see DL-5.)

### DL-4 (ORIGINAL) · Report (pin → render reflection) · P3 · superseded by the fix above
- **Measured:** in onboarding Report (frame f4, no template), clicked `pin-to-report-button` → the
  existing-or-new resolution surfaced as `pin-to-report-resolution-prompt-new-only` reading "Pinned to a
  new report draft." (correct new-only variant — no existing template). BUT re-checking the Report render
  (f4) immediately after, it STILL shows `smart-report-empty` ("No report for this scope yet…") with no
  visible entry point to the just-created draft.
- **Expected (to confirm):** unclear by design — a pinned draft section has a question but NO generated
  answer yet, and the live render only runs over a real template with generated answers; `Pin→template =
  NO auto` means pinning intentionally does NOT auto-open the builder (f4a). So the render staying empty
  may be correct. The open question is whether the render (or a chip) should reflect the existence of a
  draft so the user can reach the builder without an LLM chat tool-call.
- **Why not a confirmed defect:** builder (f4a) + section accept/reject open via the `show_smart_report_edit`
  / `editTemplate` chat tool (covered by CanvasOrchestrator tests: editTemplate→f4a + section pre-select)
  and operate on a real user-created template — by the locked pre-launch decision NO sample template exists,
  so this path is not live-drivable in this scenario by design. → investigate reflection/entry-point in a
  focused change; do NOT fix inline.

### DL-3 · responsive (mobile 375px) · P2 · CLOSED — NOT A DEFECT (harness artifact)
- **Verification (2026-06-01, MEASURED):** LOADING the onboarding page at 375×812 (a fresh navigation, NOT
  `preview_resize` into it) correctly switches to compact: `appshell-compact-topbar` +
  `appshell-compact-nav-toggle` + `appshell-compact-view-toggle` present, full `onboarding-nav` absent,
  zero horizontal overflow (scrollWidth 375 = innerWidth 375). The breakpoint/`useMediaQuery` works.
- **Conclusion:** the original "stayed non-compact" reading was the `preview_resize`-doesn't-re-fire-React-
  `useMediaQuery` harness artifact (the same class as the winW=1 stuck viewport at session start), not a
  product bug. No code change. Closed.

### DL-3 (ORIGINAL) · responsive (mobile 375px) · P2 · superseded by the verification above
- **Measured:** at a 375×812 viewport the onboarding page has **no horizontal overflow** (scrollWidth=375,
  zero over-wide elements) — good — BUT it stayed in the DESKTOP (non-compact) layout: `appshell-compact-topbar`
  absent, nav/view toggles not present. A narrower default width EARLIER in the session DID render compact
  mode, so the mechanism exists.
- **Expected:** at mobile width the shell switches to compact (single-pane + nav/view toggles).
- **Caveat:** may be a `preview_resize`-doesn't-fire-React-`useMediaQuery` artifact rather than a real
  breakpoint bug — **verify by loading at a mobile width (not resizing into it)** before fixing. → e2e-audit-followup / ticket.

## Passes (live, measured — no defect)
- **2.11 Auth — password show/hide:** the password input flips `type="password"` → `type="text"` on the
  visibility toggle (validates the `PasswordField` primitive).
- **F1 Ingest:** sample + BYO tiles render; parsed-doc fetch 200 real data; pick → `/onboarding/28454/utility`.
- **F2 Understand/PDF:** page renders **958×1240** (24px-collapse cleared), 3 page thumbnails, no error.
- **F3 Extract:** workbench renders 3 category tabs (Statement·14 / Meters·16 / Charges·6) with real field
  rows + real values (e.g. addressee = "KWIK TRIP (1147)") + topbar export/rerun/save.
- **Report (no-template):** graceful `smart-report-empty` ("No report for this scope yet. Pin an answer or
  open the builder…") — not an error/fixture.
- **2.3 Extract — deep controls (live, desktop 1280):** category tabs render with real counts
  (Statement·14 / Meters·16 / Charges·6) and switch (meters fields `meter_id`/`meter_location`/… present);
  field-select → `field-provenance-panel` breadcrumb ("Statement › addressee › KWIK TRIP (1147)"); JSON
  render-mode toggle is scenario-gated (`scenario.supportsJsonRender`; Utility=false → correctly hidden,
  mechanism wired for scenarios that enable it); field edit / CSV-JSON export / save / upload locked behind
  sign-in via `mode="onboarding"` (`extract-unlock-banner` — expected mode-prop lock, NOT a defect).
- **2.10 Citation round-trip via Extract (live, MEASURED):** selecting the `addressee` field renders
  `pdf-viewer-highlight` over the real PDF image at left=541/top=176/w=127/h=148. The live field-geometry
  endpoint (`POST /api/documents/c3bfff49…/field-geometry → 200`, X-Ray join) returned bbox
  {x:0.1247,y:0.03,w:0.3106,h:0.2795,page:1}; computed overlay = img.left 490 + 0.1247·409 = 541, top 160 +
  0.03·529 = 176, w 0.3106·409 = 127, h 0.2795·529 = 148 — overlay lands EXACTLY on the geometry. (This is
  the Extract→source path; the CHAT→source citation path is blocked upstream by DL-1.)
- **2.5 Report — pin resolution (live):** `pin-to-report-button` → `pin-to-report-resolution-prompt-new-only`
  → "Pinned to a new report draft" (correct existing-or-new new-only variant). See DL-4 for the
  render-reflection open question. Builder f4a + section accept/reject not live-drivable without a real
  template (by design) → unit/orchestrator/widget-test coverage.
- **2.6 Integrate (onboarding) — correctly gated:** the Integrate step is `aria-disabled="true"` +
  `cursor: not-allowed` (sits after the F6 sign-up gate; locked until real auth). Expected. The Integrate
  WIDGET (production, shared with steady) is exercised under steady mode (2.12).
- **2.7 Sign-up gate — PASS (live):** triggering `openGate("save")` from Extract's `extract-unlock-banner`
  reveals the gate as a chat moment with all three doors — `gate-rail-email` (type=email) +
  `gate-rail-send-magic-link`, `gate-rail-sso`, `gate-rail-book-call` — plus `gate-rail-dismiss`
  ("← Keep exploring") and `gate-rail-typing`; the `gate-value-prop` ("WHY GROUNDX — Answers you can
  trust…") renders IN THE CANVAS (`.closest(appshell-canvas)` = true), not as a form. Filling
  `audit@example.com` + clicking send → `gate-rail-committed` ("WELCOME — YOU'RE SIGNED IN. Your sample
  work is now saved…"). The `gate-rail-continue-integrate` button is frame-conditional (`onGateFrame`,
  only on F6) so correctly absent when the gate is triggered as an overlay from Extract (f3).
  *Minor observation (not filed):* the committed copy says "you're signed in" while Integrate stays
  locked — realistic (magic-link needs the emailed link clicked to actually auth); demo-optimistic copy.
  *Harness note:* `preview_click` on the role=button banner intermittently didn't fire React's onClick;
  a direct `element.click()` in eval did — test-harness timing, not a product defect.
- **2.12 Steady mode (live, /workspaces):** the steady `scoped-shell` renders with the real workspace
  scope (bucket 28454, "1 sample ready"), nav gains Settings, chat = `workspace` scoped experience with
  Summarize/Extract/Report pills. **Live chat returns rich grounded answers with citations** (21 cite-chips,
  page-3 charge details). **PARTIAL — blocked by DL-5:** the canvas never mounts a widget (steady shell
  canvas is a stub), so PdfViewer/Extract/SmartReport/Integrate parity is NOT live-verifiable until DL-5 is
  fixed. (The widgets themselves are verified in onboarding; the gap is purely the steady shell's canvas
  wiring.)
- **2.13 Debug reset — PASS (live, MEASURED):** with `?debug=true`, `debug-overlay-reset` →
  `resetExperience()` hard-navigated to `/onboarding`; sessionStorage fully cleared (1→0 keys), the stale
  localStorage keys (`gate-sequence-played`, `gate-composed.anon-…`, `thinking-stream-done.utility`,
  `appshell.chatWidth.v2`) all removed, and the surviving `chat-store.v1` is a FRESH 358-byte store with NO
  trace of the prior session (`c-b472efeb`) or scenario (utility/28454). csrf_token cookie is a fresh token
  for the new session (not session state). Forward-binding intact (`lib/resetExperience.ts`).
- **2.15 Reduced-motion — code + unit verified (live OS-feature not settable in harness):** `MotionRoot`
  wraps the app in framer-motion `MotionConfig reducedMotion="user"` (global floor honoring the OS
  preference); `useReducedMotion()` is consumed in 9 components (e.g. `reduceMotion` threaded into
  GateChatRail/GateMessage); unit-tested (MotionRoot/GateChatPanel/AppShell + `setup.ts` matchMedia mock).
  The Claude_Preview eval harness cannot set the `prefers-reduced-motion` media feature on the server, so
  the live OS-level reveal-degradation pass is a documented harness limitation — NOT faked.
- **2.10 Citation round-trip — chat path:** the Extract→source path PASSES (measured, above). The
  CHAT→source path is NOT live-verifiable end-to-end yet: onboarding chat is blocked by DL-1 (0 snippets at
  doc scope); steady chat DOES return citations but the source-mount is blocked by DL-5 (stub canvas). Both
  are ticketed; the round-trip mechanism (CiteChip → `highlightCitation` → ScopedCanvas → PdfViewer overlay)
  is proven on the Extract surface.

## Still to drive (live)
2.3 extract field add/edit/JSON-toggle + provenance-highlight-on-click · 2.5 report render WITH a template
+ section accept/reject + builder · 2.6 Integrate · 2.7 sign-up gate · 2.9 gates · 2.10 citation
round-trip click→viewer highlight · 2.11 auth (password toggle, claim/flip) · 2.12 steady-mode parity ·
2.13 debug reset · 2.14 responsive/mobile · 2.15 reduced-motion · 2.16 full console/network sweep.
