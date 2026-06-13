# Report: remove the fake fixture, default to an empty builder

## Why

The Report surface is driven by a client-side **fake** fixture
(`app/src/widgets/reportFixtures.ts`, `UTILITY_REPORT`): the builder seeds
fabricated IC-brief sections (`$18,742.16` — the real bill totals $7,613.20),
and the render routes to a fake template id (`rt-utility-ic-brief`) that does
not exist in the backend, so the live `renderReport` call throws ("Couldn't
render the report — try again"). This violates the locked
`project_prelaunch_correctness` decision ("do NOT seed a fake sample template;
empty is the correct new-customer start").

This change removes the fake fixture and makes the Report surface behave
honestly: no fabricated data, no render error — an empty builder when there is
no template, and a graceful empty render state otherwise.

## What changes

1. Delete `reportFixtures.ts` (`UTILITY_REPORT` / `SOLAR_STUB` /
   `getReportFixture` / `reportTemplateIdForScope`).
2. `SmartReportRender` resolves `templateId` from the real
   `activeSession.reportOverlay.templateId` (existing field) — `null` → the
   existing empty state, no network, no error.
3. `SmartReportBuilder` seeds `[]` — rows = the session's pinned/draft sections
   only; empty when nothing is pinned.
4. Report sub-pill routing is template-aware: a present `reportOverlay.templateId`
   → render (f4); absent → empty builder (f4a).
5. A **guard test** that fails if a client-side report fixture / scope→template
   map is ever reintroduced (the durable root-cause fix — the original fake
   shipped because "no seed" was unguarded).

Re-bases ~31 fixture-coupled tests across SmartReportRender / SmartReportBuilder
/ OnboardingShell / reportFixtures.

## Scope

**In:** the 5 items above + the test re-basing + the spec deltas (remove the
fixture requirement; extend the no-template + live-path requirements).

**Out:**
- A real default onboarding template — that is the SEPARATE
  `report-default-template` change (depends on THIS one). Until it lands,
  onboarding Report = empty builder (honest, no fake).
- Pin-to-report UX — the separate `report-pin-affordance` change.
- Member render end-to-end: today the member render used the FIXTURE, not a
  saved template (`reportOverlay.templateId` is set only by the pin mutation,
  not Save). After this change, member/steady render renders from
  `reportOverlay.templateId` when present, else the empty state — an honest
  behavior change (the fixture masked a never-wired member path), not a
  regression of a working path. Save→templateId read-back stays deferred.
- The remaining `MOCK_MODE` language elsewhere in the smart-report spec — this
  change cleans only the requirements it touches; a full purge is a follow-up.

## Conformance to core architectural decisions

- **Composable (1).** The render reads ONE template-id source
  (`reportOverlay.templateId`), not a scope→fixture map; Report routing is one
  template-aware rule.
- **No fake data / no shortcuts.** Removes a fabricated fixture; adds a GUARD so
  it can't return (principle enforced by a test, not a doc).
- **Done = round-trip (5).** Each persisted byte read has a real read site; no
  dormant code.
- **One source of truth (6).** No new wire types; the render section stays the
  shared `RenderedSection`.
- **TDD (2) / adversarial review per task (3):** tasks.md leads with failing
  tests; each task carries an adversarial-review gate.
