# Complete frontend API injection (#10)

## Why

Issue #10 is still open because the archived session/chat and auth slices only
migrated two domains. The remaining frontend runtime still has direct `@/api`
imports and per-file network / telemetry mocks across resource providers,
scenario/canvas, extract, smart-report, and Sentry-driven error paths. This
change finishes #10 completely: one injected frontend client, one harness fake,
repo-wide drift protection for migrated runtime consumers, then close #10.

## What Changes

- Expand the injected `Api` surface so every remaining frontend runtime network
  dependency has an explicit grouped home: resources, scenarios, extract,
  smart-report/report templates, viewer/PDF support, canvas intent, reset/sign-up
  auth helpers, and telemetry/error capture.
- Migrate remaining production consumers from direct `@/api` / standalone module
  imports to `useApi()` groups. Type-only imports may remain only where the
  imported symbol is a pure shape; value imports for network behavior move to the
  injected client.
- Retarget tests from per-file `vi.mock("@/api...")` and `vi.mock("@/lib/sentry")`
  to `makeFakeApi(...)` / render-harness overrides, except low-level API module
  unit tests that deliberately mock transport (`axios`, `csrfFetch`) to test the
  API implementation itself.
- Tighten `frontend-api-injection-guard.test.ts` from scoped session/chat/auth
  enforcement to a repo-wide migrated-consumer guard. The final guard forbids
  direct network imports and per-file API/Sentry mocks outside explicit
  implementation/test allowlists.
- Remove or quarantine the legacy `@/api` aggregate direct-import path once no
  runtime consumer needs it.
- Comment and close GitHub issue #10 only after the final guard, full suites,
  build, OpenSpec validation, and any required browser smoke pass.

## Out Of Scope

- Rewriting API entity modules' internal transport tests into integration tests.
- Moving every API wire type out of `app/src/api/entities`; type-only imports are
  allowed until a separate type-surface cleanup is opened.
- Non-network UI library mocks such as animation, router, or browser APIs unless
  they block the API/Sentry mock cleanup.
- Fixing deploy environment configuration such as missing EKS/AWS variables.

## Impact

- Runtime behavior should stay unchanged; this is dependency routing and test
  harness cleanup.
- Tests should get less brittle because each rendered tree receives one fake
  client instead of duplicating module mocks.
- #10 can close when the repo proves no migrated runtime consumer relies on the
  old direct-import path.
