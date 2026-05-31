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

- [ ] **INPUT NEEDED:** The app-side `toolRegistry` is documented as an orphan (zero production
      importers; the live LLM catalog is the middleware `SERVER_TOOL_CATALOG`) and is slated for a
      coordinated delete shared by multiple in-flight changes. For THIS change, do we (a) migrate the
      app-side `availableIn` to `WidgetRole[]` for contract/parity alignment now (keeping the orphan
      alive), or (b) treat the server catalog as the sole role-bearing surface and skip the app-side
      type migration until the orphan-delete lands? (Affects the app-axis tasks + the parity-guard
      shape below.)
- [ ] **INPUT NEEDED:** Parity-guard shape — a single cross-package test (one package importing the
      other's catalog) vs. a committed name+role manifest each side asserts against. The middleware
      vitest is file-serial and the packages don't currently share a test harness; confirm which shape
      to build.
- [ ] **INPUT NEEDED:** Glob-home shape for view/primitive tools — narrow documented paths
      (`views/Onboarding/*.tools.ts` + `primitives/DialogTitle/*.tools.ts`) vs. a broader pattern
      (`views/**/*.tools.ts` + `primitives/**/*.tools.ts`). Both the registry glob and the quality
      scanner must use the SAME shape; pick one.

## UNBLOCK 1 · Verb allowlist (gates the three new tools)
**Execution: → SEQUENTIAL/TDD (one-file, trivial).**

- [ ] **Failing test:** assert `submit_signup`, `wizard_next`, `close_dialog` pass `check-tool-quality`'s
      verb-prefix rule (or, until the tools exist, a unit assertion that `ALLOWED_VERBS` includes
      `submit_`/`wizard_`/`close_`).
- [ ] Add `submit_`, `wizard_`, `close_` to `ALLOWED_VERBS` in `app/scripts/check-tool-quality.mjs`.

## UNBLOCK 2 · Glob-home for view/primitive tools (gates OnboardingWizard + DialogTitle tools)
**Execution: → SEQUENTIAL/TDD.** Gated on the glob-home INPUT NEEDED decision.

- [ ] **Failing test:** the registry assembles a tool from a view-hosted `*.tools.ts`
      (`OnboardingWizard`) and a primitive-hosted one (`DialogTitle`); `check-tool-quality`'s
      `collectToolFiles` yields those files. (Use a fixture/synthetic module so the test is independent
      of the real tool files that land later.)
- [ ] Extend `import.meta.glob` in `app/src/tools/registry.ts` to the chosen view/primitive home(s).
- [ ] Extend `collectToolFiles` in `app/scripts/check-tool-quality.mjs` to the SAME shape (assert in a
      test that both walkers recognize the same home, so they cannot drift).

## App role axis (Phase 3 — app side)
**Execution: → SEQUENTIAL/TDD.** Gated on the orphan/toolRegistry INPUT NEEDED decision. If (b) is
chosen, this section reduces to the type rename needed for the parity guard.

- [ ] **Failing test:** `registry.test.ts` — `forStep(stepKind, role)` filters by a `WidgetRole`
      (`"anonymous"`/`"member"`); a tool with no/empty `availableIn` is exposed to ALL roles; a
      `["member"]` tool is hidden from `"anonymous"`. Update the existing `availableIn: ["onboarding"]`
      fixture to a role.
- [ ] Change `WidgetTool.availableIn` from `ToolMode[]` to `WidgetRole[]` (`app/src/tools/types.ts`);
      retype `forStep`'s mode param + the `inMode` filter in `registry.ts` to `WidgetRole`; remove the
      `ToolMode` type if it has no remaining caller (and the doc comments referencing it).
- [ ] Update `_template/Template.tools.ts` `edit_template` from `["steady"]` → `["member"]` and the
      README/Template.tsx references (already partly worded as `["member"]`).

## Server role axis + filter (Phase 3 — server side; the behavioral gate)
**Execution: → SEQUENTIAL/TDD.** This is the surface the LLM actually sees — the no-op-without-this part.

- [ ] **Failing test:** `toolCatalog.test.ts` — `ServerTool.availableIn?: WidgetRole[]` exists; the
      role filter exposes a tool IFF (`availableIn` undefined/empty → all roles) OR role ∈ `availableIn`;
      `category` does NOT gate visibility (a `mutate` tool with no `availableIn`, e.g.
      `propose_schema_field`, IS exposed to `"anonymous"`; `edit_template` is NOT).
- [ ] Add `ServerTool.availableIn?: WidgetRole[]` (import `WidgetRole` from `@groundx/shared`) and a
      role parameter on `toolsForStep` (compose with the existing `availableSteps` step filter).
- [ ] **Review EVERY tool deliberately** against `docs/agents/widget-access-matrix.md` §3: set
      `availableIn` on each `SERVER_TOOL_CATALOG` entry (most = all-roles = leave absent; `edit_template`
      = `["member"]`). Mirror the same decision on each app `*.tools.ts` tool. Any non-all-roles tool
      must have a matrix row + reason.
- [ ] **Failing test:** the chat-router tool-exposure path filters by the caller's role — a `["member"]`
      tool is absent from the catalog the LLM sees when the caller is `"anonymous"`.
- [ ] Derive the caller's `WidgetRole` server-side from the chat session (`session.ownerUserId` present →
      `"member"`, else `"anonymous"`) in `chatHandler.ts`; thread it onto `ChatRouterRequest`; pass it
      into `toolsForStep` in `chatRouter.ts` (alongside the existing `activeStepKind`). Role is NEVER
      taken from the client.

## UNBLOCK 3 · App↔server parity guard (the missing guard the Phase 3 task note flags)
**Execution: → SEQUENTIAL/TDD.** Gated on the parity-guard-shape INPUT NEEDED decision. Land AFTER both
catalogs carry the role axis (so the guard asserts the real, reconciled state).

- [ ] **Failing test:** the parity guard fails when a tool is present on one side only, or when the same
      tool's `availableIn` role set differs across app and server.
- [ ] Implement the chosen guard shape (cross-package test OR committed name+role manifest + per-side
      assertion); document which it is + why in the test/file header.
- [ ] Confirm the guard runs in CI / the standard test command (not a manual-only check).

## Absorb wf04 §1 · submit_signup (SignUpWidget)
**Execution: → SEQUENTIAL/TDD.** Depends on UNBLOCK 1 (verb). Each new tool = intent + handler +
`tools.ts` + server mirror + tests; the parity guard must stay green.

- [ ] **Failing test:** `SignUpWidget.tools.ts` exports a `submit_signup` mutate tool with a valid Zod
      input (email + sign-up fields) that passes the quality guard.
- [ ] Add a `submit_signup` CanvasIntent variant + orchestrator handler (mutate → chip/confirm path).
- [ ] Build `SignUpWidget.tools.ts`; delete `SignUpWidget/no-llm.md`; submit Button references the tool;
      the 5 inputs → `noTool` reason `"value collected by submit_signup"`.
- [ ] Mirror `submit_signup` in `SERVER_TOOL_CATALOG` (with its `availableIn` per the matrix); parity
      guard green.

## Absorb wf04 §2 · OnboardingWizard nav tools
**Execution: → SEQUENTIAL/TDD.** Depends on UNBLOCK 1 (verb) + UNBLOCK 2 (view glob-home).

- [ ] **Failing test:** `wizard_next` / `wizard_back` / `wizard_finish` / `dismiss_wizard` exist as
      tools and each dispatches the correct CanvasIntent.
- [ ] Add the 4 CanvasIntent variants + orchestrator handlers (read-style nav → auto-dispatch).
- [ ] Build `OnboardingWizard.tools.ts` (in the view glob-home); wire the 4 Buttons to their tools.
- [ ] Mirror the 4 tools in `SERVER_TOOL_CATALOG` (`availableIn` per matrix); parity guard green.

## Absorb wf04 §4 · close_dialog (DialogTitle primitive)
**Execution: → SEQUENTIAL/TDD.** Depends on UNBLOCK 1 (verb) + UNBLOCK 2 (primitive glob-home).

- [ ] **Failing test:** `DialogTitle`'s close IconButton carries `tool="close_dialog"`; the tool exists
      and passes the quality guard.
- [ ] Add a `close_dialog` CanvasIntent variant + orchestrator handler (mutate → dismiss the active
      dialog).
- [ ] Build `DialogTitle.tools.ts` (in the primitive glob-home); close IconButton references the tool.
- [ ] Mirror `close_dialog` in `SERVER_TOOL_CATALOG` (`availableIn` per matrix); parity guard green.

## Closeout
**Execution: → SEQUENTIAL (gate).**

- [ ] `openspec validate --all --strict` green; app + middleware suites green; widget-contract,
      no-hardcoded-styles, `check-tool-quality`, and the new parity guard green; `npm run build` clean.
- [ ] Update `docs/agents/widget-access-matrix.md` if any tool's role row changed during the deliberate
      review; reconcile `wf04` (its §1/§2/§4 are done here; §3/§6/§7 re-scope tracked separately) and
      note Phase 3 completion against `widget-role-access`.
- [ ] Archive (coordinate with `widget-role-access` archival).
