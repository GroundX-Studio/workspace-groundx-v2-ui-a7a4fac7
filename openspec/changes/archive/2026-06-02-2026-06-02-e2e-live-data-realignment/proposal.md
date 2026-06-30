# Realign the Playwright e2e suite with live-data reality

## Why

Running the full Playwright suite against live GroundX surfaced **39 failures /
25 pass / 50 skipped**. None are caused by recently shipped code — they are
**stale assertions** that three already-shipped changes left behind because each
shipped with the vitest suites green but the e2e suite never re-run:

1. **`2026-06-01-retire-mock-mode`** removed MOCK_MODE and pointed e2e at real
   GroundX, but the onboarding golden-journey specs still assert **deterministic
   MOCK_MODE fixture strings** that cannot reproduce against live data + a live
   LLM — e.g. the doc title `April 2026 Statement`, the canned chat answers
   `Demand charges came in highest` / `largest charge category`, the source name
   `utility-bill-2026-04`. They also assert **three seeded samples**
   (`sample-loan`, `sample-solar`) when only the Utility doc (`c3bfff49`, bucket
   28454) is seeded — and the decoupled `ScenarioRegistry` correctly omits a
   scenario with no joined doc.
2. **flatten-document-filter / scenario-registry decoupling** is why the picker
   now surfaces exactly the seeded scenarios (one) rather than a hardcoded three.
3. **`2026-06-01-steady-canvas-mount` (DL-5)** — and earlier **ARCH-21** — turned
   `/home` into an auth-aware **redirect** (`/c/<sessionId>` or `/onboarding`).
   The `scaffold-smoke` "authenticated scaffold shell" test still asserts the
   deleted scaffold marketing page (`heading "Home"`, `"Studio Workspace"`).

A fourth bucket — the **reduced-motion sweep** (8 failures) — is NOT obviously
stale: the AppShell mounts (`data-app-shell-reduced-motion="false"`) but reads
`false` under Playwright's `reducedMotion: "reduce"` emulation when the contract
expects `"true"`. This may be a real wiring/emulation gap and is investigated as
its own task before deciding app-fix vs test-fix.

This is a delivery-discipline correction: "done = green user-visible test." The
e2e suite is the user-visible gate and it has drifted. We realign assertions to
**live-stable structural invariants** (testids, frame mounts, row/chip presence,
state-machine transitions) and the **actually-seeded** scenario set, WITHOUT
gutting them to triviality and WITHOUT re-introducing mock data.

## What changes

- **Onboarding golden journeys re-grounded to live data.** Replace exact-value /
  exact-answer string assertions with structural invariants that hold against
  real GroundX + a real LLM (frame testids visible, schema `field-row-*` present,
  `cite-chip-*` present, `advance-to-*` transitions, gate open/dismiss). Assert
  the **seeded** sample set (Utility present), not a hardcoded three.
- **Loan journey gated on seeding.** The Loan scenario has no live doc, so its
  golden journey is `describe.skip`ped with a reason pointing at a seeding ticket
  (spawn_task) — honest skip, not a deleted test, not faked data.
- **`scaffold-smoke` authenticated test rewritten** to assert the real `/home`
  redirect contract (authed → steady `/c/...` or `/onboarding`), not the deleted
  scaffold marketing page.
- **reduced-motion** root-caused at runtime, then fixed on the correct side
  (AppShell `useMediaQuery` wiring vs the test's emulation setup).
- **`testing-suite` spec** updated: the e2e golden-path requirement is restated
  for the post-mock-mode, live-data, seeded-scenario reality.

## Impact

- Specs: `testing-suite` (MODIFIED requirement).
- Code (tests): `app/e2e/onboarding-utility.spec.ts`, `onboarding-loan.spec.ts`,
  `scaffold-smoke.spec.ts`, `reduced-motion.spec.ts`.
- Code (app — 2 real `aria-prohibited-attr` a11y bugs found + fixed): the
  IngestView connector logos and the `PdfViewerWidget` root carried `aria-label`
  on a role=generic `<div>`; added `role="img"` / `role="group"` respectively so
  the label is permitted. (Reduced-motion was NOT an app bug — the Playwright
  `test.use({reducedMotion})` emulation just didn't reach `matchMedia`; fixed
  test-side with `page.emulateMedia`.)
- 9 onboarding tests (`test.fixme`) target a superseded gate/BYO/provenance flow
  and are ticketed for a flow-aware re-ground (out of scope here).
- Out of scope (tracked separately): seeding Loan + Solar sample docs into the
  live bucket so the 3-sample picker + their journeys run for real.
