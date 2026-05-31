# Spec Delta — app-architecture (registry/catalog consistency)

Establishes the data-catalog family and reserves "registry/catalog" naming for read catalogs.

## ADDED Requirements

### Requirement: Data catalogs SHALL share a `Catalog<T>` read contract

Every data catalog SHALL satisfy a shared `Catalog<T>` contract exposing `all(): readonly T[]` and
`byId(id: string): T | undefined`. A data catalog is a collection looked up by id and enumerated —
today `ScenarioRegistry`, `toolRegistry`, and `chatExperienceRegistry`. Locally-sourced catalogs
(static or glob-discovered) SHALL additionally enforce a unique-id invariant that fails at build/boot
on a duplicate id. A catalog SHALL be lookup + enumeration only: it SHALL NOT resolve an entry from a
route/entry context and SHALL NOT mount or otherwise dispatch behavior.

The unique-id helper SHALL accept an optional source-label extractor; when a glob-discovered catalog
supplies it (e.g. each entry's module path), the duplicate-id error SHALL name the colliding source
modules. Without it, the error names the duplicate id only.

Sourcing and delivery MAY differ and SHALL NOT be flattened: a remote catalog MAY add an async status
machine + `refresh()` and be delivered via a React Context; a local catalog MAY be a plain singleton.
The shared contract governs the data-access API only. No catalog base class or runtime catalog
framework SHALL be introduced — the contract is a type plus a unique-id helper.

#### Scenario: Each catalog satisfies the shared read API

- **GIVEN** `ScenarioRegistry`, `toolRegistry`, and `chatExperienceRegistry`
- **WHEN** their public APIs are inspected
- **THEN** each exposes `all()` and `byId(id)` conforming to `Catalog<T>`
- **AND** `toolRegistry` retains `byName` as a documented alias (a tool's id is its `name`) and its
  tool-specific `forStep(...)` extension
- **AND** `ScenarioRegistry` retains its async status + `refresh()` as the remote-catalog extension.

#### Scenario: A local catalog rejects a duplicate id at boot

- **GIVEN** a glob-discovered catalog (e.g. `toolRegistry` or `chatExperienceRegistry`) with two entries sharing an id, assembled via the unique-id helper with a source-label extractor (each entry's module path)
- **WHEN** the catalog is assembled at boot
- **THEN** assembly throws an error naming the duplicate id
- **AND** because the source-label extractor was supplied, the error also names the colliding source modules.

#### Scenario: A catalog does not dispatch

- **GIVEN** any data catalog
- **WHEN** its surface is inspected
- **THEN** it offers lookup (`byId`) and enumeration (`all`) only
- **AND** it exposes no `resolve(context)`-style method that selects or mounts an entry from a route/entry context.

### Requirement: "Registry"/"Catalog" naming SHALL denote a read catalog, not mutable state

A module named `*Registry` or `*Catalog` SHALL be a read catalog satisfying `Catalog<T>`. Mutable
per-entity or per-session state SHALL NOT carry that naming. The existing `EntityRegistry` module —
a mutable state shim over `ChatStore` with an `activate`/`upsert`/`update` API — SHALL be renamed to a
state-store name (`EntitySessionStore`; the "Store" suffix avoids collision with the existing
`EntitySession` data-type already exported from that module) so the catalog vocabulary reliably means
"read lookup".

#### Scenario: Mutable session state is not named a registry

- **GIVEN** the per-entity session state formerly exported as `EntityRegistry`/`useEntityRegistry`
- **WHEN** the rename lands
- **THEN** it is exported under a state-store name (`EntitySessionStore`/`useEntitySessionStore`) with its API and behavior unchanged
- **AND** the existing `EntitySession` data-type export is left intact (the "Store" suffix avoids that collision)
- **AND** no `*Registry`/`*Catalog` export in the app has a mutate (`activate`/`upsert`/`update`) API.
