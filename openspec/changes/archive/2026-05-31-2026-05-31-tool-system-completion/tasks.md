# Tasks — tool-system completion (role gating + deferred view/primitive tools)

> Finish `widget-role-access` Phase 3 (the role axis end-to-end + the missing parity guard) and absorb
> `wf04` §1/§2/§4 (the deferred `submit_signup` / `wizard_*` / `close_dialog` tools). TDD: failing test
> first, every change. UNBLOCK tasks land before the work that depends on them. Adversarial review gate
> after every task (against this proposal AND the real code). WIP cap = 3.
>
> **Coordination:** `widget-role-access` owns the durable role-aware catalog requirements; this change
> executes its Phase 3 tasks. Do NOT re-MODIFY those requirements here. Sequence so widget-role-access
> archives with Phase 3 complete.

## INPUT NEEDED — decisions that gate the work below

- [x] **INPUT NEEDED → ANSWERED 2026-05-31:** orphan `toolRegistry` handling. **DECISION: (b)** — treat
      the middleware `SERVER_TOOL_CATALOG` as the SOLE role-bearing surface; do the real server-side role
      filter and SKIP migrating the app-side `availableIn` type. Leave the orphan as-is (its delete stays
      RCC's coordinated call — do NOT delete it here, do NOT sink effort migrating dead code's type).
- [x] **INPUT NEEDED → ANSWERED 2026-05-31:** parity-guard shape. **DECISION:** a minimal cross-package
      test (one package imports the other's catalog) asserting tool NAME + role agreement — not a committed
      manifest. Keep it file-serial-safe.
- [x] **INPUT NEEDED → ANSWERED 2026-05-31:** glob-home shape. **DECISION:** the BROAD pattern —
      `views/**/*.tools.ts` + `components/primitives/**/*.tools.ts` — applied identically to BOTH the
      registry glob and `check-tool-quality`'s `collectToolFiles`, so OnboardingWizard + DialogTitle tools
      are discoverable in place.

## UNBLOCK 1 · Verb allowlist (gates the three new tools)
**Execution: → SEQUENTIAL/TDD (one-file, trivial).**

- [x] **Failing test:** assert `submit_signup`, `wizard_next`, `close_dialog` pass `check-tool-quality`'s
      verb-prefix rule (or, until the tools exist, a unit assertion that `ALLOWED_VERBS` includes
      `submit_`/`wizard_`/`close_`). — DONE: added Test 9 in `check-tool-quality.test.mjs` (fixtures per verb, watched it fail, now green).
- [x] Add `submit_`, `wizard_`, `close_` to `ALLOWED_VERBS` in `app/scripts/check-tool-quality.mjs`. — DONE.

## UNBLOCK 2 · Glob-home for view/primitive tools (gates OnboardingWizard + DialogTitle tools)
**Execution: → SEQUENTIAL/TDD.** Gated on the glob-home INPUT NEEDED decision.

- [x] **Failing test:** the registry assembles a tool from a view-hosted `*.tools.ts`
      (`OnboardingWizard`) and a primitive-hosted one (`DialogTitle`); `check-tool-quality`'s
      `collectToolFiles` yields those files. (Use a fixture/synthetic module so the test is independent
      of the real tool files that land later.) — DONE: `registry.test.ts` asserts `TOOL_GLOB_PATTERNS`
      includes the view + primitive homes; `check-tool-quality.test.mjs` Test 10 + `check-tool-references.test.mjs`
      Test 4 drop fixtures into both new homes (view + primitive) and assert each walker discovers them. Watched red, now green.
- [x] Extend `import.meta.glob` in `app/src/tools/registry.ts` to the chosen view/primitive home(s).
      — DONE: BROAD shape `views/**/*.tools.ts` + `components/primitives/**/*.tools.ts`, exported as
      `TOOL_GLOB_PATTERNS` (single source of truth for the discovery shape).
- [x] Extend `collectToolFiles` in `app/scripts/check-tool-quality.mjs` to the SAME shape (assert in a
      test that both walkers recognize the same home, so they cannot drift). — DONE: identical recursive
      `TOOL_HOMES` walker restated in `check-tool-quality.mjs` AND `check-tool-references.mjs` (the THIRD
      walker — its `collectKnownToolNames` would otherwise reject `tool="wizard_next"`/`"close_dialog"`
      references); all three walkers use the same home shape.

## App role axis (Phase 3 — app side)
**Execution: → SEQUENTIAL/TDD.** Gated on the orphan/toolRegistry INPUT NEEDED decision. If (b) is
chosen, this section reduces to the type rename needed for the parity guard.

- [x] **Failing test:** `registry.test.ts` — `forStep(stepKind, role)` filters by a `WidgetRole`
      (`"anonymous"`/`"member"`); a tool with no/empty `availableIn` is exposed to ALL roles; a
      `["member"]` tool is hidden from `"anonymous"`. Update the existing `availableIn: ["onboarding"]`
      fixture to a role. — N/A under DECISION (b): the app-side `toolRegistry`/`WidgetTool.availableIn`
      orphan is NOT migrated, so the app `forStep` keeps its `ToolMode` filter (the existing
      `forStep(stepKind, mode)` test stays). The BEHAVIORAL role filter lives server-side (next section)
      with a failing-first test there. No app-side role-filter test is added — the orphan is left as-is.
- [x] Change `WidgetTool.availableIn` from `ToolMode[]` to `WidgetRole[]` (`app/src/tools/types.ts`)…
      — SKIPPED per DECISION (b): leave the orphan's `ToolMode[]` type untouched (do not sink effort
      migrating dead code's type). The server `SERVER_TOOL_CATALOG` is the SOLE role-bearing surface.
- [x] Update `_template/Template.tools.ts` `edit_template` from `["steady"]` → `["member"]`…
      — SKIPPED per DECISION (b): the `_template` stub is dead/orphan app-side scaffold and not migrated
      (it keeps `availableIn: ["steady"]`, a `ToolMode`). `edit_template` is not a shipped tool on either
      catalog, so it never reaches the role filter or the parity guard.

## Server role axis + filter (Phase 3 — server side; the behavioral gate)
**Execution: → SEQUENTIAL/TDD.** This is the surface the LLM actually sees — the no-op-without-this part.

- [x] **Failing test:** `toolCatalog.test.ts` — `ServerTool.availableIn?: WidgetRole[]` exists; the
      role filter exposes a tool IFF (`availableIn` undefined/empty → all roles) OR role ∈ `availableIn`;
      `category` does NOT gate visibility (a `mutate` tool with no `availableIn`, e.g.
      `propose_schema_field`, IS exposed to `"anonymous"`; `edit_template` is NOT). — DONE: new
      "role-scoped catalog" describe block (4 tests) incl. the `roleExposes` predicate + a member-only
      fixture; watched red (no `roleExposes`), now green.
- [x] Add `ServerTool.availableIn?: WidgetRole[]` (import `WidgetRole` from `@groundx/shared`) and a
      role parameter on `toolsForStep` (compose with the existing `availableSteps` step filter). — DONE:
      added `availableIn?: WidgetRole[]`, exported `roleExposes(tool, role)`, and `toolsForStep(stepKind, role?)`
      composing step ∧ role (omitted role → no-op for back-compat).
- [x] **Review EVERY tool deliberately** against `docs/agents/widget-access-matrix.md` §3: set
      `availableIn` on each `SERVER_TOOL_CATALOG` entry (most = all-roles = leave absent; `edit_template`
      = `["member"]`). Mirror the same decision on each app `*.tools.ts` tool. Any non-all-roles tool
      must have a matrix row + reason. — DONE: reviewed all 25 server entries. Every SHIPPED tool is
      all-roles (no `availableIn`) — the matrix's lone `edit_template = ["member"]` is the unshipped
      `_template` stub, not in either catalog. The deliberate decision is documented inline on the
      `availableIn` field + the catalog comment. No shipped tool is role-restricted today.
- [x] **Failing test:** the chat-router tool-exposure path filters by the caller's role — a `["member"]`
      tool is absent from the catalog the LLM sees when the caller is `"anonymous"`. — DONE:
      `chatRouter.test.ts` end-to-end block splices a member-only tool into `SERVER_TOOL_CATALOG`, drives
      `routeChat` with `callerRole`, and asserts the LLM `body.tools` excludes it for anonymous / includes
      it for member. Watched red (no filter applied), now green.
- [x] Derive the caller's `WidgetRole` server-side from the chat session (`session.ownerUserId` present →
      `"member"`, else `"anonymous"`) in `chatHandler.ts`; thread it onto `ChatRouterRequest`; pass it
      into `toolsForStep` in `chatRouter.ts` (alongside the existing `activeStepKind`). Role is NEVER
      taken from the client. — DONE: `chatHandler.ts` sets `callerRole: session.ownerUserId ? "member" : "anonymous"`;
      `ChatRouterRequest.callerRole` threaded; `runRagPipeline` calls `toolsForStep(activeStepKind, request.callerRole)`.

## UNBLOCK 3 · App↔server parity guard (the missing guard the Phase 3 task note flags)
**Execution: → SEQUENTIAL/TDD.** Gated on the parity-guard-shape INPUT NEEDED decision. Land AFTER both
catalogs carry the role axis (so the guard asserts the real, reconciled state).

- [x] **Failing test:** the parity guard fails when a tool is present on one side only, or when the same
      tool's `availableIn` role set differs across app and server. — DONE: verified adversarially by
      injecting `availableIn: ["member"]` onto a shipped server tool (guard went red, named the tool),
      then reverting (green). Name-mismatch + server-only-exception coverage included.
- [x] Implement the chosen guard shape (cross-package test OR committed name+role manifest + per-side
      assertion); document which it is + why in the test/file header. — DONE: `app/src/tools/catalog-parity.test.ts`
      — a CROSS-PACKAGE test (app-side, since the app catalog needs Vite's `import.meta.glob`) importing
      the app `toolRegistry` AND the middleware `SERVER_TOOL_CATALOG`; asserts NAME parity (modulo the
      documented server-only `suggest_intent`) + role agreement vs a single source-of-truth role map.
      Shape + rationale in the file header.
- [x] Confirm the guard runs in CI / the standard test command (not a manual-only check). — DONE: it is a
      `src/**/*.test.ts` file, so it runs in the app `vitest run` (the `npm test` gate).

## Absorb wf04 §1 · submit_signup (SignUpWidget)
**Execution: → SEQUENTIAL/TDD.** Depends on UNBLOCK 1 (verb). Each new tool = intent + handler +
`tools.ts` + server mirror + tests; the parity guard must stay green.

- [x] **Failing test:** `SignUpWidget.tools.ts` exports a `submit_signup` mutate tool with a valid Zod
      input (email + sign-up fields) that passes the quality guard. — DONE: `SignUpWidget.tools.test.ts`
      (4 tests); watched red (no module), now green.
- [x] Add a `submit_signup` CanvasIntent variant + orchestrator handler (mutate → chip/confirm path).
      — DONE: `submitSignup` CanvasIntent variant; the SignUpWidget registers an orchestrator adapter
      (via new `useCanvasOrchestratorOptional`) that runs the SAME `submitForm` sequence the Button calls
      (register → claim → promote → commitGate). Real action, no dormant tool.
- [x] Build `SignUpWidget.tools.ts`; delete `SignUpWidget/no-llm.md`; submit Button references the tool;
      the 5 inputs → `noTool` reason `"value collected by submit_signup"`. — DONE (no-llm.md deleted;
      Button `tool="submit_signup"`; 5 inputs carry the noTool reason; README LLM-tools section updated).
- [x] Mirror `submit_signup` in `SERVER_TOOL_CATALOG` (with its `availableIn` per the matrix); parity
      guard green. — DONE (all-roles, no `availableIn`; matrix §3 row added; parity green).

## Absorb wf04 §2 · OnboardingWizard nav tools
**Execution: → SEQUENTIAL/TDD.** Depends on UNBLOCK 1 (verb) + UNBLOCK 2 (view glob-home).

- [x] **Failing test:** `wizard_next` / `wizard_back` / `wizard_finish` / `dismiss_wizard` exist as
      tools and each dispatches the correct CanvasIntent. — DONE: `OnboardingWizard.tools.test.ts` (3 tests).
- [x] Add the 4 CanvasIntent variants + orchestrator handlers (read-style nav → auto-dispatch). — DONE:
      `wizardNext`/`wizardBack`/`wizardFinish`/`dismissWizard` variants; the OnboardingWizard view
      registers adapters calling the SAME OnboardingContext `next`/`back`/`finish`/`closeWithoutCompleting`
      the nav Buttons call. Real actions, no dormant tools.
- [x] Build `OnboardingWizard.tools.ts` (in the view glob-home); wire the 4 Buttons to their tools.
      — DONE: file at `views/Onboarding/OnboardingWizard.tools.ts`; the 4 nav Buttons carry
      `tool="dismiss_wizard"`/`"wizard_back"`/`"wizard_finish"`/`"wizard_next"`.
- [x] Mirror the 4 tools in `SERVER_TOOL_CATALOG` (`availableIn` per matrix); parity guard green. — DONE
      (all-roles; matrix §3 rows added; parity green; quality + reference guards green for the view home).

## Absorb wf04 §4 · close_dialog (DialogTitle primitive)
**Execution: → SEQUENTIAL/TDD.** Depends on UNBLOCK 1 (verb) + UNBLOCK 2 (primitive glob-home).

- [x] **Failing test:** `DialogTitle`'s close IconButton carries `tool="close_dialog"`; the tool exists
      and passes the quality guard. — DONE: `DialogTitle.tools.test.ts` (3 tests) + the close IconButton
      now renders `tool="close_dialog"` (the reference guard resolves it via the primitive glob-home).
- [x] Add a `close_dialog` CanvasIntent variant + orchestrator handler (mutate → dismiss the active
      dialog). — DONE: `closeDialog` variant; the DialogTitle primitive registers an adapter that calls
      its own `onClose` (the SAME action the close IconButton invokes). Real action, no dormant tool.
- [x] Build `DialogTitle.tools.ts` (in the primitive glob-home); close IconButton references the tool.
      — DONE: file at `components/primitives/DialogTitle/DialogTitle.tools.ts`; IconButton `tool="close_dialog"`.
- [x] Mirror `close_dialog` in `SERVER_TOOL_CATALOG` (`availableIn` per matrix); parity guard green.
      — DONE (all-roles; matrix §3 row added; parity green).

## Closeout
**Execution: → SEQUENTIAL (gate).**

- [x] `openspec validate --strict` green (`2026-05-31-tool-system-completion`); app suite green (166 files /
      1403 tests) + middleware suite green (27 files / 604 tests, file-serial); widget-contract,
      widget-access-matrix, `check-tool-quality` (+ self-test), `check-tool-references` (+ self-test), and
      the new parity guard green; `npm run build` (tsc + vite) clean; middleware `tsc --noEmit` clean.
- [x] Update `docs/agents/widget-access-matrix.md` — DONE: added §3 rows for `submit_signup` / `wizard_next`
      / `wizard_back` / `wizard_finish` / `dismiss_wizard` / `close_dialog` (all all-roles). No EXISTING
      tool's role row changed (every shipped tool stays all-roles). `wf04` §1/§2/§4 are done here; §3/§6/§7
      re-scope tracked separately; this completes `widget-role-access` Phase 3 (the role axis is now
      behaviorally live server-side).
- [ ] Archive (coordinate with `widget-role-access` archival). — NOT done here by design: archiving is the
      orchestrator's call after this step (the task brief says "do NOT archive WRA here").
