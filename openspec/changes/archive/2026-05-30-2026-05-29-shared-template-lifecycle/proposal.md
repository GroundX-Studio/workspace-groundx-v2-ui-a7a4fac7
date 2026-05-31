# Shared Template lifecycle — generalize the Extract schema into a Template that Report reuses

## Why

Per the locked **Template + Scope + Results** architecture, Extract and Report are the SAME
meta-pattern: a **Template** (an ordered set of question/field items — scope-independent, updatable,
versioned) applied over a `ContentScope` to produce generated results. Today only the Extract half
exists, named `ExtractionSchema*`, with its own persistence (`extraction_schemas` table), client
API, and editing overlay. Report cannot be built without forking all of that — which the
no-onboarding-duplicates and no-fork rules forbid.

This change factors the Extract surface into a **shared `Template` lifecycle** (types + persistence
+ overlay/proposal family) and **migrates Extract onto it with no behavior change**, so Report can
instantiate the same lifecycle with section-questions instead of forking. It is a **prerequisite
shared by two epics** (`core-data-model-hardening` carries the foundation bullet; `smart-report`
Phase 2 consumes it) and is sized past a single WIP slot, so per the delivery-discipline "splittable
prerequisite" rule it gets its own change. The Template bullets are MOVED here from both epics
(single home; see "Tickets moved").

## What

- A `Template` read type: `{ id, kind: "extract" | "report", name, body, ownerUsername, createdAt, updatedAt }`,
  and a separate `TemplateSaveInput` `{ id, kind, name, body }` — the client wire shape carries **no
  `ownerUsername`/timestamps**; the server assigns the owner from the session (🔒 ownership is never
  client-trusted, preserving today's behavior) and stamps timestamps.
  `body` is `kind`-discriminated — `extract` body = the current `{id,name,categories}` blob (validated
  tolerantly so the legacy shape parses); `report` body = ordered question-`sections`. The **wire shape
  lands in `@groundx/shared`** (consistent with `Citation`/`ContentScope`), but the **server validates
  only the envelope + body container, not field internals** — preserving today's opaque-body coupling
  so frontend field-shape changes don't force a middleware redeploy.
- A `templates` DB table (`kind` column; **no `version` column** — see decision) replacing
  `extraction_schemas` as the durable store. **Additive, reversible migration**: create `templates`,
  one-shot copy existing `extraction_schemas` rows in as `kind='extract'` (mysql only; verbatim copy is
  sound because the body schema is `.passthrough()`), leave `extraction_schemas` in place (deprecated,
  swept in a later change). No data loss regardless of deploy state.
- A shared editing-overlay family: `PendingSchemaOverlay` + `SchemaFieldAddition/Edit/Proposal/
  ExtractionResult` generalized to `PendingTemplateOverlay` + `TemplateItem*` (item = field OR
  section).
- **Extract migrated onto the shared lifecycle** — Extract still works, all Extract tests green —
  BEFORE Report is built on it.

## Migration decision (made)

**New `templates` table + copy-migrate + deprecate `extraction_schemas`.** Chosen over (a) in-place
ALTER/rename and (b) code-only generalization because it is the only option that is both clean (no
misleading table name, a real `kind` column) and safe without assuming the deployed DB has
no rows (the copy preserves any existing rows; the old table stays until a deliberate sweep).
**Versioning**: NO `version` column in this change. A version integer with no reader and no history
table is unused machinery (anti-overengineering rule; smart-report #13 defers version-history UI).
The locked architecture's "versioned" is satisfied by the row being **updatable** (upsert on the
client-minted `id`); a real `version` + `template_versions` table is added when a consumer needs it.
*(Deliberate deviation from the literal "versioned" word — flag for veto.)* No `/api/extraction-schemas`
alias either: route + client cut over atomically (flag-day), since there are no external API consumers.

## Conformance to core architectural decisions

- **No fork**: Extract migrates onto the shared lifecycle; Report instantiates the SAME objects/DB/
  lifecycle. Enforced by the migrated Extract suite staying green + a shared-lifecycle test.
- **Wire contracts in `@groundx/shared`**: Template's cross-boundary shape joins `Citation`/`ContentScope`.
- **Scope-independent**: a Template carries no scope; scope is supplied at render/extract time (the
  `ContentScope` work from inc. 3).
- **Auth parity**: save stays gated on `requireAuthenticatedUser` (anon → 401 → "sign in to save"),
  unchanged for Extract; Report inherits the same gate.

## Tickets moved under this change / closed where they previously existed

- `core-data-model-hardening` → "Shared Template lifecycle `[D]`" (3 bullets) → MOVED here. That
  section now points to this change.
- `smart-report` → Phase 2 "Factor a shared `Template` lifecycle layer" → now CONSUMES this change
  (the factoring happens here; smart-report instantiates the result).
- **NOT moved**: the "Shared generated-result shape `[D]`" task (`ExtractedFieldValue` ↔
  `RenderedSection`) stays in `core-data-model-hardening` — it's the **Result** half of
  Template+Scope+Results, a sibling this change *unblocks* but does not contain. This change ships
  the Template (questions) half only.

## Dependencies

- **Done**: `@groundx/shared` package (B1), unified `ContentScope` (B1 inc. 3) — Template renders over it.
- **Blocks**: `smart-report` Phase 2+; the `core-data-model-hardening` generated-result-shape task.

## Out of scope

- The Report render/builder UI (that's `smart-report`).
- Version-history UI / a `template_versions` table.
- Dropping `extraction_schemas` (deferred sweep; tracked).
- `ApiError` base refactor of `ExtractionSchemaApiError` (tracked in `core-data-model-hardening`;
  this change renames it to `TemplateApiError` but does not re-parent it).

## Affected

`@groundx/shared`; app `api/extractionSchemas.ts`, `useLiveExtractionSchema.ts`, `extractLiveData.ts`,
`ChatStoreContext` (overlay/proposal), `ExtractView`/`SchemaView`, `types/scenarios.ts`; middleware
`db/*Repository.ts` (templates table), `app.ts` (route), `types.ts`, `structuredHandler.ts`.
