# Tasks — report-empty-state

SEQUENTIAL tasks; **each followed by an adversarial-review gate** (falsify vs
plan + code, open the test file, run touched suites + `tsc`); a task is not done
until its gate passes. TDD: behavioral tasks start with a failing test. node 20
for all commands (`$HOME/.nvm/versions/node/v20.20.2/bin`).

- [x] **T1 — Failing tests first (RED).** (a) builder with nothing pinned →
  ZERO seeded rows; (b) render with no `reportOverlay.templateId` →
  `smart-report-empty`, no `renderReport` call; (c) OnboardingShell Report
  cold-start, no template → builder.
  - ↳ **Review:** red for the right reason (fixture still present), not a typo.

- [x] **T2 — Delete `reportFixtures.ts` + its test, AND fix its 4 other
  references (design §A).** (a) `SmartReportBuilder.tsx` + `SmartReportRender.tsx`
  (T3/T4 below own the replacements); (b) **`app/src/test/makeFakeApi.ts`** — its
  `renderReport` fake currently returns `getReportFixture(scope)`; change it to
  return the no-template/empty result (this is what flips the OnboardingShell
  utility-render tests to empty in T6b — `report-default-template` later makes it
  render the real seeded template); (c) **`reportScopeVocabulary.test.ts`** —
  remove the two deleted fixture paths from its scanned-file array.
  - ↳ **Review:** `grep -rl reportFixtures app/src` returns NOTHING after the
    change (no dangling import); `makeFakeApi` no longer imports the fixture and
    its `renderReport` returns empty; `reportScopeVocabulary.test.ts` no longer
    `readFileSync`s a deleted file; `tsc` clean.

- [x] **T2b — No-client-fixture GUARD test (durable root-cause fix).** A
  source-scan guard that FAILS if PRODUCTION client code reintroduces a
  scope→fixture-template MAP or a report-fixture import (the `reportFixtures` /
  `getReportFixture` / `reportTemplateIdForScope` shape) — implements the spec
  scenario "no client-side scope→fixture template routing in the codebase."
  **Scope it to NON-test source: EXEMPT `app/src/test/**` (the `makeFakeApi`
  render double is legitimate test infra, NOT a client fixture — per
  `project_prelaunch_correctness` "test-doubles are NOT mock mode") and
  `**/*.test.*`.** It guards a scope→template MAP / fixture import, NOT any
  `RenderedReport` literal (test doubles legitimately build those, and
  `report-default-template` extends `makeFakeApi` with a seeded-section one — the
  guard must NOT trip on either).
  - ↳ **Review:** goes RED on a temp reintroduction in a PRODUCTION module (prove
    it); GREEN on the cleaned tree INCLUDING the existing `makeFakeApi` empty
    `RenderedReport` literal; confirm `report-default-template`'s `makeFakeApi`
    extension would not trip it.

- [x] **T3 — Render reads `reportOverlay.templateId`:** replace
  `reportTemplateIdForScope(scope)` in `SmartReportRender` (runRender, re-render,
  editTemplate dispatch).
  - ↳ **Review:** no `renderReport` call when id null (T1b green); re-render +
    editTemplate read the same source; no leftover fixture call.

- [x] **T4 — Builder seeds `[]`:** `baseRowsForScope` → `[]`;
  `templateIdentityForScope` mints "Untitled report".
  - ↳ **Review:** T1a green; builder shows only overlay rows; no fixture ref.

- [x] **T5 — Template-aware Report routing:** `handleSubstepClick` "report" →
  render iff `reportOverlay.templateId` else builder (thread chatStore overlay +
  deps).
  - ↳ **Review:** T1c green; both branches covered; Bug-A progress gate still
    holds; no other OnboardingShell test regressed.

- [x] **T6 — Re-base render-machinery tests** (~12): inject
  `reportOverlay.templateId` + stub `renderReport` with a test-local
  `RenderedReport`; loading/error/retry/CiteChip coverage preserved.
  - ↳ **Review:** machinery genuinely exercised (not skipped); no shipped fixture
    reintroduced; SmartReportRender suite green.

- [x] **T6b — Re-base/move the OnboardingShell utility-render content tests
  (design §E).** AS-BUILT: a no-template Report click routes to the BUILDER
  (f4a), not the empty render — so "rebase to empty render" was infeasible.
  Actual: **DELETED** "Phase 0 …renders the surface", the anon export-lock
  preview, the edit-§N hand-off, and the Extract→Report scope-content tests (all
  needed rendered fixture content); **REBASED** the Loan pill-reachable test to
  land on the empty builder; the routing-to-builder behavior Phase 0 would have
  shown is covered by the two ADDED template-aware routing tests (T1/T5).
  `report-default-template` re-creates the deleted content tests against the real
  template (edit-§N in its T5, the others in its T6b).
  - ↳ **Review:** the FULL OnboardingShell + app suite is GREEN at change end
    (1674 app tests pass); every deleted test is listed for re-creation in
    `report-default-template` (left as breadcrumb comments in the test file, not
    silently dropped); Bug-A progress gate + pill-reachable + f4↔f4a tests still
    pass; both routing arms covered.

- [x] **T7 — Spec + close.** Apply the smart-report spec deltas (design §F);
  `validate --strict` green; app + middleware suites green; `npm run build` green.
  - ↳ **Review:** final hostile pass — durable spec matches code; no stale
    `MOCK_MODE`/fixture reference in the touched requirements; no dormant code.

Note: `report-default-template` DEPENDS on this change (its templateId-source +
deleted-fixture state). Execute this first.
