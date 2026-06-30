# Tasks — onboarding-flow test hardening

Each task names its execution kind + adversarial-review gate (principle 3). For
e2e, the discipline is GREEN for the RIGHT reason — assert a live-stable
invariant against the CURRENT flow, never relax to triviality, never re-introduce
MOCK_MODE data. Live runs: `npx playwright test onboarding-utility --project=desktop`
(node v20; ensure nothing on `:3001` — stop stray Claude_Preview middleware).

## T1 — Confirm the current triggers at runtime (SEQUENTIAL, scouting) — DONE

- [x] Gate trigger: NOT `extract-topbar-save` (disabled until unsaved edits).
      The reliable anon trigger is the Extract **`extract-unlock-banner`**
      (`!isAuthed` → `onClick openGate("save")`), opened over F3.
- [x] BYO: `byo-pdf` → `/onboarding/signup` mounts the gate. The gate was
      REDESIGNED — it's a magic-link/SSO chat rail (`gate-rail-email` +
      `gate-rail-send-magic-link`), NOT the old `SignUpWidget` form.
- [x] F4: the field-row chip AND the provenance panel both read the SAME
      `valuesByFieldId` map (Extract.tsx 989 & 430) → **NOT a real bug**. The
      panel renders citations as "page N" pills (no `cite-chip-*` testid) →
      test-selector-only.
- **Gate:** ✅ all confirmed against live runs; F4 verdict = selector-only (no
  app change).

## T2 — F4 provenance: re-ground (test-only) (SEQUENTIAL) — DONE

- [x] No app change (no citation-source mismatch). Un-`fixme` "F4 citation peek":
      click a cited `field-row-*` → `field-provenance-panel` visible + a real
      citation rendered, asserted via the panel's "page N" source text +
      `No source citations` absent (the panel renders pills, not `cite-chip-*`).
- **Gate:** ✅ F4 green; asserts a real citation renders, not just the panel.

## T3 — F6 gate family: re-ground to the magic-link gate (SEQUENTIAL) — DONE

- [x] Un-`fixme`'d. Gate-open via `extract-unlock-banner` (the removed
      `advance-to-f6`). The gate is a magic-link/SSO chat rail, so:
      - "gate opens + dismiss (LC5)" → open via banner, dismiss via
        `gate-rail-dismiss` ("Keep exploring").
      - "register→F7 happy path" → re-grounded to **magic-link commit**: fill
        `gate-rail-email` (MUI TextField → `.locator("input")`) + send →
        `gate-rail-committed` ("WELCOME"). The `gate-rail-continue-integrate`→F7
        button is gate-frame-only (`onGateFrame = currentFrame === GATE_FRAME`);
        the F3 save-gate commit is the testable invariant, so the →F7 click was
        dropped (documented in-test).
      - "register-failure inline error" → no such affordance now (commitGate is a
        pure client-side flip; no `signup-error`). Converted to the real guard:
        **empty-email Send is a no-op, gate stays open**.
      - "ARCH-05B canvas-swap" → `onboarding-frame-f3` is the PERSISTENT wrapper
        hosting the swap, so assert the sample content (`extract-workbench`)
        hides on gate-open + restores on dismiss.
      - **ESC dismiss (LC5 path #2): REMOVED** per the owner decision (chat-rail
        gate, not a modal — dismiss via "Keep exploring"; LC5 updated). Recorded
        in the spec + `docs/agents/testing.md`.
- [x] "F6 gate card is axe-clean" — reach the gate via the banner, then axe.
- **Gate:** ✅ all green; each asserts a real falsifiable invariant; no MOCK_MODE.

## T4 — BYO surface: re-ground (SEQUENTIAL) — DONE

- [x] Un-`fixme`'d "BYO tile mounts the gate surface": `byo-pdf` → assert
      `gate-rail-preamble` + the magic-link rail (`gate-rail-email` +
      `gate-rail-send-magic-link`) + F1 picker hidden. (NOT the removed
      `signup-submit` form.)
- **Gate:** ✅ green; asserts the real magic-link sign-up surface mounts.

## T5 — Resolve the dormant F2 reading scanner (SEQUENTIAL — has a decision gate)

- [x] Investigate intent: DECIDED **WIRE**. The F2 reading scanner is a designed
      affordance (`project_interactions_animations_responsive` §"F2 scan
      animation"; `project_build_status` confirms it was live in the retired
      `UnderstandView`). It regressed out of the live flow in the
      UnderstandView→production-PdfViewer unification — not an intentional move to
      the zoom/thinking-stream. Removing it would discard real design intent.
- [x] Execute the decision (WIRE):
      - Added `scanning?: boolean` to the `doc-viewer` `ViewerStep`
        (`ChatStoreContext/types.ts`); `frameToStepStandalone("f2")` sets it true
        (the F2 step is the reading beat — ThinkingStream `onDone` auto-advances
        to F3). `<ScopedCanvas>` forwards `showScanAnimation: step.scanning ?? false`
        on the doc-viewer arm → the production PdfViewer renders the sweep.
      - Restored the reduced-motion e2e assertion in `reduced-motion.spec.ts`:
        F2 scanner mounts live AND its sweep beam computes `animation: none` under
        `page.emulateMedia({reducedMotion:"reduce"})`. **Passed against the real
        backend** (desktop project, 1.2s).
      - Kept + extended `PdfViewerWidget.test.tsx` (scan-line + beam testid +
        `data-scan-animation` root-attr wiring) and `ScopedCanvas.test.tsx`
        (scanning→on, absent→off, cite-jump→off).
      - Adversarial fix: `gotoDocViewer`'s same-document mutate path spread
        `...top` and would carry `scanning:true` forward onto a cite-jump; now
        explicitly clears it (`scanning: false`) + regression test in
        `ChatStoreContext.test.tsx` (a cite-jump is not a reading beat).
- **Gate:** ✅ no dormant `showScanAnimation` prop remains — it has a real
  production caller (ScopedCanvas←F2 step) proven live by the e2e overlay assert.
  Reduced-motion coverage restored + green. tsc clean; full app vitest 1526/1526;
  drift guards (widget-contract, no-hardcoded-styles, widget-access-matrix) green.

## T6 — Close-out: full suite + spec delta + adversarial (SEQUENTIAL)

- [ ] Full Playwright run: **0 failures, 0 remaining `fixme`** in
      onboarding-utility (skips = @desktop-only viewports + the Loan
      describe.skip only). Record counts.
- [ ] `specs/testing-suite/spec.md` delta: golden-path requirement covers the
      gate / BYO / provenance steps via current triggers; no `fixme` carve-out.
- [ ] App vitest green (if `Extract.tsx`/`PdfViewerWidget.tsx` changed);
      `openspec validate --strict`; `docs/agents/testing.md` updated (drop the
      "9 fixme" note; record the gate trigger = anon Save).
- **Gate:** adversarial review — falsify each "un-fixme'd + green" claim against
  the real run; confirm no test relaxed to triviality; confirm no MOCK_MODE data;
  confirm the scanner decision left no dead code; confirm the F4 fix (if any) is
  real. Then commit + archive + publish.
