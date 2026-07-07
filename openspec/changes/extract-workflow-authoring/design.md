# Design — extract-workflow-authoring

## Principle: run the real compiler, out-of-process — never reimplement it

This app IS Studio, so we own the schema→workflow build. The build is the harness
`groundx-extraction-workflows` compiler (`templates/compile_workflow.py`, 2,106 lines) — the real,
living tool that renders each step's extraction prompt, finalizes routing, enforces the
≤30-field / pseudo-group / one-`charges` / one-`meters` rules, and emits the exact
`{customSteps, outputRoutes, leafFields, extract, steps}` body `PUT /v1/workflow` accepts. A
TypeScript re-emitter of those structures is a covert fork of that compiler and drifts from the
plugin (one-source-of-truth, principle 1/6). We therefore **sync and run the real compiler**, and
run it **out-of-process** so Node stays Node.

## 1. Three clean lanes (mirroring the harness boundary, `4_sdk_integration.md §5`)

```
(a) Editor / YAML scaffold        (b) Python build service          (c) Node app
    (app-side, deterministic)         (synced real compiler)            (Node request loop)
──────────────────────────────    ───────────────────────────────   ─────────────────────────
desired output schema           →  compile(yaml) → workflow JSON   →  PUT /v1/workflow
  (groups + fields)                  · renders step prompts             (updateGroundXWorkflow,
scaffold compiler-ready YAML         · finalizes outputRoutes            session.groundxApiKey)
  · step-kind by shape               · ≤30 / pseudo validation       →  attach to bucket
  · _pseudo_groups split             · emits leafFields             →  (separate) re-ingest
  · agent_chain roles                · portable JSON artifact
  · per-field prompt blocks
  STRUCTURE ONLY — no prompt
  rendering, no routing finalize
```

- **(a)** is an *editor* concern: turn the user's desired output into a compiler-ready YAML by
  deterministic structure-building. It encodes harness *conventions*, not the compiler's logic.
- **(b)** is the *compiler*: the real `compile_workflow.py` + GroundX SDK, run out-of-process. All
  prompt rendering, routing finalization, and structural validation live here.
- **(c)** is *Node*: it PUTs the portable workflow JSON and (separately, on explicit action)
  re-ingests. Node never compiles and never renders prompts.

## 2. The workflow shape (verified live, 2026-07-06)

`GET /v1/workflow/{id}` returns compiled structured JSON:

```
{ workflowId, name, chunkStrategy, sectionStrategy,
  steps, extract,                       // extract._groundx_persisted_extract → final group names + _pseudo_groups
  customSteps, outputRoutes,            // execution definition + routing (compiler output)
  leafFields[] }                        // { finalPath:"/group/field", workflowGroup, workflowField, outputKey, fieldType }
```

`PUT /v1/workflow/{id}` (`updateGroundXWorkflow`) accepts the overlay
`{customSteps, extract, leafFields, outputRoutes, steps, chunkStrategy, sectionStrategy, name}`.

The app `Workflow` type (`sdkTypes.ts:207`) and `WorkflowInput` (`groundxWorkflowsEntity.ts:14`)
currently model only `{steps, extract}`; both gain `leafFields`, `customSteps`, `outputRoutes`
(plus the `@groundx/shared` mirror + reconciliation-matrix row). This is a shared prerequisite —
`analyze-and-chat-ux`'s render reads the schema, so the type must carry these structures for the
authoring round-trip.

**Secret hygiene.** The engine config (`EXTRACT_MODEL_*`) can surface an `apiKey`/`baseURL` inside
the `steps` blob returned by GET. Those MUST be redacted before we hold or PUT the overlay — never
written back, never logged (principle 0). The compiler reads engine config from the build service's
own `.env`, not from the round-tripped JSON.

## 3. The desired-schema model (what the editor edits)

The editor's model is the final output shape only:

- **Group** = a final output group with a name and an output shape:
  `object` (appears once per document) · `records` (a repeating record type) · `summary` (a second
  repeating record type).
- **Field** (per group): `name`, `description`, `identifiers` (1–3 label hints), `instructions`
  (one rule per line), `type` (`str` / `int` / `float` / `[int,float]`), optional `format`.
- Depth is capped at `/group/field`; nested data is modelled as flat fields or JSON-encoded
  strings.

The user never sees `workflow_step`, `outputRoutes`, `_pseudo_groups`, `custom_steps`, or
`agent_chain`.

## 4. The YAML-scaffold module (app-side, deterministic — structure only)

`scaffoldWorkflowYaml(desiredSchema) → yamlSource` — a pure TS function that turns the desired
output schema into a **compiler-ready YAML** following the harness authoring conventions
(`2_schema_design.md`). It builds STRUCTURE; it does NOT render prompts and does NOT finalize
routing (that is the compiler's job in §5). It MUST:

- Emit top-level `extraction_policy_version: v1`.
- **Choose step-kind by output shape:** `object` → `instruct` (role `statement`); `records` →
  `keys` (role `charges`); `summary` → `summary` (role `meters`). At most **one** `charges` and
  **one** `meters` group; every other group is `statement`. `instruct` is invalid at `document`
  level.
- Put executable step definitions under top-level `workflow.custom_steps`, and assign each direct
  workflow group / pseudo group to a step via group-level `workflow_step:` (never field-level).
- **Split a final group that exceeds 30 fields** into `_pseudo_groups` (workflow-only groups that
  route back to the same final group via `path`) — not into more final groups, never one step per
  field. Output keys match `^[a-z][a-z0-9_]{0,63}$`.
- Declare `workflow.agent_chain` — the runtime schedule referencing workflow/pseudo group names
  with the internal role names (`reconcile_statement` → `qa_statement` → `save_statement`;
  `reconcile_charges` → `save_charges`; `reconcile_meters` → `qa_meters` → `save_meters`).
- Emit each field's prompt block (`description` / `identifiers` / `instructions` / `type` /
  optional `format`).
- Use the platform-locked charge field names `charge_amount` and
  `charge_description_as_printed` for `records`/charges groups.
- Emit business-logic metadata (`match_attrs`, `unique_attrs`, `exclude_dict_attrs`, etc.) on final
  groups where the shape needs it (e.g. charges-under-meters).

This is deterministic and unit-testable against a fixture desired-schema → expected YAML structure.

## 5. The Python build service (out-of-process, real compiler)

A **separate Python service/job** exposing `compile(yaml) → { workflowJson, errors }`:

- Runs the **synced** `compile_workflow.py` + `requirements.txt` (`groundx[extract]`,
  `python-dotenv`, `PyYAML`) + the referenced GroundX SDK. The templates are vendored via the
  harness sync (§7); a guard test asserts they are present.
- Deployed honestly as its **own image** — a Python runtime + `requirements.txt` — with a Dockerfile
  and a Helm chart/job. It is **not** a `child_process` scrape inside the Node middleware, and
  Python is **not** added to the Node image. (The user approved "Python if it's not a hack" — this
  is the clean, out-of-process, real-compiler version.)
- Reads engine config (`EXTRACT_MODEL_*`) from its own environment; needs no real GROUNDX key to
  compile (the compiler makes no API calls).
- Surfaces **structured compiler errors** (e.g. `instruct`-at-document, >30-field group without a
  pseudo split, duplicate `charges`/`meters`) back to the editor.

## 6. `validateWorkflowConsistency` — lightweight pre-PUT sanity check (NOT a substitute for compiling)

Before `PUT`, the app runs a small sanity check on the **compiler's own output**: each
`outputRoutes` record has exactly one matching `leafFields` record (matched on `finalPath` /
`workflowGroup` / `workflowField` / `stepName` / `level` / `outputKey`). It guards against a
corrupt artifact reaching the API. It does **not** re-derive or re-emit the workflow — that would
re-introduce the fork.

## 7. Harness template sync (re-added)

Because we run the real compiler, we MUST vendor it. Sync `templates/compile_workflow.py`,
`templates/requirements.txt`, and the referenced GroundX SDK into the build-service image, alongside
the `references/` used for editor guidance copy. A guard test asserts the executable templates are
present after sync (reversing the earlier "no template sync" claim).

## 8. Authoring UX (over the recursive render)

Reuses the `analyze-and-chat-ux` recursive tabs+tree. A `Values | Edit schema` toggle switches the
panel into edit mode:

- Add / rename / remove groups; add / remove fields; set each field's `type`, `description`,
  `identifiers`, `instructions`, `format`; set a group's output shape (`object`/`records`/
  `summary`).
- **Best-practice guidance** is surfaced inline from the synced `references/` — a group
  approaching/exceeding 30 fields shows the pseudo-split guidance; charges guidance reminds of the
  locked field names. This is advisory copy sourced from `references/`, not hard-coded rule logic.

The UI edits the desired schema only; the scaffold + build run on save, not per keystroke.

## 9. Save (authenticated-only) + separate re-extraction

- **Anonymous / onboarding — read-only.** The `Edit schema` toggle is locked behind sign-in,
  reusing the existing "🔒 Locked behind sign-in" Extract UX (`Extract.tsx:1470`, `SchemaView.tsx`).
  No editor, no save, no draft.
- **Authenticated — commit.** On save the app: `scaffoldWorkflowYaml` → build service `compile` →
  `validateWorkflowConsistency` on the returned JSON → `updateGroundXWorkflow` (`PUT /v1/workflow`)
  using `session.groundxApiKey`, with engine secrets redacted. Writes the workflow definition only;
  does not touch already-extracted data.
- **Re-run extraction (separate, explicit).** A distinct button re-ingests the doc(s) — minutes of
  latency, overwrites the persisted output — with a confirm + "re-extracting…" state. Triggered
  **only** by the user, **never** automatically on save.

## Decisions

- **Run the real compiler out-of-process; do NOT reimplement it in TS.** The pure-TS
  `schemaToWorkflow` builder is removed as a covert fork. The Python build service runs the synced
  real `compile_workflow.py`.
- **Re-sync the harness `templates/`.** Reverses the earlier "no template sync" over-correction —
  running the real compiler requires vendoring it.
- **`Workflow` type extension is a prerequisite, shared with `analyze-and-chat-ux`.** Land the
  `leafFields`/`customSteps`/`outputRoutes` type + reconciliation-matrix change so both changes read
  one type.
- **Scope by measured demand.** The first cut covers the shapes the scenarios need now — statement
  (`instruct`), meters (`summary`), charges (`keys`), charges-under-meters. Richer reconcile/QA
  `agent_chain` roles and business-logic metadata beyond those are a forward extension, tracked, not
  silently emitted.

## Risks

- **Build-service infra is new.** A second (Python) deployable adds an operational surface.
  Mitigation: it is a stateless compile job with its own image + Helm chart; it makes no API calls;
  engine config is env-driven; failures surface as structured errors to the editor.
- **Harness compiler drift.** The compiler evolves. Mitigation: we **run** the synced compiler
  rather than mirror its logic, so a plugin update flows through the sync — the guard test asserts
  the synced templates are present.
- **Secret leakage via the `steps` blob.** Engine `apiKey`/`baseURL` can ride in GET output.
  Mitigation: redact before hold/PUT/log; the compiler reads engine config from its own `.env`.
