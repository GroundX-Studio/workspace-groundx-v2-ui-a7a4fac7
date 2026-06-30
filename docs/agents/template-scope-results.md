# Template + Scope + Results

Locked 2026-05-29. Foundational. Extract and Report are the SAME meta-pattern — build Report on
Extract's objects/DB/lifecycle, do not fork.

## The meta-pattern

**Result = Template + Scope + generated answers.**

- **Template** — a set of *questions*, **scope-independent**, **saved + updatable** (NO version field — versioning deferred).
  - Extract template = a **schema** (fields/questions).
  - Report template = **report sections** (questions + `renderAs`).
- **Scope** — a `ContentScope`. Independent of the template (one template re-runs over many scopes).
- **Generated answers** — Template applied over Scope via RAG (search + LLM completion), grounded +
  cited (WF-06b, shared `CiteChip`). Extract → field values. Report → rendered sections.

Extract and Report SHALL share data objects, DB tables, lifecycle, and lifecycle management. A
report-template type that re-implements the extract-schema lifecycle is a bug — unify them.

### Current reality (what is shipped vs. target)

- **Shipped in `@groundx/shared`:** the unified `Template` (read shape: `id, name, ownerUsername,
  createdAt, updatedAt, kind: "extract"|"report", body`), `TemplateSaveInput`, the unified
  `ContentScope` + composable `ScopeFilter`, and `compileScopeFilter`. NOTE: the shared `Template`
  carries **no `version`** and **no `scope`** (Template is scope-independent; scope is passed at run time).
- **Shipped persistence:** the `templates` table (kind discriminator, `body_json`, no `version`
  column — versioning deferred) with a copy-migration from `extraction_schemas`, behind
  `POST /api/templates`. **Extract is migrated** onto this shared template lifecycle.
- **Still a target:** the shared **generated-result** object — unifying Extract's `ExtractedFieldValue`
  with the report `RenderedSection` — is owned by the `core-data-model-hardening` change and is NOT yet
  built. The **ScopedViewerWidget base** is also still a target: there is **no widget base class today**
  (test-enforced); it remains a props-interface + registry to formalize.

## ContentScope — `filter` is a composable modifier

Supported shapes (filter orthogonal to all): `bucket` · `bucket+filter` · `documents[]` ·
`documents[]+filter` · `group` · `group+filter`.

Doc-org (per `groundx-studio-harness`): **bucket == workspace · project/portfolio/fund/folder ==
doc filter-field values · group == cross-bucket · document == a file.** In this scaffold every demo
sample is in ONE shared workspace bucket, distinguished by a **project filter value** → per-sample
scope is **`bucket + project filter`** (the opening display context). Do not hardcode a mandatory
filter or forbid a shape; support the union and let context select.

## ScopedViewerWidget — the four main viewer widgets

**PdfViewer · Extract · SmartReport · Integrate.** Each:
1. takes **`scope: ContentScope`** and **adapts when scope changes** (re-render, not a remount fork);
2. exposes one **`show_*` canvas-dispatch tool** (allowlisted `show_`); editable ones add
   `show_*_edit` (`show_extraction_edit`, `show_smart_report_edit`);
3. obeys the base widget contract (viewer-widgets/ slot, README, sibling test, tokens) + a required
   **scope** — today the contract is the `mode` prop (shipped); the mode→role/scope flip is in-flight
   via `widget-role-access`, so build NEW work against `role` + required `scope`;
4. is enforced by a contract test (extend `widget-contract.test.ts` or add `scoped-viewer-contract.test.ts`).

## Tool taxonomy

- **Canvas-dispatch `show_*`** — one per ScopedViewerWidget; moves canvas + carries scope.
- **Template-mutation (builder)** — operate on a template (schema OR report template; shared family):
  `propose_`/`accept_`/`reject_`/`edit_`/`delete_`/reorder field|section, set scope, `run_`. On the
  builder surfaces (f3a / f4a).
- **Content/action** — `search_groundx`, `pin_to_report` (+ target-template UX), run/render.
- **Read** — `open_document`, `jump_to_page`.

Every tool mirrors app `*.tools.ts` + middleware `SERVER_TOOL_CATALOG`, drift guard green. Names use
the allowlisted verb set (+ `show_`).

## Locked behaviors

- **Pin → template:** no auto-create; present "existing template or new?" + explicit create/edit methods.
- **Anon/gate:** Report mirrors Extract — anon previews; Save/Export/BYO gate.
- **CiteChip** reused wherever citations appear.
- **Report available for all scenarios**; pill always reachable. `f4` render, `f4a` builder.
- Parked: auto-variable inference (#12), version-history UI (#13).
