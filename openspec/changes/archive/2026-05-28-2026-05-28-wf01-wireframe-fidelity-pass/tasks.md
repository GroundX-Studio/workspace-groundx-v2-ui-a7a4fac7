# Tasks — WF-01 wireframe fidelity pass

## F1 — Ingest landing

- [ ] **Failing test:** `OnboardingShell.test.tsx` — F1 (`isF1 === true`)
      hides the AppShell sidebar AND the chat pane; canvas takes full
      width.
- [ ] Add `appShellChrome="bare"` (or equivalent) prop to AppShell;
      `OnboardingShell` passes it on F1, default on every other frame.
- [ ] **Failing test:** `IngestView.test.tsx` — three sample tiles
      render (Utility / Loan / Solar) with correct badge state from
      `chapters.{extract|interact|report}`.
- [ ] Extend the scenario fixture from 1 → 3 in
      `middleware/src/services/scenarioRegistry.ts` + add Loan + Solar
      manifest fixtures (per `openspec/wireframes/source/uploads/
      preloaded-content-scenarios.md`).
- [ ] Add the missing "↳ Sign up triggers F1→F2 transition + loads F6
      gate inline in chat" coral pill below the BYO label.
- [ ] Tune step-strip lock copy: "not yet reachable" or empty `title=`
      instead of "Available after sign-in" for the anon flow.

## F2 — Understand · live parse

- [ ] **Failing test:** `UnderstandView.test.tsx` — when frame is F2,
      the canvas renders the PDF viewer (`PdfViewerWidget`) AND the
      thinking-stream is rendered in the chat column (not the canvas).
- [ ] Wire `OnboardingShell.tsx:404` so `case "doc-viewer"` actually
      renders `<UnderstandView/>` containing `<PdfViewerWidget/>` +
      `<ScanAnimation/>` + `<PageThumbnails/>`. Today UnderstandView is
      a placeholder.
- [ ] **Failing test:** step strip stays on "Understand" (active green)
      while the thinking stream is playing; flips to "Extract" only on
      `Done. Ready to analyze.` bubble.
- [ ] Build `ScanAnimation.tsx` — thin horizontal gradient sweep
      top→bottom over 4s, looping; reduced-motion fallback = 80ms
      crossfade per frame (already noted in `project_ui_runtime.md`).
- [ ] Build `PageThumbnails.tsx` strip — parsing page green-bordered +
      glow, queued pages dimmed.
- [ ] **Failing test:** `Done.` bubble copy = `Done. {pageCount} pages
      · {statementFields} statement fields · {meterCount} meters ·
      {chargeCount} charges. Ready to analyze.`
- [ ] Extend "Pick a view:" chips to `statement · meters · charges ·
      edit schema` (4 chips).

## F3 — Extract · doc + fields side-by-side

- [ ] **Failing test:** `ExtractView.test.tsx` — pane order is PDF
      LEFT, fields RIGHT; PDF pane is `1.2fr`, fields pane is `1fr`.
- [ ] Flip the pane order in `ExtractView.tsx` + parent grid.
- [ ] **Failing test:** the topbar renders all controls (`← back`,
      schema name + version, `export ▾`, `↻ rerun`, `💾 Save 🔒`)
      without overlap. (`getBoundingClientRect` of each control;
      assert no x-axis overlap with siblings.)
- [ ] Refactor the topbar layout (use `flex`/`gap` instead of whatever
      absolute positioning is causing the overlap).
- [ ] **Failing test:** category tabs row renders with `{categoryName}
      · {fieldCount}` for each category in the active schema; clicking
      a tab switches the visible field list.
- [ ] Add `<CategoryTabs/>` to ExtractView.
- [ ] **Failing test:** sign-in unlock banner renders below the panes
      with the locked-field count from the active schema.
- [ ] Add `<UnlockBanner/>` (extend the existing PreviewLock / similar
      if one exists; otherwise new component).
- [ ] **Failing test:** field card renders uppercase snake_case key
      (not the human label), value in bold navy, coral citation chip
      `[n] p.X`.
- [ ] Update `FieldCard` (in ExtractView) to the canonical anatomy.
- [ ] **Failing test:** active field card has green inset border, not
      blue.
- [ ] Hide / repurpose the "Try asking a question →" CTA at the bottom
      of the left pane (not in canonical).

## F4 — Field provenance

- [ ] **Failing test:** clicking a field card swaps the right pane
      from "Extracted fields" → `<FieldProvenancePanel/>` with FIELD /
      SOURCE / WHY MATCHED / CONFIDENCE / NEIGHBORS sections.
- [ ] Build `FieldProvenancePanel.tsx` (under `viewer-widgets/`).
- [ ] **Failing test:** breadcrumb `← all fields › {category} · #{n}
      › {fieldKey}` appears above the panes; `▴ collapse` returns to
      F3.
- [ ] Wire `▴ collapse` + `↗ open full doc` ghost buttons.
- [ ] **Failing test:** when the panel is open, the PDF region for
      the selected field is highlighted green with floating `match ·
      {confidence}%` label.
- [ ] Add region-highlight overlay to `PdfViewerWidget`.

## F5 — Interact · synthesis answer

- [ ] **Failing test:** when an assistant reply lands with N citations,
      the PDF viewer in the canvas renders N lit regions, each
      color-keyed to the corresponding `[N]` CiteChip in the answer.
- [ ] Extend `PdfViewerWidget` to accept a `litRegions[]` prop and
      paint each region with its `color` (green / cyan / coral).
- [ ] **Failing test:** F5 sample switcher row + collapsed-history
      strip render at the top of the chat column.
- [ ] Reuse the existing CollapsedHistoryStrip / SampleSwitcher if
      they exist; wire them into the F5 chat column.
- [ ] **Failing test:** unlock banner appears after ≥1 extract + 2
      questions in the same session.

## Step strip (cross-cutting)

- [ ] **Failing test:** Extract / Interact / Report sub-pills inside
      the ANALYZE bracket have `role="button"`, `tabindex=0`, and an
      `onClick` that advances the frame when the step is reachable.
- [ ] Refactor sub-pill render in `StepStrip.tsx` (around line 38 in
      the JSDoc — locate the actual render line) to use the same
      `Pill` component or equivalent role/handler.
- [ ] **Failing test:** disabled sub-pill has `aria-disabled="true"`
      and is NOT focusable.
- [ ] Tune locked-step `title` copy from "Available after sign-in" to
      a neutral "Not yet reachable" (only sign-in-gated steps keep the
      sign-in copy).

## Sub-frame routes

- [ ] **Failing test:** `/onboarding/:bucketId/:scenarioId/:step` for
      `step ∈ {ingest, understand, extract, interact, integrate}`
      hydrates the right frame.
- [ ] Either add the sub-frame routes to `routerPaths.ts` +
      `router.tsx`, OR add a wildcard redirect to the canonical
      no-step URL — and a test that the error boundary never fires
      for these paths.

## AppShell chrome modes

- [ ] **Failing test:** AppShell accepts `chrome="bare" | "full" |
      "minimal"`; `bare` hides both the sidebar and the chat pane.
- [ ] Extend AppShell + thread `chrome` from `OnboardingShell` per
      frame. Default `full`.

## Closure

- [ ] All app tests green; no regressions in middleware suite.
- [ ] `widget-contract.test.ts` + `no-hardcoded-styles.test.ts` green.
- [ ] OpenSpec `validate --all --strict` passes.
- [ ] Re-run the Chrome DevTools MCP walk; capture screenshots under
      `.review/wf01-after/`; diff against `.review/` baseline.
- [ ] Update `project_build_status.md` snapshot.
- [ ] Archive this change.

## Follow-ups (not in this change)

- File `WF-02 — S-series surfaces` for S1 Loan JSON, S2 Solar Portfolio,
  S3 IC brief, S3a Report Builder.
- File `WF-03 — F6 gate visual fidelity` if the F6 probe surfaces
  visual gaps.
- File `WF-04 — F7 IntegrateView real connector cards` (already
  tracked in `ui-views` spec — verify if still needed).
