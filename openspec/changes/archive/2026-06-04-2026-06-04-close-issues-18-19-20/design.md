# Design Notes

## Issue #18

The source shows live adapter callers:

- `CanvasOrchestratorContext` exposes `registerAdapter`.
- `OnboardingWizard`, `DialogTitle`, and `SignUpWidget` register adapters.

The fix is to make durable spec text match the shipped invariant: dispatch is
the canonical entry point, and adapters are a retained fallback for named
current intent kinds. This change does not add new adapters or remove callers.

## Issue #19

The canonical product project filter is `projectId`.

Implementation surfaces to reconcile:

- `OnboardingShell` report scope.
- `app/src/widgets/reportFixtures.ts` fixture routing.
- `app/src/test/makeFakeApi.ts` and related fake report fixtures.
- `SmartReportRender` and `SmartReportBuilder` examples/tests.
- `middleware/src/services/reportRenderer.ts` doc index and scope resolver.
- Middleware app tests that post Smart Report render scopes.

The migration should use TDD:

1. Add failing tests/guards proving product Smart Report paths reject or avoid
   `filter.project`.
2. Update app and middleware routing to `filter.projectId`.
3. Keep #11 separate: this does not create report templates or rendered
   sections where none exist.

## Issue #20

The smallest compliant model is:

- App renders a consent banner on cold load when no consent record exists.
- `main.tsx` never initializes frontend analytics directly.
- A consent provider owns durable local consent state and initializes PostHog
  and GA only after accept.
- `track`, `identify`, `gaTrack`, and `gaSetDefaults` remain safe no-ops before
  initialization.
- CSP may deploy-allow configured analytics hosts, but the browser must not
  load their scripts or send analytics requests until the consent source says
  accepted.

This avoids a broad dynamic-CSP session rewrite while satisfying the
browser-visible privacy obligation.
