# Design — Shared Template lifecycle

## Current Extract surface (what we generalize)

| Layer | Today | Notes |
|---|---|---|
| Type | `ExtractionSchemaDef {id,name,categories[]}` → `SchemaCategoryDef {id,type,name,fields[]}` → `SchemaFieldDef {id,name,type,description,required?,instructions?,format?,identifiers?}` | `app/src/types/scenarios.ts` |
| Persistence | `extraction_schemas (id PK, groundx_username, name, schema_json JSON, created_at, updated_at)`; per-username index; `saveExtractionSchema`/list in both repos | `middleware/src/db/*Repository.ts` |
| Route | `POST /api/extraction-schemas`, gated `requireAuthenticatedUser` (anon→401) | `middleware/src/app.ts` |
| Client | `saveExtractionSchema({id,name,schema})` → `SaveExtractionSchemaResult`; `ExtractionSchemaApiError` | `app/src/api/extractionSchemas.ts` |
| Editing overlay | `PendingSchemaOverlay {addedFields, removedFieldIds, editedFields, pendingFieldProposals, pinnedSamples, focusedCategoryId}` + `SchemaFieldAddition/Edit/Proposal/ExtractionResult` | `app/src/contexts/ChatStoreContext/types.ts` |

## Target model

### `Template` (wire shape → `@groundx/shared`)

```ts
type TemplateKind = "extract" | "report";

interface TemplateBase {
  id: string;            // client-minted opaque id; reuse upserts. (Today's are
                         // `es-<uuid>`; UNCHANGED — migrated rows keep their ids.
                         // Don't assume a prefix; ids are opaque PKs.)
  kind: TemplateKind;
  name: string;          // authoritative (the DB row's name column)
  ownerUsername: string; // SERVER-ASSIGNED from the session — see security note
  createdAt: string;     // ISO, server-assigned
  updatedAt: string;     // ISO, server-assigned
}

// kind-discriminated body. Extract body == today's category/field tree;
// report body == ordered question-sections (smart-report owns the section shape).
type Template =
  | (TemplateBase & { kind: "extract"; body: ExtractBody })
  | (TemplateBase & { kind: "report";  body: ReportBody });

// What the CLIENT sends. Deliberately NOT a `Template`: no ownerUsername, no
// timestamps. The server assigns ownerUsername from the authenticated session
// and stamps the timestamps. This preserves today's safe behavior (the current
// save body is `{id,name,schema}` — username comes from the session, never the
// wire). parseTemplate must NOT be used to trust a client-supplied owner.
type TemplateSaveInput =
  | { id: string; kind: "extract"; name: string; body: ExtractBody }
  | { id: string; kind: "report";  name: string; body: ReportBody };
```

> **🔒 SECURITY — ownership is server-assigned, never client-trusted.** `ownerUsername` is on the
> read shape (`Template`) but MUST NOT be on the save wire (`TemplateSaveInput`). The save handler
> derives it from `session.groundxUsername` (exactly as `upsertExtractionSchema` does today) and
> ignores any owner-ish field in the body. Without this split, an authenticated user could write a
> template owned by another user (ownership spoofing / IDOR). A route test asserts a save persists
> under the SESSION's username regardless of body content.

> **Decision — NO `version` field/column in this change (corrected after review).** A `version`
> integer with no reader and no history table is unused machinery (anti-overengineering rule; #13
> defers version-history UI). The locked architecture's "versioned" is satisfied by the row being
> **updatable** (upsert on the client-minted `id`). A real `version` + `template_versions` table is
> added WHEN a consumer needs it — tracked in Deferred, not built speculatively. *(Deliberate
> deviation from the literal "versioned" word; flag for veto.)*

**Body shape — must match the EXISTING persisted blob (corrected after review).** `mergeOverlayForSave`
persists `{...manifestSchema, categories}` → the live `schema_json` is the FULL `ExtractionSchemaDef`
= `{id, name, categories}` (inner `id`/`name` redundant with the row columns). So the extract body is
validated **tolerantly**:

```ts
// known props validated; default (strip) drops the verbatim-copied legacy
// blob's redundant body-level id/name on parse WITHOUT failing — no transform
// migration needed. NOT .passthrough() — see the Phase-3 correction below.
const extractBodySchema = z.object({ categories: z.array(categorySchema) });
```

`categorySchema` validates `{id, type, name, fields: array}`; `templateFieldSchema` validates the
known field props. **Default strip** (not `.passthrough()`): an extra/not-yet-modeled prop does NOT
*reject* (it's dropped on parse), so a frontend field-shape addition still validates. `TemplateCategory`/
`TemplateField` = today's `SchemaCategoryDef`/`SchemaFieldDef` renamed (field shape unchanged).
`ReportBody` = `{ sections: TemplateSection[] }` defined by `smart-report`; this change reserves the
`report` arm but ships only `extract` wired end-to-end.

> **Decision — keep field/section bodies `kind`-specific, not a unified "item".** The two bodies
> genuinely differ (a field has `type/format/identifiers`; a section has `renderAs/question/
> variables`). Forcing one `TemplateItem` shape would be a lowest-common-denominator type that lies
> about both. The SHARED part is the lifecycle (id/persistence/overlay/auth), not the body
> schema. `body` is the discriminated escape hatch.

### Zod-as-source-of-truth — and what the server validates (corrected after review)

Define `templateSchema` (discriminated on `kind`) in `@groundx/shared`, type via `z.infer`. A
`parseTemplate(input): Template | null` sanitizer guards the boundaries (parallels `parseCitations`).

**The server stays loosely coupled to the body.** The contract validates the **envelope** (`id`,
`kind`, `name`, `ownerUsername`/timestamps on the read shape) + the body's **known core props** (a
field's `id/name/type/description`; a category's `id/name/fields`), with **default strip** key
handling. Net effect: a frontend field-shape **ADDITION** still validates (the extra prop is dropped,
not rejected — the BUG-2 coupling goal is met), while a **removal/retype of a core prop** is correctly
rejected; `parseTemplate` returns a real typed `Template` with no cast. `category.type` is a free
string (scenario-agnostic — NOT the legacy utility-specific enum), so loan/solar categories validate.
The legacy persisted blob's redundant body-level `{id,name}` are dropped on parse (strip), so the
verbatim copy-migration is sound.

> **Phase-3 correction — `.passthrough()` removed.** Phase 1 used `.passthrough()` to *preserve*
> unknown props, but its inferred type carries a `{[k:string]:unknown}` index signature, and the
> legacy `SchemaCategoryDef`/`SchemaFieldDef` **interfaces** can't be assigned to an index-signature
> type — which broke `mergeOverlayForSave`'s typed body. Switched to default strip: extras still don't
> *reject* (addition-tolerant), the types are clean, and since the shared schema is co-developed with
> the app there are no genuinely-unknown props that need preserving.

This retires the `schema: Record<string,unknown>` looseness in `SaveExtractionSchemaInput` and the
**two save-path casts** in `ExtractView` (`:100`, `:132`, `manifestSchema as unknown as Record`) —
they exist purely to fit the loose `schema` param, so a typed `body` removes them. (The **third**
cast, `:195` `wf.workflow as unknown as Record`, is the live-workflow→schema conversion — a SEPARATE
concern, NOT resolved here.)

### DB — `templates` table

```sql
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,           -- 'extract' | 'report' (validated in the row mapper)
  groundx_username VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  body_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX templates_user_kind_idx (groundx_username, kind, updated_at)
)
```

**Copy-migration (mysql only, idempotent + concurrent-safe, in `runMigrations`):** AFTER both
`extraction_schemas` and `templates` exist, `INSERT ... SELECT id, 'extract', groundx_username, name,
schema_json, … FROM extraction_schemas ON DUPLICATE KEY UPDATE id = id`. The `ON DUPLICATE KEY UPDATE
id = id` makes it a no-op on rows already present (idempotent) AND safe under **concurrent multi-pod
boot** (EKS replicas / rolling update both run `createSchema`) — a plain INSERT would throw on the
PRIMARY KEY race and CrashLoopBackOff the losing pod. The verbatim `schema_json → body_json` copy is
SOUND because `extractBodySchema` strip drops the legacy blob's redundant body-level `{id,name}` on parse (the `{id,name,categories}` blob parses
unchanged — no transform). `extraction_schemas` is left intact (deprecated). Guards/notes (corrected
after review):
- **memory repo: NO copy.** It starts empty each process — there is nothing to migrate. It simply uses
  a `templates` map in place of the old `extractionSchemas` map.
- **Existence guard:** the `INSERT…SELECT` reads `extraction_schemas`, so the Deferred "drop
  `extraction_schemas`" task MUST also remove this copy step (else startup breaks). Tied together in
  Deferred. Until then, both tables' `CREATE TABLE IF NOT EXISTS` run first, so the source always exists.
- **No copy-time validation (accepted):** a malformed legacy `schema_json` copies through and only
  fails `parseTemplate` on READ → that one template degrades to absent for the user. Acceptable
  (already-broken rows); the read-path validation is the single chokepoint, not the bulk copy.
- **🔴 MIGRATION-WINDOW HAZARD (found in the Phase-2 review) — the copy is a one-time SEED.**
  `ON DUPLICATE KEY UPDATE id = id` is a no-op on rows already present, so once a row is in `templates`
  the seed never refreshes it. Between a Phase-2 deploy and a *separate* Phase-3 deploy, the OLD route is still the
  writer (→`extraction_schemas`); an edit in that window lands in `extraction_schemas` but the seed
  won't re-copy it, so at the Phase-3 reader cutover `templates` serves the **stale pre-edit** row —
  silent data loss. **Required mitigation (Phase 3):** either (a) ship Phase 2 + Phase 3 in the SAME
  deploy (no window — natural here: monorepo, no external consumers), OR (b) Phase 3's cutover
  migration does a **final UPSERT-refresh** from `extraction_schemas` (catching window edits) BEFORE
  switching the reader/writer. The Phase-2 seed itself stays correct and becomes a harmless no-op
  post-cutover (all ids already present). Captured as the first Phase-3 cutover step.
- Row mapper validates `kind ∈ {extract,report}` + `parseTemplate(body_json)` on read (no as-cast —
  folds into the row-mapper-validation task in `core-data-model-hardening`).

### Overlay/proposal generalization (app)

`PendingSchemaOverlay` → `PendingTemplateOverlay` with the same fields (the overlay is already
body-agnostic enough: added items, removed ids, edits, proposals, pinned samples, focused group).
`SchemaFieldAddition/Edit/Proposal/ExtractionResult` → `TemplateItemAddition/Edit/Proposal/Result`.
For the `extract` kind the item IS a field (no behavior change); the `report` kind reuses the same
overlay machinery for sections. **The `ChatStore` action names** (`addSchemaField`,
`enqueueFieldProposal`, …) stay as Extract-specific thin wrappers over generic
`addTemplateItem`/`enqueueItemProposal` to avoid a churny rename of every call site in one change;
the generic methods are what Report calls. (A later cleanup can collapse the Extract-named wrappers.)

## Phased delivery (TDD, sequential)

1. **Shared `Template` contract** — `templateSchema`/`Template`/`parseTemplate` + `TemplateField`/
   `TemplateCategory` in `@groundx/shared`; build. *(failing contract test first.)*
2. **DB `templates` table + copy-migration** — DDL (no `version` column) + idempotent mysql copy from
   `extraction_schemas`; repo `saveTemplate`/`listTemplates(kind)`/`getTemplate` (memory map + mysql);
   row-mapper envelope+container validation. **Migrate the `saved_schemas` reader**: rename
   `listExtractionSchemasForUser` → `listTemplates(username, "extract")` across the repo interface
   (`types.ts:203`), both repos, AND its two call sites in `structuredHandler.ts` (`:200`, `:445` — the
   CF-04 "what schemas have I saved" chat reader). The save handler assigns `ownerUsername` from the
   session — `saveTemplate` takes a `TemplateSaveInput` (no owner). *(failing repo round-trip test +
   copy-migration idempotency + legacy-row-preserved + owner-from-session, first.)*
3. **Route + client together (flag-day, no alias)** — `POST /api/extraction-schemas` becomes `POST
   /api/templates`, AND the client (`extractionSchemas.ts`→`saveTemplate`/`TemplateApiError`,
   `useLiveExtractionSchema.ts`, `extractLiveData.ts`, `types/scenarios.ts`) switches in the SAME
   change. No dual-route window — there are no external API consumers (same monorepo), so an atomic
   cut is simpler and safer than an alias. Auth gate unchanged. Drop the `schema: Record<string,
   unknown>` looseness (typed `body`).
4. **Overlay generalization** — `PendingTemplateOverlay` + generic ChatStore actions; Extract-named
   wrappers delegate. `ExtractView`/`SchemaView` consume the generic overlay; remove the **two
   save-path** `manifestSchema as unknown as Record` casts (`:100`, `:132`). (The `:195` workflow cast
   is out of scope.)
5. **Extract green + closeout** — full Extract suite green (no behavior change), `validate --strict`,
   data-model.md updated, archive-ready. Report instantiation is the NEXT change (`smart-report`).

### Anon / in-flight template (scope clarification)
Only a **saved** template is a persisted `Template` row. The working schema an anon user edits is the
in-memory **overlay over the scenario manifest** (unchanged) — it never persists (save is 401-gated).
Report's anon preview follows the same rule: it renders from an in-memory template, not a DB row. This
change touches only the saved-Template lifecycle; the in-memory/anon editing path is unchanged.

## Risks / watch-items

- **Behavior-preservation on the Extract path** is the whole bar — every step keeps the Extract suite
  green; the migration is a refactor, not a feature. The copy-migration must be idempotent (re-run
  safe) and must not touch `extraction_schemas` rows.
- **Flag-day cut (steps 3)** — route + client switch atomically; no dual-route window (no external
  consumers). The risk is a missed call site; the failing-first route + Extract suite catch it.
- **`kind` column as bare VARCHAR** repeats the union-VARCHAR smell — mitigated by row-mapper
  validation now; the broader CHECK/ENUM task in `core-data-model-hardening` covers it generally.
- **Server stays body-loose** — `parseTemplate` validates envelope + container only, NOT field
  internals, so frontend field-shape changes don't force a middleware redeploy (preserves today's
  opaque-JSON coupling).
- **Behavior-preservation gate (named):** the migration must keep these existing tests green —
  `middleware/app.test.ts` (route + repo round-trip), `structuredHandler.test.ts` (saved_schemas
  reader), app `extractionSchemas.test.ts` (client) + `SchemaView.test.tsx` (view). That's a real
  round-trip gate, not a vacuous "suite green."
- **Capability relation:** `template-lifecycle` (NEW) owns the persistence/lifecycle;
  `onboarding-schema-editor` keeps the F3a editor-UI requirements (incl. its "Save gates on sign-in"
  requirement — the SAME gate, stated from the UI side). Cross-referenced so the save-gate doesn't
  drift into two divergent specs.
- **Naming:** the domain `Template` (the questions artifact, here) is DISTINCT from
  `components/_template/` (the widget-scaffold archetype, `Template.tools.ts`/`Template.test.tsx`).
  No type collision (the duplicate-export-name guard won't fire), but name things in code to avoid
  conflation (e.g. `TemplateRecord`/`templateSchema`, not a bare `Template` component).
- **`smart-report` coupling**: this change ships only the `extract` arm wired; the `report` arm of
  the discriminated `body` is reserved but exercised by `smart-report`. The shared-lifecycle test
  asserts a `report`-kind Template round-trips through persistence so the seam is proven before
  smart-report builds on it.
