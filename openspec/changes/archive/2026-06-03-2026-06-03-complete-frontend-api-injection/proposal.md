# Complete frontend API injection (#10)

## Why

Issue #10 is still open because the archived session/chat and auth slices only
migrated two domains. The remaining frontend runtime still has direct
app-facing `@/api` imports and per-file network / telemetry mocks across
resource providers, scenario/canvas, extract, smart-report, and Sentry-driven
error paths.

This change is the single OpenSpec planning surface for completing #10, but the
work MUST execute as serialized domain slices. Each slice adds only the injected
surface it immediately consumes, migrates that domain's runtime and tests,
passes focused validation, then receives an adversarial review before the next
slice starts. If execution pauses after any slice, #10 remains open and the next
slice resumes from this plan rather than being treated as done.

## What Changes

- Inventory current direct imports and mocks before implementation so final
  guard allowlists are based on real files, not assumptions. The inventory lives
  inside this OpenSpec change, not in a separate tracker.
- Expand the injected `Api` surface domain-by-domain so every remaining
  frontend runtime network dependency has an explicit grouped home: resources,
  scenarios, extract, smart-report/report templates, viewer/PDF support, canvas
  intent, reset/sign-up auth helpers, and telemetry/error capture.
- Migrate remaining production consumers from direct `@/api` / standalone module
  imports to `useApi()` groups. Type-only imports may remain only where the
  imported symbol is a pure shape; value imports for network behavior move to the
  injected client.
- Retarget tests from per-file `vi.mock("@/api...")` and `vi.mock("@/lib/sentry")`
  to `makeFakeApi(...)` / render-harness overrides, except low-level API or
  Sentry wrapper tests that deliberately mock transport/wrapper behavior to test
  those implementation modules directly.
- Route rendered runtime telemetry through `Api.telemetry.captureException`.
  Production composition still forwards to the existing Sentry wrapper; app
  components, contexts, hooks, and widgets stop importing the wrapper directly.
- Tighten `frontend-api-injection-guard.test.ts` from scoped session/chat/auth
  enforcement to a repo-wide migrated-consumer guard. The final guard forbids
  direct network imports and per-file API/Sentry mocks outside explicit
  implementation/test allowlists.
- Remove or quarantine the legacy `@/api` aggregate direct-import path once the
  real injected client no longer needs it as an app-facing import path.
- Comment and close GitHub issue #10 only after the final guard, full suites,
  build, OpenSpec validation, mandatory browser smoke, and GroundX Studio
  Harness sync/commit handling pass.

## Conformance to core architectural decisions

- **Composable, not forked:** each remaining domain is added as grouped behavior
  on the existing injected `Api` client. The plan does not introduce parallel
  service locators, forked providers, or a second fake surface.
- **Done-able/user-visible:** each implementation slice includes a failing test
  first, focused runtime/provider/widget assertions, and an adversarial review
  before the next slice. Final closeout requires browser smoke for the migrated
  runtime surfaces, not seam-only validation.
- **One source of truth:** OpenSpec remains the in-flight execution surface and
  GitHub #10 remains the live issue until all slices, guard cleanup, browser
  smoke, and archive finish. Deferred/non-#10 work stays in GitHub backlog
  issues, not inline TODOs or side trackers.

## Out Of Scope

- Rewriting API entity modules' internal transport tests into integration tests.
- Moving every API wire type out of `app/src/api/entities`; type-only imports are
  allowed until a separate type-surface cleanup is opened.
- Non-network UI library mocks such as animation, router, or browser APIs unless
  they block the API/Sentry mock cleanup.
- Fixing deploy environment configuration such as missing EKS/AWS variables.
- Reopening the already archived session/chat or auth slices except where their
  files still participate in telemetry cleanup.

## Impact

- Runtime behavior should stay unchanged; this is dependency routing and test
  harness cleanup.
- Tests should get less brittle because each rendered tree receives one fake
  client instead of duplicating module mocks.
- #10 can close when the repo proves no migrated runtime consumer relies on the
  old direct-import path.
