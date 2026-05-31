# Tasks — Registry/catalog consistency

> Goal: one shared `Catalog<T>` read contract across the data catalogs (`ScenarioRegistry`,
> `toolRegistry`, `chatExperienceRegistry`); rename the non-catalog `EntityRegistry` module/provider/hook
> out of the family (to `EntitySessionStore*`).
> No behavior change — pure API alignment + rename. WIP cap = 3.
>
> **Execution: SEQUENTIAL/TDD.** Small, coupled, type-driven; the rename is one atomic `tsc`-guarded
> pass. Not a fan-out.
>
> **Ordering (resolves the bidirectional dependency):**
> - **Phase 1 ships FIRST**, before unified-conversation-flow Phase 2 — that change's
>   `chatExperienceRegistry` imports this `Catalog<T>` + `assertUniqueIds`. There is no interim "local"
>   contract; conversation-flow depends on Phase 1 landing.
> - **Phases 2–3** (align tool/scenario, rename Entity) are independent — land anytime.
> - **Phase 4** (declare `chatExperienceRegistry` as a `Catalog` implementer) runs AFTER
>   unified-conversation-flow has created that registry.

## Phase 1 · The shared contract
- [ ] **Failing test:** `Catalog<T>` type compiles; `assertUniqueIds([{id:"a"},{id:"a"}], x=>x.id)` throws naming the dup id; with an optional `sourceOf` (e.g. `assertUniqueIds(items, x=>x.id, x=>x.module)`) the error ALSO names the colliding sources; a unique list passes.
- [ ] Add `Catalog<T>` interface + `assertUniqueIds(items, idOf, sourceOf?)` helper (in `@groundx/shared` if isomorphic, else `app/src/lib/catalog`). The optional `sourceOf` returns a source label per item (e.g. module path) so the throw can name the colliding sources; without it the error names only the duplicate id. Export. Rebuild `dist` if shared.

## Phase 2 · Align the two existing catalogs (no behavior change)
- [x] **FIRST — decide `toolRegistry`'s fate (it is an orphan).** Audit (2026-05-30) confirmed the app `toolRegistry` singleton + every widget `handler` has **zero production importers** — the live LLM catalog is the middleware `SERVER_TOOL_CATALOG` (`toolsForStep`, `chatRouter.ts:575`), and the app dispatches server-built `reply.intents`. **DECISION (reconciled with the cross-plan conflict map): it is dead → DELETE recommended, but the delete is DEFERRED** — `toolRegistry` is shared by four in-flight changes (RCC, core-data, widget-role-access, wf04); a half-done removal across them is forbidden (`feedback_no_shortcuts`). A coordinated follow-up owns the delete. This change DOCUMENTS the orphan + recommendation (proposal.md, design.md, and a code comment on `ToolRegistry` in `app/src/tools/types.ts`) and aligns it non-destructively below; it does NOT wire a new consumer and does NOT delete anything.
- [x] **Failing test:** `toolRegistry` satisfies `Catalog<WidgetTool>` — `byId(name)` returns the same tool as `byName(name)`; `all()` unchanged; `forStep` untouched; duplicate id still throws at boot. *(Non-destructive alignment; delete deferred — see decision above.)* → `app/src/tools/registry.test.ts`.
- [x] Add `byId` to `ToolRegistry` (alias of `byName`; document that a tool's id is its `name`); declare `ToolRegistry extends Catalog<WidgetTool>`. Refactor the registry's existing bespoke duplicate-name throw to call the shared `assertUniqueIds`, passing `sourceOf` = each tool's module path — ONE mechanism for the invariant, not two, and it preserves the existing "declared in two modules" semantics by naming the colliding modules.
- [x] **Failing test:** `ScenarioRegistry` exposes `all()` returning `state.scenarios`; `byId` unchanged; status/`refresh` untouched. → `app/src/contexts/ScenarioRegistryContext/ScenarioRegistryContext.test.tsx`.
- [x] Add `all()` to `ScenarioRegistryApi`; have the ready-state data view satisfy `Catalog<ScenarioConfig>` (async wrapper stays).

## Phase 3 · Rename `EntityRegistry` → `EntitySessionStore` (atomic, tsc-guarded)
- [ ] **Failing test:** `useEntitySessionStore()` returns the same API the old `useEntityRegistry()` did (behavior identical); the old name no longer resolves.
- [ ] Rename `EntityRegistryContext`→`EntitySessionStoreContext`, `EntityRegistryProvider`→`EntitySessionStoreProvider`, `useEntityRegistry`→`useEntitySessionStore`; update all consumers (contexts/views/tests) in one pass. Do NOT rename the `EntitySession` data-type export (already used by ChatStore/OnboardingSession) — the "Store" suffix exists precisely to avoid that collision. `npm run build` (tsc) green proves no missed reference.

## Phase 4 · Declare `chatExperienceRegistry` against the contract
- [ ] Once unified-conversation-flow has shipped `chatExperienceRegistry`, declare it `Catalog<ChatExperienceEntry>` (it natively has `all()`/`byId()`); add a test that it satisfies the shared contract. *(If this change lands first, leave a tracked checkbox; do NOT pre-create the catalog here.)*

## Closeout
- [ ] `validate --all --strict` green; app + middleware suites green; widget-contract + no-hardcoded-styles guards green; `npm run build` clean.
- [ ] Update `docs/agents/data-model.md` (the catalog family + the `Catalog<T>` contract) + memory if a durable rule emerges (catalog = read lookup; never a dispatcher; never a state store).
- [ ] Archive.

## Out of scope / deferred (tracked, NOT this change)
- [ ] A generic catalog base class / framework — deliberately not built (anti-overengineering).
- [ ] Changing scenario fetch / tool glob discovery (sourcing is intrinsic, untouched).
