# Smart-report follow-ups — initial-render round-trip + live verify

## Why

The `2026-05-29-smart-report-screen` closeout left exactly one initial-paint conversion open: the
`SmartReportRender` **first** f4 paint still reads the client-side MOCK_MODE fixture synchronously
(`getReportFixture(scope)`), while the **↻ re-render** control and the builder member-**Save** already
round-trip through `POST /api/widgets/smart-report/reports/render` and
`POST /api/widgets/smart-report/reports`. So the render endpoint has a real client caller, but the
surface a user first sees on the Report pill is NOT the endpoint response — the client↔server
round-trip is closed for re-render only. The synchronous first paint was deliberately kept at closeout
to avoid async-path churn across the shell/view test suites; this change is the tracked home for
finishing that conversion (it was the open follow-up ticket in the archived change).

It also discharges the two remaining manual closeout items that don't need code: the Chrome DevTools
MCP live-verify pass over the shipped Utility report path, and confirming the Interact→Report scope
carry end-to-end.

Phase 7 (live multi-doc Solar render — fanning each section's `question` through `search_groundx` +
grounded generation + WF-06b verification against real docs) stays **BLOCKED on WF-10** (real Solar
source assets) and is explicitly **NOT** in this plan. The same render surface serves it with no
surface rework once WF-10 lands; the MOCK_MODE fixtures remain the offline path.

## What Changes

1. **Route the SmartReportRender INITIAL f4 paint through the render endpoint.** Replace the
   synchronous `getReportFixture(scope)` first paint (and the `useScopeAdapter` re-scope body that also
   reads the fixture synchronously) with a `renderReport` fetch against
   `POST /api/widgets/smart-report/reports/render`. The widget gains an explicit first-paint lifecycle:
   `loading` (fetch in flight, before any report) → `ready` (endpoint response displayed) /
   `empty` (endpoint returns no sections / no report for the scope) / `error` (the call rejected, with a
   retry). The existing `idle | rerendering | error` re-render lifecycle and the `↻ re-render` control
   are preserved — re-render and first-paint now share one fetch path.
2. **Handle loading / empty / error on first paint** as user-visible states (a `data-testid`
   loading affordance, the existing `smart-report-empty`, and a retryable error banner), not a blank
   surface or a thrown render.
3. **Update the async-first-paint tests.** `SmartReportRender.test.tsx` synchronous assertions on the
   first paint (`renders the Utility fixture's four IC-brief sections`, the CiteChip test, the anon
   preview-lock test, `onEditSection`, the empty-state test, the `useScopeAdapter` re-resolve test) move
   to async (`findBy*` / `waitFor` after the mocked `renderReport` resolves). `OnboardingShell.test.tsx`
   and the `ReportRenderView` path already use `findByTestId("smart-report-render")` for the surface
   mount; their assertions on the rendered sections / preview lock / empty state are updated for the
   async first paint with `renderReport` mocked at the shell level. No new product behavior — the same
   sections, the same gate/preview policy, the same empty state, now sourced from the endpoint.
4. **Manual live-verify (Chrome DevTools MCP).** Drive the real app: Utility → Report pill → first
   render paints from the endpoint → click a CiteChip → the viewer jumps to the cited source/page with
   the region lit → `✎ edit §N` → the builder (f4a) opens with that section selected → pin-from-chat
   lands a section. Separately confirm Interact → Report carries the Interact scope onto the render.

### Out of scope

- **Phase 7 — live multi-doc Solar render — BLOCKED on WF-10 (real Solar source assets); NOT in this
  plan.** No `search_groundx` fan-out, no grounded generation, no WF-06b verification against real docs
  here. MOCK_MODE fixtures stay the offline render path; the render surface is unchanged for that future.
- No change to the render endpoint contract, the gate/preview policy, the builder, the pin flow, or
  the `show_smart_report_*` tools — this is the first-paint client wiring + its test churn + verify only.

## Conformance to core architectural decisions

- **Composable, not forked** — first paint and re-render converge on the SAME `renderReport` endpoint
  call; no parallel fixture-read code path survives in the widget. One source of truth for "what the
  report is" (the endpoint), MOCK_MODE-backed server-side.
- **Done = user-visible + round-trip** — the round-trip is closed for the surface the user actually
  sees first, and the live-verify pass proves it in the real app (not just the seam).
- **TDD** — the async-first-paint tests are rewritten failing-first against the new lifecycle before
  the widget body changes.

## Affected

- App: `components/viewer-widgets/SmartReportRender/SmartReportRender.tsx` (first-paint fetch +
  loading/empty/error lifecycle), `SmartReportRender.test.tsx`, `views/Onboarding/OnboardingShell.test.tsx`,
  and any shell-level `renderReport` mock setup. `api/smartReport.ts` is reused as-is (no contract change).
- Specs: `smart-report` (the render surface's first paint SHALL come from the endpoint + degrade through
  loading/empty/error).
- Docs/memory (closeout): mark the archived follow-up ticket + the two manual items done.
