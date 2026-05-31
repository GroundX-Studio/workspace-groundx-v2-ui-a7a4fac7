# Design — Registry/catalog consistency

## Current state (evidence)

- `contexts/ScenarioRegistryContext/types.ts` — `ScenarioRegistryApi = { state, refresh, byId }`;
  enumerate via `state.scenarios`. Remote-fetched, async status (`idle|loading|ready|error`), Context.
- `tools/registry.ts` — `ToolRegistry = { all, byName, forStep }`; built from `import.meta.glob`,
  unique-name invariant (throws on dup). Plain singleton, sync.
- `contexts/EntityRegistryContext/EntityRegistryContext.tsx` — `{ state, activate, upsertAndActivate,
  updateActive }`; a compat shim over `ChatStore.activeSession.entities`. Mutable session state, NOT a
  catalog (its own header already says "historically the source of truth … now a thin compatibility layer").

So: two catalogs that nearly agree (different lookup method names, no shared type), and one mutable
state store misnamed "Registry".

## Target

### 1. The shared contract
```ts
// the read API EVERY data catalog satisfies
export interface Catalog<T> {
  all(): readonly T[];
  byId(id: string): T | undefined;
}
// local (static/glob) catalogs additionally guarantee unique ids:
export function assertUniqueIds<T>(
  items: T[],
  idOf: (t: T) => string,
  sourceOf?: (t: T) => string, // optional source label (e.g. module path); named in the error
): void; // throws on dup, naming the duplicate id and — when sourceOf is supplied — the colliding sources
```
The optional `sourceOf` lets a glob-discovered catalog pass each entry's module path so the thrown
error can name the colliding source modules (the tool registry needs this; a plain list does not).
Placed where both app + (if needed) shared can import it — `@groundx/shared` if isomorphic, else
`app/src/lib/catalog`. It is ONLY a type + a tiny helper — no base class, no framework.

### 2. How each catalog satisfies it
| Catalog | satisfies `Catalog<T>` via | intrinsic extension (kept) |
|---|---|---|
| `toolRegistry` | add `byId` = current `byName`; `all()` already exists | `forStep(step, mode)`, unique-name invariant |
| `ScenarioRegistry` | add `all()` = `state.scenarios`; `byId` exists | async status + `refresh()`, Context delivery |
| `chatExperienceRegistry` | `all()` + `byId()` native | `configSchema` per entry, unique-id, glob discovery |

`byName` stays as a back-compat alias on the tool registry (a tool's id *is* its name) with a doc note;
no call-site churn forced. The async/Context wrapper on `ScenarioRegistry` is the legitimate
remote-catalog shape — the `Catalog<T>` view is its ready-state data API, not a demand to go synchronous.

### 3. Delivery is allowed to differ (and should)
- **Remote** catalog (Scenario): Context + status machine + `refresh()` — consumers need loading/error UI.
- **Local** catalog (Tool, ChatExperience): plain singleton built at boot from a glob — no async, no
  per-tree state, so no Context.

This is NOT inconsistency to remove — it is sourcing. The CONTRACT (`all`/`byId`/unique-id) is what
unifies them; the wrapper is what each kind legitimately needs.

### 4. `EntityRegistry` → `EntitySessionStore`
It is mutable session state over ChatStore with a mutate API (`activate`/`upsert`/`update`) — the
opposite of a read catalog. Rename to remove the false family membership:
- `EntityRegistryContext` → `EntitySessionStoreContext`; `useEntityRegistry` → `useEntitySessionStore`;
  `EntityRegistryProvider` → `EntitySessionStoreProvider`. (Or fold wholesale into ChatStore naming.)
- The "Store" suffix is deliberate: the `EntitySession` data-type is already exported from this module
  (and consumed by ChatStore/OnboardingSession), so a bare `EntitySession` provider/hook would collide.
- Pure rename + import update; behavior unchanged; the compat-shim internals stay. The `EntitySession`
  data-type itself is untouched.

## Why this shape (vs alternatives)
- **vs a `Catalog` base class / framework**: rejected (anti-overengineering memo) — a shared interface +
  a unique-id helper is enough; a base class would force sourcing/delivery into one mold, which §3 shows
  is wrong.
- **vs forcing all three into one delivery (all Context, or all singleton)**: rejected — remote needs
  async+Context, local needs neither. Flattening delivery would add ceremony or remove needed status UI.
- **vs leaving `EntityRegistry` named as-is**: rejected — the misnomer is precisely what invited a
  dispatcher-shaped "experience registry"; naming should make "catalog = read lookup" reliable.

## Risks / watch-items
- **Rename blast radius**: `EntityRegistry` consumers across contexts/views/tests. `tsc --noEmit`
  (in `npm run build`) catches every missed reference; do the rename in one pass. Rename only the
  module/provider/hook (`EntitySessionStore*`); leave the `EntitySession` data-type export alone.
- **Don't over-unify**: resist adding `forStep`-like or status fields to the shared `Catalog<T>` — they
  are per-catalog extensions, not contract.
