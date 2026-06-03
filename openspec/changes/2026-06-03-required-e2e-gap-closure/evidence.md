# Evidence - Required E2E gap closure

## 2026-06-03 low-refactor closeout pass

### T0 blocker map

- Agent/scaffold references re-read: `AGENTS.md`,
  `docs/agents/discipline.md`, `docs/agents/testing.md`,
  `docs/agents/template-scope-results.md`, and
  `docs/agents/real-data-rewire-gap.md`.
- GitHub issues inspected: `#4`, `#5`, `#6`, `#11`, `#12`.
- Current source/tests inspected before editing:
  - `app/src/components/viewer-widgets/Integrate/Integrate.tsx`
  - `app/src/views/Onboarding/OnboardingShell.test.tsx`
  - `app/src/views/Scoped/ScopedConversationShell.tsx`
  - `app/src/views/Scoped/ScopedConversationShell.test.tsx`
  - `app/src/views/Steady/SteadyShell/SteadyShell.test.tsx`
  - `middleware/src/services/reportRenderer.ts`
- Findings:
  - `#4` was still real in the post-gate browser path: direct F7 mounted
    Integrate, but gate commit + Continue left the canvas on the gate value
    prop.
  - `#6` was still real in a narrower form: Workspace and Project had distinct
    scopes, but same-scope route effects could create duplicate sessions.
  - `#5` remains a broad backlog steady-mode wireframe audit.
  - `#11` remains blocked on a real persisted SmartReport template/render path.

### T2 F7 Integrate

- Red test:
  - `npm --workspace app exec vitest run src/views/Onboarding/OnboardingShell.test.tsx --testNamePattern "post-gate Continue to Integrate"`
  - Failed before the fix because `data-testid="integrate"` never appeared
    after the gate committed and Continue was clicked.
- Fix:
  - `advanceFrame("f7")` now clears the completed sign-up overlay and legacy
    committed gate state, preserving the existing production `Integrate`
    ScopedViewerWidget path.
- Focused tests:
  - `npm --workspace app exec vitest run src/views/Onboarding/OnboardingShell.test.tsx --testNamePattern "post-gate Continue to Integrate"` passed.
  - `npm --workspace app exec vitest run src/contexts/OnboardingSessionContext/OnboardingSessionContext.test.tsx src/views/Onboarding/OnboardingShell.saveGate.test.tsx src/views/Onboarding/SchemaView.test.tsx src/components/chat-widgets/GateChatRail/GateChatRail.test.tsx src/components/viewer-widgets/Integrate/Integrate.test.tsx src/components/layout/ScopedCanvas/ScopedCanvas.test.tsx` passed: 6 files, 89 tests.
- Chrome DevTools MCP replay:
  - Context: fresh isolated context `e2e-gap-closure-after-fix`.
  - Route: `http://localhost:5173/onboarding/28454/utility?debug=true`.
  - Interaction: Extract -> locked sign-in banner -> magic-link email ->
    Continue to Integrate.
  - DOM proof:
    - `hasIntegrate: true`
    - `canvasKind: "integrate"`
    - `hasGateValueProp: false`
    - `hasGateCommitted: false`
    - visible text includes `Ship the same answer into your stack.`
  - Console: no warnings/errors.
  - Network: app-owned flow requests returned 2xx in the replay.

### T3 scoped sessions

- Red test:
  - `npm --workspace app exec vitest run src/contexts/ChatStoreContext/ChatStoreContext.test.tsx --testNamePattern "resolveSessionForScope|effect tick"`
  - Failed before the fix because two same-tick resolves of
    `scope:bucket:28454` returned two different session ids.
- Fix:
  - `resolveSessionForScope` now records the just-minted scope session id in a
    provider-local ref so same-tick duplicate resolves return the pending id
    before React commits the first state update.
- Focused tests:
  - `npm --workspace app exec vitest run src/contexts/ChatStoreContext/ChatStoreContext.test.tsx --testNamePattern "resolveSessionForScope|effect tick"` passed: 32 tests.
  - `npm --workspace app exec vitest run src/views/Scoped/ScopedConversationShell.test.tsx src/views/Steady/SteadyShell/SteadyShell.test.tsx src/views/Steady/SteadyShell/SessionSwitcher.test.tsx` passed: 3 files, 16 tests.
- Chrome DevTools MCP replay:
  - Context: fresh isolated context `e2e-gap-closure-scoped-after-fix`.
  - Route: `http://localhost:5173/workspaces?debug=true`, then Projects nav.
  - DOM proof:
    - `/workspaces` rendered `data-experience="workspace"` and the Workspace
      chat intro.
    - `/projects` rendered `data-experience="project"` and the Project chat
      intro.
  - Persisted session proof from localStorage:
    - one `scope:bucket:28454` Workspace session.
    - one `scope:bucket:28454|{"project":"utility"}` Project session.
  - Console: no warnings/errors.
  - Network: app-owned route/session requests returned 2xx in the replay.

### Deferred blockers

- `#5` remains open/backlog because it asks for a steady-mode wireframe fidelity
  audit against `groundx-wireframes`, not just route/session correctness.
- `#11` remains open/backlog because Utility rendered-section coverage requires
  a real persisted SmartReport template/render path; counting builder-local rows
  or endpoint-only fixtures would violate the Template + Scope + Results
  guidance.

### Validation and cleanup

- `npm test` passed on rerun:
  - app: 191 files, 1555 tests.
  - middleware: 44 files, 730 tests.
  - Note: the first root run had a one-off middleware timeout in
    `src/apiRouteContract.test.ts`; the exact file and full middleware workspace
    passed immediately afterward, and the full root `npm test` gate then passed.
- `npm run scan:secrets` passed.
- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
  passed: 19 items, 0 failed.
- `git diff --check` passed.
- GitHub cleanup:
  - `#4` closed with F7 post-gate Integrate evidence.
  - `#6` closed with scoped-session duplicate fix evidence.
  - `#5` left open/backlog with a fresh narrowing comment.
  - `#11` left open/backlog with a fresh no-template/render-path comment.
  - Open non-backlog issue query returned no issues.
