# Tasks — e2e live-data realignment

Each task names its execution kind + its adversarial-review gate (principle 3).
For e2e, "TDD" is inverted: the failing spec is the existing RED. The discipline
is to make it GREEN **for the right reason** — assert a live-stable invariant,
NOT delete/weaken the assertion to triviality. Every gate explicitly checks the
test still proves something. A task does not advance until its gate passes
against the real run.

## T0 — Reproduce + baseline (SEQUENTIAL)

- [x] Baseline captured: **39 fail / 25 pass / 50 skip**. First run aborted on a
      stray Claude_Preview middleware squatting port 3001 (`reuseExistingServer:
      false`); stopped it via `preview_stop`. Node v20 on PATH.
- **Gate:** ✅ baseline + boot/port preconditions recorded.

## T1 — reduced-motion (SEQUENTIAL) — root cause was the TEST, not the app

- [x] Root-caused at runtime with a throwaway diag spec: under
      `test.use({ reducedMotion: "reduce" })`, `window.matchMedia("(prefers-
      reduced-motion: reduce)").matches` reads **false** even on a static route —
      the context option doesn't reach matchMedia in this `vite preview` setup.
      An explicit `page.emulateMedia({ reducedMotion: "reduce" })` reads **true**.
      So the AppShell wiring is CORRECT; only the test's emulation was wrong.
- [x] Fixed test-side: `beforeEach` calls `page.emulateMedia(...)` (still the
      REAL media-query path, not a mock). The attr test is now viewport-agnostic
      (waits on the appshell root, not the compact-unmounted F2 frame).
      Page-transition test scoped desktop-only (canvas-surface concern). The
      obsolete "F2 scan-line" test was REMOVED — its `understand-scan-line`
      element was deleted in the UnderstandView→PdfViewer unification and the
      replacement scanner (`showScanAnimation`) has no production caller (dormant)
      → spawned a "Wire or remove dormant F2 reading scanner" ticket.
- **Gate:** ✅ reduced-motion = 4 passed / 2 skipped / 0 failed; assertion still
  asserts `"true"`; root cause in the spec comment.

## T2 — scaffold-smoke authenticated → real /home redirect (SEQUENTIAL)

- [x] `/home` is an auth-aware redirect (ARCH-21). Empirically, an authed user's
      app bootstraps a chat session, so `/home` deep-links to the steady
      `/c/<id>` conversation (verified live). Replaced BOTH stale tests (the
      deleted scaffold "Studio Workspace" page + "Welcome to GroundX Studio"
      wizard) with ONE test: authed `/home` → redirects off `/home` into `/c/`,
      the steady AppShell mounts (`appshell-root`), no horizontal overflow, every
      viewport. Removed now-unused helpers.
- **Gate:** ✅ scaffold-smoke = 12 passed / 0 failed; asserts a real rendered
  destination; `mockAuthenticatedSession` still drives the authed arm.

## T3 — onboarding-utility re-grounded to live data (SEQUENTIAL)

- [x] Picker: assert the SEEDED set (`sample-utility` + Extract badge), dropped
      the hardcoded `sample-loan`/`sample-solar`.
- [x] Dropped MOCK_MODE fixture strings (`April 2026 Statement`, `utility-bill-
      2026-04`, `Demand charges came in highest`). F2→F3 now AUTO-advances after
      the 6-note thinking stream (the legacy `advance-to-f3` pill is preempted),
      so the spec waits for the F3 frame (25s) instead of clicking it. F3 asserts
      ≥1 `field-row-*` + ≥1 `cite-chip-*` (live schema, not specific fields). F5
      asserts the InteractView mounts (the seed prompt is a live suggestion, not
      auto-sent).
- [x] **2 REAL app a11y bugs found + FIXED** (serious `aria-prohibited-attr`):
      (1) IngestView connector logos — `<div title aria-label>` (role generic) →
      added `role="img"`; (2) `PdfViewerWidget` root `<div aria-label="Document
      viewer">` → added `role="group"`. These greened F1 + F5 axe.
- [x] **9 tests `test.fixme` + ticketed** (NOT deleted): F4 provenance peek, the
      6 F6-family gate tests + F6 axe, and BYO — all target a SUPERSEDED flow
      (`advance-to-f6` removed; BYO `signup-submit` + provenance `cite-chip`
      changed in the widget-unification/steady refactor). Re-grounding needs a
      flow-aware rewrite → spawned "Re-ground onboarding gate/BYO/provenance e2e".
- **Gate:** ✅ onboarding-utility = 8 passed / 9 fixme / 0 failed; each green
  assertion is falsifiable + structural; no mock data; a11y fixes unit-covered
  green (63) + full app suite green (1517).

## T4 — onboarding-loan: honest skip + seeding ticket (SEQUENTIAL)

- [x] `test.describe.skip` with a reason: Loan has no seeded live doc → the
      registry omits it → `sample-loan` never renders. No fake data.
- [x] Spawned "Seed Loan + Solar live sample docs" ticket (seed docs + project
      filters + `SAMPLE_PROJECT_ID_BY_SCENARIO`, then un-skip).
- **Gate:** ✅ skipped (not failing, not deleted); reason names the ticket.

## T5 — full suite green + spec delta + docs + adversarial close (SEQUENTIAL)

- [x] Full Playwright run: **39 passed / 0 failed / 69 skipped** (baseline was
      39 failed / 25 passed / 50 skipped). Skips = @desktop-only tablet/mobile +
      9 fixme + the Loan describe.skip + compact-canvas reduced-motion.
- [x] `specs/testing-suite/spec.md` delta applied.
- [x] `docs/agents/testing.md` note added (live-stable invariants, the
      `emulateMedia` gotcha, F2 auto-advance, /home redirect, port preconditions).
- [x] `openspec validate --strict` ✅; app vitest green (1517); touched-component
      units green (63).
- **Gate:** adversarial review — falsify each "turned green" claim against the
  real run; confirm no assertion gutted; confirm skips are only the documented
  Loan + fixme + viewport ones; confirm no mock data path added; confirm the 2
  a11y fixes are real (role permits aria-label) not rule-disabling.
