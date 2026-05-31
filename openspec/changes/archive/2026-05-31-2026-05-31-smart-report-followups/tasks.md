# Tasks — smart-report follow-ups (initial-render round-trip + live verify)

> TDD: failing test first, then implement, then adversarial review per task. The Phase-7 live
> multi-doc render is BLOCKED on WF-10 and is NOT in this change — do not start it here. WIP cap = 3.

## Decisions (gate the implementation)

- [x] **DECIDED:** dedicated loading affordance (`smart-report-loading`), NOT an optimistic
      `getReportFixture` placeholder. Rationale: the proposal's composable invariant requires NO
      surviving parallel fixture-read code path in the widget — an optimistic placeholder would keep
      one. So the synchronous fixture read is removed entirely from the widget; the loading state is
      a visible `smart-report-loading` status while the first-paint `renderReport` is in flight. — DONE
- [x] **DECIDED:** a zero-section endpoint response renders the existing `smart-report-empty` copy
      (empty and the no-template scope collapse to ONE empty branch); a transport ERROR is a distinct
      retryable branch (`smart-report-error` + `smart-report-retry`). Empty ≠ error. — DONE

## 1 · First-paint lifecycle — async-first-paint test (TDD, failing first)

- [x] Rewrite the synchronous first-paint assertions in
      `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx` to async against
      a mocked `renderReport`: the four IC-brief sections, the `cite-chip-1` test, the anon
      preview-lock test, `onEditSection`, the empty-state test, and the `useScopeAdapter` re-resolve
      test now assert via `findBy*` / `waitFor` AFTER the mocked endpoint resolves. Add a failing test
      that the FIRST paint calls `renderReport` (not `getReportFixture`) and renders its RESPONSE.
      — DONE: 13-test file rewritten; ran red (9 failing) then green. Coverage NOT weakened — the four
      sections, the CiteChip doc-id, the anon export-lock + preview badge, `onEditSection`, and the
      re-scope re-resolve all still assert, now driven through the mocked endpoint.
- [x] Add failing tests for the new first-paint states: a `loading` affordance while the call is in
      flight (per the INPUT-NEEDED decision), `empty` when the endpoint returns no report/sections, and
      a retryable `error` banner when the first-paint call rejects.
      — DONE: `smart-report-loading` (deferred promise held in flight), zero-section → `smart-report-empty`,
      rejected call → `smart-report-error` + `smart-report-retry` (retry re-issues the call and paints).

## 2 · First-paint lifecycle — implement

- [x] Replace the synchronous `getReportFixture(scope)` first paint and the synchronous re-scope body
      in `useScopeAdapter` with a `renderReport` fetch. Introduce a first-paint lifecycle
      (`loading → ready | empty | error`) that converges with the existing re-render path onto ONE
      fetch helper (no surviving parallel fixture-read code path in the widget). Preserve the existing
      `↻ re-render` control, the gate/preview behavior, the CiteChip wiring, and `✎ edit §N`.
      — DONE: single `runRender(scope, phase)` helper drives both first-paint and re-render through
      `renderReport`. `useScopeAdapter` now calls `runRender(nextScope, "first-paint")`. Widget has
      ZERO `getReportFixture` references (verified by grep). Template id resolved via a new
      `reportTemplateIdForScope(scope)` routing helper (scope→template id, NOT a report read), added to
      `app/src/widgets/reportFixtures.ts`. Gate envelope, `previewOnly` badge, export lock, CiteChip,
      and `✎ edit §N` all preserved.
- [x] Render the loading / empty / error states as user-visible affordances (loading testid per the
      decision, the existing `smart-report-empty`, a retryable error banner reusing the
      `smart-report-rerender-error` pattern). Make first-paint and re-render share the error/retry UI.
      — DONE: `smart-report-loading` (role=status), `smart-report-empty` (reused), `smart-report-error`
      + `smart-report-retry` button (retry calls `runRender(scope,"first-paint")`). The re-render path
      keeps its own `smart-report-rerender-error` banner; both reject paths surface a retryable affordance.

## 3 · Shell / view test updates for the async first paint

- [x] Update `app/src/views/Onboarding/OnboardingShell.test.tsx` report assertions (Phase 0 sections,
      Phase 1 anon preview-lock, Phase 1 Loan empty-state, f4↔f4a round-trip) for the async first
      paint: mock `renderReport` at the shell level so the surface paints the endpoint response, and
      assert rendered sections / preview lock / empty via `findBy*`. The `findByTestId("smart-report-render")`
      mount assertions already tolerate async; confirm they still pass.
      — DONE: added a shell-level `vi.mock("@/api/smartReport")` that returns the real
      `getReportFixture(scope)` for the render scope (MOCK_MODE parity). Phase 0 sections + cite-chip,
      Phase 1 anon preview-lock, and Extract→Report scope assertions moved to `findBy*`; Loan empty-state
      → `findByTestId`. f4↔f4a + the root-mount assertions already used `findByTestId` and stay green.
      All 40 OnboardingShell tests pass. Also updated `ReportBuilderView.test.tsx` (the render→builder
      `✎ edit §N` hand-off test mounts `ReportRenderView`) with the same mock + an awaited edit affordance.
- [x] Confirm `ReportRenderView` needs no change (it only resolves scope + role and mounts the widget);
      if the shell-level `renderReport` mock must live in a shared test helper, add it there.
      — DONE: `ReportRenderView.tsx` unchanged (scope+role resolver only). No `ReportRenderView.test.tsx`
      exists; the wrapper is exercised via OnboardingShell + ReportBuilderView. The `renderReport` mock
      is inlined per-test-file (two call sites) rather than a shared helper — small + local, no shared
      helper churn warranted (earn-the-abstraction).

## 4 · Verify the change end-to-end

- [x] `scaffold/app` + `scaffold/middleware` vitest green; `npm run build` (tsc + vite) clean;
      `widget-contract`, `no-hardcoded-styles`, `widget-access-matrix`, `check-tool-quality` drift
      guards pass.
      — DONE: app 1371/1371, middleware 598/598, build clean, all four drift guards pass.
- [x] Adversarial review: confirm NO synchronous fixture-read first-paint path survives in
      `SmartReportRender.tsx`; confirm first paint and re-render share one fetch path; confirm the
      render endpoint contract, gate/preview policy, builder, pin flow, and `show_smart_report_*` tools
      are unchanged; confirm Phase-7 live multi-doc code was NOT added.
      — DONE: `grep -c getReportFixture SmartReportRender.tsx` = 0 (no fixture read survives). First
      paint + re-render both go through `runRender → renderReport` (one path). `api/smartReport.ts`,
      `SmartReportRender.tools.ts`, the builder, and the pin flow are untouched. No `search_groundx`
      fan-out added (the only "fan-out" token is the Phase-7-deferred doc comment). Gate handling
      (`result.gated`) + `previewOnly` lock present on both paths.

## 5 · Manual live-verify (Chrome DevTools MCP)

> REQUIRES A MANUAL CHROME-DEVTOOLS PASS — this cannot be run headlessly by the implementation agent.
> Left unchecked deliberately; do NOT mark green without an actual live pass in the running app. The
> automated coverage already proves the first-paint endpoint call fires (SmartReportRender.test:
> "FIRST paint calls the render endpoint client") and the shell tests prove the sections/CiteChip/
> preview-lock render from the endpoint response.

- [ ] Live-verify the shipped Utility report path in the real app (Chrome DevTools MCP): Utility →
      Report pill → the FIRST render paints from `POST /api/widgets/smart-report/reports/render` (confirm
      the network call fires on first paint, not a fixture-only render) → click a CiteChip → the viewer
      jumps to the cited document at the cited page with the region lit → `✎ edit §N` → the builder
      (f4a) opens with that section pre-selected → pin-from-chat lands a section onto a template.
- [ ] Live-verify Interact → Report carries the Interact `ContentScope` onto the render scope (the user
      does not re-pick content).

## 6 · Closeout

- [x] `OPENSPEC_TELEMETRY=0 openspec validate 2026-05-31-smart-report-followups --strict` passes.
      — DONE: "Change '2026-05-31-smart-report-followups' is valid".
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
