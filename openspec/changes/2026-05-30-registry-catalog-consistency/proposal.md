# Registry/catalog consistency

## Why

The codebase has three things named or used like "registries", but they are not one family:

| | `ScenarioRegistry` | `toolRegistry` | `EntityRegistry` |
|---|---|---|---|
| Purpose | catalog of sample content | catalog of LLM tools | **per-entity session state** |
| Sourcing | remote fetch (`/api/scenarios`) | local `import.meta.glob` | mutable, over ChatStore |
| Lookup | `byId(id)` | `byName(name)` | `activate` / `upsert` / `update` |
| Enumerate | `state.scenarios` | `all()` | — |
| A catalog? | yes | yes | **no** — mutable state shim |

Two are genuine **data catalogs** (look up content/descriptors by id, enumerate); they already nearly
agree but use different method names (`byId` vs `byName`) and have no shared contract. The third,
`EntityRegistry`, is mutable per-entity session state that was *named* "Registry" — it is not a catalog
at all, and that misnaming invites the exact confusion that nearly produced a behavior-dispatching
"experience registry" (rejected — see the unified-conversation-flow change).

The unified-conversation-flow change adds a fourth catalog (`chatExperienceRegistry`) built in the
catalog style. This change makes the **catalog family explicit and consistent**, and renames the
non-catalog out of it — so "registry/catalog" reliably means *a read catalog*, never a dispatcher and
never a state store.

## What

- **`Catalog<T>` contract** (in `@groundx/shared` or an app-level `lib/catalog`): the shared read API
  every data catalog satisfies —
  ```ts
  interface Catalog<T> { all(): readonly T[]; byId(id: string): T | undefined; }
  ```
  Local (static/glob) catalogs additionally enforce a **unique-id invariant** (duplicate id throws at
  build/boot). Intrinsic differences are explicitly allowed and NOT flattened: remote catalogs add an
  async status machine + `refresh()` and are delivered via a React Context; local catalogs are plain
  singletons. The contract governs the *data-access API*, not the delivery/sourcing.
- **Align `toolRegistry`**: expose `byId` (the tool's id IS its `name`) so it satisfies `Catalog<WidgetTool>`;
  keep `byName` as a documented alias and `forStep(...)` as a tool-specific extension. No behavior change.
- **Align `ScenarioRegistry`**: expose `all()` (returns `state.scenarios`) and keep `byId`, so its
  ready-state data view satisfies `Catalog<ScenarioConfig>`; the async status + `refresh()` remain as
  the remote-catalog extension.
- **`chatExperienceRegistry`** (delivered by the conversation-flow change) declared as `Catalog<ChatExperienceEntry>`
  here so all three reference the one contract.
- **Rename `EntityRegistry` out of the family**: it is session state, not a catalog — rename to a
  state-store name (`EntitySessionStoreContext` / `useEntitySessionStore`, a thin layer over ChatStore).
  ("Store" suffix avoids collision with the existing `EntitySession` data-type already exported from
  this module.) The word "Registry"/"Catalog" is reserved for read catalogs. Mechanical import update;
  no behavior change.

## Conformance to core architectural decisions

- **Catalog-not-dispatcher**: codifies the line drawn in the conversation-flow change — a catalog looks
  up + enumerates; it never resolves behavior from a context. Naming now enforces it.
- **Schema-as-source-of-truth**: `Catalog<T>` is a small typed contract; catalog entries that carry
  config (e.g. `ChatExperienceEntry.configSchema`) use Zod, like `WidgetTool.input`.
- **Anti-overengineering**: we do NOT introduce a base class or a runtime catalog framework — just a
  shared interface + a unique-id helper. Sourcing stays per-catalog.

## Out of scope

- Building `chatExperienceRegistry` itself (that ships in the unified-conversation-flow change; this
  change only references it as a `Catalog` implementer).
- Any change to how scenarios are fetched or tools are discovered (sourcing is intrinsic, untouched).
- A generic catalog base class / mixin (deliberately not built — see Conformance).

## Affected

`app/src/tools/registry.ts` + `types.ts` (`byId` alias), `app/src/contexts/ScenarioRegistryContext/`
(`all()`), the new `Catalog<T>` contract location, and the `EntityRegistry` → `EntitySessionStore`
rename across its consumers (contexts + views + tests).
