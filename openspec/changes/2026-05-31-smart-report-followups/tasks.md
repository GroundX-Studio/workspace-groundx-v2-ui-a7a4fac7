# Tasks — smart-report follow-ups (initial-render round-trip + live verify)

> TDD: failing test first, then implement, then adversarial review per task. The Phase-7 live
> multi-doc render is BLOCKED on WF-10 and is NOT in this change — do not start it here. WIP cap = 3.

## Decisions (gate the implementation)

- [ ] **INPUT NEEDED:** On the INITIAL f4 paint, while `renderReport` is in flight, should the surface
      show a dedicated loading skeleton/spinner (`smart-report-loading`), or briefly show the
      synchronous `getReportFixture` result as an optimistic placeholder and then reconcile with the
      endpoint response? (Affects whether the fixture read survives at all in the widget, and the
      first-paint test shape.)
- [ ] **INPUT NEEDED:** When the endpoint returns a report with zero sections (vs. a transport error),
      should that render the existing `smart-report-empty` copy, or a distinct "rendered but empty"
      state? (Determines whether empty and error collapse to one branch.)

## 1 · First-paint lifecycle — async-first-paint test (TDD, failing first)

- [ ] Rewrite the synchronous first-paint assertions in
      `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx` to async against
      a mocked `renderReport`: the four IC-brief sections, the `cite-chip-1` test, the anon
      preview-lock test, `onEditSection`, the empty-state test, and the `useScopeAdapter` re-resolve
      test now assert via `findBy*` / `waitFor` AFTER the mocked endpoint resolves. Add a failing test
      that the FIRST paint calls `renderReport` (not `getReportFixture`) and renders its RESPONSE.
- [ ] Add failing tests for the new first-paint states: a `loading` affordance while the call is in
      flight (per the INPUT-NEEDED decision), `empty` when the endpoint returns no report/sections, and
      a retryable `error` banner when the first-paint call rejects.

## 2 · First-paint lifecycle — implement

- [ ] Replace the synchronous `getReportFixture(scope)` first paint and the synchronous re-scope body
      in `useScopeAdapter` with a `renderReport` fetch. Introduce a first-paint lifecycle
      (`loading → ready | empty | error`) that converges with the existing re-render path onto ONE
      fetch helper (no surviving parallel fixture-read code path in the widget). Preserve the existing
      `↻ re-render` control, the gate/preview behavior, the CiteChip wiring, and `✎ edit §N`.
- [ ] Render the loading / empty / error states as user-visible affordances (loading testid per the
      decision, the existing `smart-report-empty`, a retryable error banner reusing the
      `smart-report-rerender-error` pattern). Make first-paint and re-render share the error/retry UI.

## 3 · Shell / view test updates for the async first paint

- [ ] Update `app/src/views/Onboarding/OnboardingShell.test.tsx` report assertions (Phase 0 sections,
      Phase 1 anon preview-lock, Phase 1 Loan empty-state, f4↔f4a round-trip) for the async first
      paint: mock `renderReport` at the shell level so the surface paints the endpoint response, and
      assert rendered sections / preview lock / empty via `findBy*`. The `findByTestId("smart-report-render")`
      mount assertions already tolerate async; confirm they still pass.
- [ ] Confirm `ReportRenderView` needs no change (it only resolves scope + role and mounts the widget);
      if the shell-level `renderReport` mock must live in a shared test helper, add it there.

## 4 · Verify the change end-to-end

- [ ] `scaffold/app` + `scaffold/middleware` vitest green; `npm run build` (tsc + vite) clean;
      `widget-contract`, `no-hardcoded-styles`, `widget-access-matrix`, `check-tool-quality` drift
      guards pass.
- [ ] Adversarial review: confirm NO synchronous fixture-read first-paint path survives in
      `SmartReportRender.tsx`; confirm first paint and re-render share one fetch path; confirm the
      render endpoint contract, gate/preview policy, builder, pin flow, and `show_smart_report_*` tools
      are unchanged; confirm Phase-7 live multi-doc code was NOT added.

## 5 · Manual live-verify (Chrome DevTools MCP)

- [ ] Live-verify the shipped Utility report path in the real app (Chrome DevTools MCP): Utility →
      Report pill → the FIRST render paints from `POST /api/widgets/smart-report/reports/render` (confirm
      the network call fires on first paint, not a fixture-only render) → click a CiteChip → the viewer
      jumps to the cited document at the cited page with the region lit → `✎ edit §N` → the builder
      (f4a) opens with that section pre-selected → pin-from-chat lands a section onto a template.
- [ ] Live-verify Interact → Report carries the Interact `ContentScope` onto the render scope (the user
      does not re-pick content).

## 6 · Closeout

- [ ] `OPENSPEC_TELEMETRY=0 openspec validate 2026-05-31-smart-report-followups --strict` passes.
- [ ] Mark the archived `2026-05-29-smart-report-screen` follow-up ticket (initial-paint conversion)
      and its two manual closeout items (live-verify, Interact→Report scope) as discharged by this
      change; update `project_build_status.md` and `project_dev_contracts.md` (W8 first paint now
      endpoint-sourced). Note Phase 7 (live multi-doc Solar render) remains BLOCKED on WF-10.
- [ ] Archive: `openspec archive 2026-05-31-smart-report-followups --yes`.

## Blocked / NOT in this change

- [ ] **BLOCKED (WF-10) — NOT in this plan:** Phase 7 live multi-doc Solar render — fan each section's
      `question` through `search_groundx` (scoped by the section's `ContentScope`) + grounded generation
      + WF-06b verification against real docs; Solar multi-doc/multi-project/multi-workspace render on
      the same surface. UNBLOCK: real Solar source assets ingested (WF-10). Tracked in the archived
      `2026-05-29-smart-report-screen` Phase 7 block; do NOT start here.
