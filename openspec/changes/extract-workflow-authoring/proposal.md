## Why

`analyze-and-chat-ux` renders the extracted object read-only. The next step is letting the user
**change what gets extracted** — the output fields and groups they want. In GroundX terms that
means authoring a valid **v1 workflow** and writing it back with `updateGroundXWorkflow`.

**This app IS "Studio."** `studio.eyelevel.ai` does not exist yet — we are building it. So we OWN
the schema→workflow build; we cannot defer it to an external Studio. The harness
`groundx-extraction-workflows` skill is the source of truth for that build, and its
`templates/compile_workflow.py` (2,106 lines) is the **real compiler**: it renders each step's
extraction prompt, finalizes routing, enforces the ≤30-field / pseudo-group / one-`charges` /
one-`meters` rules, and emits the exact `{customSteps, outputRoutes, leafFields, extract, steps}`
body that `PUT /v1/workflow` accepts. It also requires `workflow.custom_steps` and
`workflow.agent_chain` in its input YAML.

A pure-TypeScript `schemaToWorkflow` that re-emits those structures is a **covert fork** of that
compiler — it would drift from the plugin the moment the plugin changes, violating one-source-of-
truth (principle 1/6). So we **run the real compiler, never reimplement it**, and we run it
**out-of-process** — Node stays Node.

**Three clean lanes** (mirroring the harness boundary in `4_sdk_integration.md §5`):
1. **The editor produces the YAML source** — the app scaffolds a compiler-ready YAML from the
   user's desired output schema, following the harness authoring *conventions*
   (`2_schema_design.md`): deterministic **structure** only — step-kind by shape, `_pseudo_groups`
   splitting, `agent_chain` roles, per-field prompt blocks. It does **not** render prompts or
   finalize routing.
2. **A Python build service compiles the YAML → workflow JSON** — running the *synced, real*
   `compile_workflow.py` + GroundX SDK. This is where prompt rendering, routing finalization,
   ≤30/pseudo validation, and `outputRoutes`/`leafFields` all happen — inside the real compiler,
   not in our code. The build output is a **portable artifact** (plain workflow JSON).
3. **The Node app PUTs the JSON** via `updateGroundXWorkflow` and attaches it to the bucket.

## What Changes

- **Extend the app `Workflow` type + `WorkflowInput`** (and the `@groundx/shared` mirror +
  `data-model.md` reconciliation matrix) with `leafFields`, `customSteps`, `outputRoutes` — the
  structures `GET`/`PUT /v1/workflow` actually carry. Today `Workflow`
  (`app/src/api/entities/sdkTypes.ts:207`) and `WorkflowInput`
  (`app/src/api/entities/groundxWorkflowsEntity.ts:14`) model only `{steps, extract}`. The engine
  `apiKey`/`baseURL` that can appear in the `steps` blob MUST be **redacted** from the round-trip —
  never PUT back and never logged.
- **Re-add the harness sync of `templates/`** into the build service. (This reverses the earlier
  "no template sync" over-correction: because we run the real compiler, we MUST vendor it.) The
  sync copies `compile_workflow.py` + `requirements.txt` + the referenced GroundX SDK into the
  build-service image; a guard test asserts the executable templates are present after sync.
- **A Python build service/job** — `compile(yaml) → {workflowJson, errors}` — running the synced
  `compile_workflow.py` + GroundX SDK. It ships as a **separate service/job image** (a Python
  runtime + `requirements.txt`, its own Dockerfile + Helm chart) — **not** inside the Node
  middleware process. Structured compiler errors are surfaced to the editor.
- **An app-side YAML-scaffold module** — deterministic, encoding the harness authoring
  *conventions* for **structure** (step-kind, pseudo-split, routing shape, per-field prompt blocks,
  `agent_chain` roles, locked charge names, `extraction_policy_version: v1`, business-logic
  metadata where the shape needs it). It does NOT render prompts or finalize routing — that is the
  compiler's job.
- **A schema-authoring UI over the recursive render** (from `analyze-and-chat-ux`): a
  `Values | Edit schema` toggle. In edit mode the user changes the **desired output schema** —
  add/rename/remove groups and fields, set field types, descriptions, identifiers, instructions.
  The user never sees raw YAML, `_pseudo_groups`, `outputRoutes`, or `agent_chain`. Best-practice
  guidance is surfaced inline from the synced `references/`.
- **Save is authenticated-only.** On commit the app: scaffolds the YAML → calls the build service
  → PUTs the returned workflow JSON via `updateGroundXWorkflow` using the customer key threaded
  server-side as `session.groundxApiKey`. Anonymous/onboarding sessions are read-only — the
  `Edit schema` toggle is locked behind sign-in, reusing the existing "🔒 Locked behind sign-in"
  Extract UX (`Extract.tsx:1470`). No anon draft.
- **A separate "Re-run extraction" button.** Refreshing results re-ingests the doc(s) (minutes,
  overwrites data) and is triggered **only** by an explicit user action — never automatically on
  save.

Out of scope: the read-only render / hover / thinking / polish (those are `analyze-and-chat-ux`);
changing the harness itself; an in-UI accuracy/score loop.

## Capabilities

### New Capabilities
- `extract-workflow-authoring`: author a desired extraction schema in-UI, scaffold a compiler-ready
  YAML from it, compile that YAML to workflow JSON via the **real harness compiler run
  out-of-process in a Python build service**, and save it (authenticated-only) via
  `updateGroundXWorkflow`, with a separate explicit re-extraction action.

### Modified Capabilities
- `ui-views`: F3 Extract gains the `Values | Edit schema` toggle and the schema-authoring surface
  over the recursive render.

## Impact

- **App types**: `Workflow` (`sdkTypes.ts`) + `WorkflowInput` (`groundxWorkflowsEntity.ts`) gain
  `leafFields`/`customSteps`/`outputRoutes`; `@groundx/shared` + the `data-model.md` reconciliation
  matrix updated to match; engine `apiKey`/`baseURL` redacted from the round-trip.
- **Harness sync**: `templates/` (`compile_workflow.py` + `requirements.txt` + GroundX SDK) synced
  into the build service; guard test asserts presence.
- **Build service (new, Python, out-of-process)**: `compile(yaml) → {workflowJson, errors}` running
  the synced real compiler; its own Dockerfile + Helm chart/job; structured errors surfaced.
- **App logic (TS)**: the deterministic YAML-scaffold module (structure only); a lightweight
  pre-PUT sanity check (`validateWorkflowConsistency`) on the compiler's OWN output.
- **App UI**: the `Edit schema` authoring surface over the recursive render; the save-tier wiring
  (anon read-only / authed commit); the explicit "Re-run extraction" action.
- **Middleware**: the authed commit path (scaffold → build service → `updateGroundXWorkflow` with
  `session.groundxApiKey`) and the re-extraction (re-ingest) trigger; secret redaction/scrubbing.
- **Guards/contracts**: shared `leafFields`/`customSteps`/`outputRoutes` types; a synced-templates
  presence guard; a YAML-scaffold structure test; apiRouteContract tests for the save + re-extract
  routes; the reconciliation-matrix drift guard.

## Conformance to core architectural decisions

- **Principle 1 (composable over forked / run-not-fork) — one source of truth.** The workflow build
  is the harness `compile_workflow.py`, **run** (synced + executed out-of-process), never
  reimplemented in TypeScript. Removing the pure-TS `schemaToWorkflow` builder closes the covert
  fork. The only app-side logic is deterministic YAML *structure* scaffolding (an editor concern,
  not a compiler) plus a lightweight sanity check on the compiler's own output.
- **Principle 5 (done = user-visible + round-trip).** Done is a live authenticated user editing the
  desired schema, saving, and the workflow JSON — compiled by the real compiler — landing on the
  bucket via `updateGroundXWorkflow`; then the separate button re-ingesting. Every persisted field
  (`leafFields`/`customSteps`/`outputRoutes`) round-trips through GET → edit → build → PUT.
- **Principle 6 (single planning surface).** This OpenSpec change is the only planning surface; no
  rival design docs. The corrected model matches the `cross-plan-execution-order.md` wave entry
  (editor → YAML scaffold → real-harness build → PUT).
