# Tasks — steady-shell canvas mounts the production viewer widgets

> Source: e2e-experience-audit DL-5 (P1, code-confirmed). TDD: failing test first.
> Adversarial review gate after the change (Discipline §10): revert the fix → the new
> shell test must FAIL; confirm onboarding's canvas (the other ScopedCanvas consumer)
> still mounts; confirm no widget fork / no dormant plumbing; drift guards + build green.

- [ ] **Repro test (failing first).** Add a steady-shell integration test
      (`ScopedConversationShell` render) that dispatches a `highlightCitation` (or clicks
      a rendered `CiteChip`) and asserts `pdf-viewer-widget` mounts inside
      `scoped-shell-canvas-pane`. Confirm it FAILS against the current stub canvas.
- [ ] **Fix.** Replace the empty `<Box>` canvasPane in `ScopedConversationShell.tsx` with
      `<ScopedCanvas step={activeViewerStep} scope={scope} role={role} />` (match
      `OnboardingShell`'s wiring + the idle state). Read the active viewer step from the
      same ChatStore/orchestrator source OnboardingShell uses. Keep the
      `data-testid="scoped-shell-canvas-pane"` on the slot.
- [ ] **Re-verify live.** With the dev harness on REAL GroundX, drive `/workspaces`:
      a citation chip click + "Show source" + the Extract/Report pick-view pills each mount
      the corresponding production widget on real data; capture the measured mount
      (rendered `pdf-viewer-widget` / `extract-workbench` with non-zero dims).
- [ ] **Adversarial review (before done).** (a) Revert the canvasPane change → confirm the
      new shell test FAILS (proves it's a real regression test). (b) Re-drive the
      onboarding canvas (the other ScopedCanvas consumer) → confirm F2/F3/F5 still mount.
      (c) Confirm no viewer-widget was imported directly (the ESLint registry ban holds),
      no fork, no dormant plumbing. (d) `npm test` (app), drift guards, `npm run build`
      green.
- [ ] **Close the audit linkage.** Flip e2e-audit DL-5 to `triaged → fixed → reverified`
      with the measured live mount; note that 2.4/2.10/2.12 are now live-verifiable.
