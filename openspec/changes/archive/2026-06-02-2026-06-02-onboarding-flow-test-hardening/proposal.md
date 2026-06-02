# Onboarding-flow test hardening — un-fixme the gate/BYO/provenance e2e + resolve the dormant F2 scanner

## Why

`2026-06-02-e2e-live-data-realignment` got the Playwright suite green but parked
two follow-ons rather than fake coverage:

1. **9 onboarding-utility tests are `test.fixme`** — F4 provenance peek, the six
   F6 gate-family tests + the F6 axe pass, and BYO. They targeted a SUPERSEDED
   flow (`advance-to-f6` was removed in the widget-unification / steady-canvas
   refactor). Scouting the current code shows the machinery still exists, only
   the triggers moved — so this is re-groundable now, not blocked:
   - **Gate-open** is no longer `advance-to-f6`. An anonymous user clicking
     **`extract-topbar-save`** on the Extract surface fires
     `openGate("save")` → the `gate-rail-preamble` / `SignUpWidget` gate. (Save
     is sign-in-gated; `SmartReportBuilder` mirrors it.)
   - **BYO** still navigates `byo-pdf` → `/onboarding/signup`, where
     OnboardingShell mounts `SignUpWidget` (`signup-submit`) in the canvas +
     `GateChatRail` (`gate-rail-preamble`) in the chat.
   - **F4** opens `field-provenance-panel` on field-click, but the panel reads
     `valuesByFieldId.get(id).citations` while the field-row chip reads
     `extracted.citations` — a **possible real citation-source mismatch** (a
     cited row whose panel shows none) to confirm and fix.

2. **The F2 "reading" scanner is dormant** — `PdfViewerWidget`'s
   `showScanAnimation` prop has NO production caller (only its unit test sets
   it). Either the F2 reading choreography intentionally moved to the
   OnboardingShell zoom + thinking-stream and the prop is dead code, or the
   scanner regressed out of the live flow. Resolve it (wire or remove) so there
   is no dormant plumbing, and restore its reduced-motion e2e coverage if wired.

This is the "finish it or ticket it" close-out of the two tickets — done the
right way (real flow, real assertions, no MOCK_MODE), not by relaxing tests.

## What changes

- **Re-ground + un-`fixme` the 9 onboarding-utility tests** against the current
  triggers above. Assert live-stable structural invariants (gate preamble +
  SignUpWidget mount, dismiss lifecycle, register happy/fail via stubbed auth
  APIs, ARCH-05B canvas-swap, ESC / keep-exploring dismiss, F6 axe-clean, BYO
  surface). No fixture strings; the sign-up tests keep stubbing the auth
  endpoints (not live-data-dependent).
- **F4 + the citation-source question:** confirm whether the provenance panel
  loses citations a field-row shows. If a real bug → fix the app so both views
  read one source; if only a test-selector issue → fix the assertion. Either way
  the re-grounded F4 asserts the peek surface + a real citation.
- **Resolve the dormant F2 scanner:** investigate intent; wire `showScanAnimation`
  into the live F2 reading state (and restore the reduced-motion e2e assertion)
  OR remove the unused prop + its branch. One outcome, no dormant prop left.
- Spec: `testing-suite` delta — the golden-path requirement now covers the gate /
  BYO / provenance steps via the current triggers (no remaining `fixme`).

## Impact

- Tests: `app/e2e/onboarding-utility.spec.ts` (un-fixme 9), `reduced-motion.spec.ts`
  (only if the scanner is wired).
- App (only if real bugs/decisions land): `Extract.tsx` (citation source),
  `PdfViewerWidget.tsx` + the F2 mount site (scanner wire/remove).
- Specs: `testing-suite` (MODIFIED). `ui-runtime`/`ui-views` only if scanner
  behavior changes.
- **Out of scope (still blocked, NOT in this plan):** BYO upload
  `filter.projectId` stamping — no app-owned ingest endpoint exists yet; its
  ticket stays open until BYO upload lands. **Also skipped per direction:** the
  Loan + Solar live-doc seeding ticket (onboarding-loan stays `describe.skip`).

## Open decision (flag before executing T-Scanner)

Is the F2 "GroundX is reading the doc" scanner a wanted affordance (→ wire it) or
superseded by the current zoom + thinking-stream choreography (→ remove the dead
prop)? Default lean: investigate the design intent first; if ambiguous, ask.
