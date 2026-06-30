# Complete role-based LLM-tool gating + the deferred view/primitive tools

## Why

Two pieces of the tool system are landed-but-unfinished, and both share one root: the LLM-facing
catalog is **server-side** (`middleware/.../toolCatalog.ts` → `chatRouter.ts`), so any role/visibility
contract is a no-op until it lands there.

1. **`widget-role-access` Phase 3 is the only unfinished piece of the shipped role system.** Phase 1
   (`WidgetRole`/`WidgetScope`/`widgetRoleCanEdit` in `@groundx/shared`) and Phase 2 (per-widget
   `role`+`scope` prop sweep + the access matrix `docs/agents/widget-access-matrix.md`) are shipped. But
   the app `WidgetTool.availableIn` is still `ToolMode[]` (`"onboarding"|"steady"`), the middleware
   `ServerTool` has **no role axis at all**, and the chat router applies **no role filter** — so the LLM
   sees every tool regardless of role. The role contract is dormant on the surface that matters. (Note:
   the app-side `toolRegistry` is itself an orphan with zero production importers — its `availableIn`
   migration is a type/contract alignment; the *behavioral* gate is the new server-side filter on
   `SERVER_TOOL_CATALOG`.)

2. **`wf04` §1/§2/§4 — the deferred `submit_signup` / `wizard_*` / `close_dialog` tools.** These were
   backlogged behind two missing prerequisites: (a) `submit_`/`wizard_`/`close_` are absent from
   `ALLOWED_VERBS` in `app/scripts/check-tool-quality.mjs`, so the names fail the quality gate; and (b)
   the registry glob + the quality scanner walk only `chat-widgets/*` + `viewer-widgets/*`, but
   `OnboardingWizard` is a view and `DialogTitle` is a primitive — neither has a glob home. Until both
   land, the tools cannot be authored. They share the same surface as Phase 3 (the server catalog + the
   verb/glob plumbing), so finishing them here avoids a second tool-system pass.

This change is the single tracked home for finishing the tool system: flip the role axis end-to-end,
add the missing app↔server parity guard, open the verb/glob plumbing, and author the three deferred
tools deliberately reviewed against the access matrix.

## What Changes

- **App role axis** — change `WidgetTool.availableIn` from `ToolMode[]` to `WidgetRole[]`
  (`app/src/tools/types.ts`); update the `forStep(stepKind, mode?)` filter parameter + the `ToolMode`
  references in `registry.ts`/`registry.test.ts` to `WidgetRole`. Remove the now-dead `ToolMode` type if
  it has no other caller.
- **Server role axis** — add `ServerTool.availableIn?: WidgetRole[]` to `middleware/.../toolCatalog.ts`
  and set it deliberately on EVERY `SERVER_TOOL_CATALOG` entry per the access matrix.
- **Server-side role filter** — the chat router exposes a tool to the LLM only when the caller's role
  permits it. Rule: **absent/empty `availableIn` = all roles**; `edit_template` = `["member"]` only.
  `category` (`read`/`mutate`) SHALL NOT gate visibility. The caller's `WidgetRole` is derived
  server-side from the chat session (`session.ownerUserId` present → `"member"`, else `"anonymous"`) —
  never trusted from the client. Wire it through `ChatRouterRequest`/`toolsForStep` alongside the
  existing `activeStepKind` step filter.
- **Deliberate review of EVERY tool** — walk every app `*.tools.ts` tool AND every `SERVER_TOOL_CATALOG`
  entry against `docs/agents/widget-access-matrix.md` §3 and set `availableIn` explicitly (not just the
  one with a value today). Any tool whose access is not "all roles" appears in the matrix with a reason.
- **UNBLOCK — app↔server tool-catalog parity guard.** There is NO cross-package guard today asserting
  that `app/src/tools/*.tools.ts` and the middleware `SERVER_TOOL_CATALOG` agree on tool NAMES + ROLES
  (the middleware `toolCatalog.test.ts` pins only a server-side name set). Add a minimal NAME+role parity
  assertion. If the two packages cannot share a single test cleanly, ship a documented per-package check
  (a generated/committed name+role manifest the other side asserts against) — and say which it is.
- **UNBLOCK — verb allowlist.** Add `submit_`, `wizard_`, `close_` to `ALLOWED_VERBS` in
  `app/scripts/check-tool-quality.mjs`.
- **UNBLOCK — glob-home for view/primitive tools.** Extend the registry glob
  (`app/src/tools/registry.ts`) AND the quality scanner (`collectToolFiles` in `check-tool-quality.mjs`)
  so a `*.tools.ts` co-located with a view (`OnboardingWizard`) and a primitive (`DialogTitle`) is
  discoverable. Decide the glob shape (a documented additional home, e.g. the specific
  `views/Onboarding/*.tools.ts` + `primitives/DialogTitle/*.tools.ts` paths, or a broader pattern) and
  apply the SAME shape to both walkers so they cannot drift.
- **Absorb `wf04` §1/§2/§4 — author the three deferred tools** (each = CanvasIntent variant +
  orchestrator handler + app `*.tools.ts` + server-catalog mirror + tests):
  - `submit_signup` (SignUpWidget, mutate) — delete `SignUpWidget/no-llm.md`; submit Button references
    the tool; the 5 inputs stay `noTool` with the honest reason `"value collected by submit_signup"`.
  - `wizard_next` / `wizard_back` / `wizard_finish` / `dismiss_wizard` (OnboardingWizard, read-style nav
    → auto-dispatch intents).
  - `close_dialog` (DialogTitle primitive, mutate) — the close IconButton references it.

### NOT carried over (re-scope dropped)

`wf04` §3/§6/§7 premises are **stale after the architecture run** and are NOT in this change: §3's
GateChatRail stray-Button target is gone (0 `<Button>` after the unified-conversation-flow rewrite);
§6's `check-tool-references` binding-guard test does not exist by that name; §7's
`DropdownMenu`/`GxPill`/`GxSectionHeader` `no-llm.md` files don't exist. They need a fresh re-scope
against current code (tracked in `docs/agents/cross-plan-execution-order.md`), not a carry-forward.

## Relationship to other changes

- **`widget-role-access`** owns the two MODIFIED `agent-tools` durable requirements (catalog assembly +
  role-scoped catalog) — its Phase 1 + Phase 2 shipped. This change executes its Phase 3 *tasks* (the
  app/server role axis + filter) and adds the parity guard its tasks note is missing. This change's spec
  delta does NOT re-MODIFY those two requirements (no cross-plan delta collision); it ADDS only the
  net-new durable contracts (parity guard, glob-home, new verbs, the three new tools). Coordinate so
  widget-role-access archives with Phase 3 complete.
- **`wf04`** (`2026-05-28-wf04-tool-coverage-completion`) — its §1/§2/§4 deferred work moves HERE; §3/§6/§7
  are dropped pending re-scope (above). wf04 may archive once its runnable scope is reconciled separately.

## Conformance to core architectural decisions

- **Composable, not forked (axis value, not cross-product)** — role is a first-class axis value on the
  ONE tool catalog (`availableIn: WidgetRole[]`), not a parallel onboarding/steady catalog. Adding a
  future role (`viewer`/`editor`) is an enum entry + a matrix row, no catalog fork. The verb/glob change
  widens the ONE discovery mechanism rather than adding a second registry.
- **One source of truth** — `WidgetRole` is the `@groundx/shared` Zod enum; the app + server tool
  catalogs assert NAME+role parity via the new guard so they cannot drift.
- **No dormant/spec-only plumbing** — the role axis becomes behaviorally live on the server catalog (the
  surface the LLM actually sees), not a type-only addition; the three new tools are wired end-to-end
  (intent + handler + mirror + tests), not scaffold-only.
- **TDD + adversarial review** — each unit lands failing-test-first; the parity guard + the role filter
  are themselves failing-first tests; per-task adversarial review against code + this proposal.

## Out of scope

- New future roles (`viewer`/`editor`/`admin`) — enum entry + matrix row when needed.
- Server-side authorization on mutate endpoints — this gates LLM tool VISIBILITY; persistence
  permission is enforced at save/commit (server-side + the gate), tracked separately.
- The app-side `toolRegistry` orphan deletion (shared by multiple in-flight changes — a coordinated
  follow-up owns it).
- `wf04` §3/§6/§7 re-scope (above).

## Affected

- App: `src/tools/types.ts` (`availableIn` → `WidgetRole[]`, `ToolMode` removal), `src/tools/registry.ts`
  + `registry.test.ts` (role filter + glob), `scripts/check-tool-quality.mjs` (verbs + glob),
  the new `SignUpWidget.tools.ts` / `OnboardingWizard.tools.ts` / `DialogTitle.tools.ts`, the three
  widgets' wiring (+ delete `SignUpWidget/no-llm.md`), `CanvasOrchestratorContext` (3 intent groups +
  handlers).
- Middleware: `services/toolCatalog.ts` (`ServerTool.availableIn` + every entry + the 3 mirrored tools),
  `services/chatRouter.ts` + `chatHandler.ts` (derive role, thread it, role-filter the catalog),
  `services/toolCatalog.test.ts` (role coverage).
- Cross-package: a NAME+role parity guard.
- Specs: `agent-tools` (ADD the parity-guard, glob-home, verb-allowlist-extension, and the three
  new-tool requirements).
