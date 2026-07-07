## ADDED Requirements

### Requirement: The app SHALL model the full v1 workflow shape

The app `Workflow` type and `WorkflowInput` MUST include `leafFields`, `customSteps`, and
`outputRoutes` — the structures `GET /v1/workflow/{id}` returns and `PUT /v1/workflow/{id}`
accepts — in addition to `steps` and `extract`. The `@groundx/shared` mirror and the
`data-model.md` reconciliation matrix MUST carry the same shape. Any engine `apiKey`/`baseURL` that
appears in the `steps` blob MUST be redacted from the round-trip — never written back on `PUT` and
never logged.

#### Scenario: A fetched workflow round-trips its structures

- **WHEN** the app reads a `GET /v1/workflow/{id}` response
- **THEN** the parsed `Workflow` retains `leafFields`, `customSteps`, and `outputRoutes`
- **AND** those fields are accepted by `WorkflowInput` for a subsequent `PUT`.

#### Scenario: Engine secrets are stripped from the round-trip

- **WHEN** a fetched workflow's `steps` blob carries an engine `apiKey` or `baseURL`
- **THEN** those values are redacted before the app holds or PUTs the overlay
- **AND** they never appear in logs.

### Requirement: The app SHALL scaffold a compiler-ready YAML from the desired schema

The app MUST let the user author a **desired output schema** (groups and fields) and MUST scaffold a
compiler-ready YAML from it, following the harness authoring conventions for **structure only** —
step-kind by output shape, `_pseudo_groups` splitting, `workflow.custom_steps`, `workflow.agent_chain`,
per-field prompt blocks, locked charge names, and `extraction_policy_version: v1`. The scaffold MUST
NOT render extraction prompts and MUST NOT finalize routing — those are the compiler's job. The user
MUST NOT be required to edit raw YAML or routing internals.

#### Scenario: Step kind is chosen from the group's output shape

- **WHEN** the desired schema declares a group as `object`, `records`, or `summary`
- **THEN** the scaffold assigns step kind `instruct` (statement), `keys` (charges), or `summary`
  (meters) respectively under `workflow.custom_steps`
- **AND** at most one `charges` group and one `meters` group exist; all other groups are
  `statement`.

#### Scenario: An oversized group scaffolds pseudo-groups

- **GIVEN** a final group whose desired schema exceeds 30 fields
- **WHEN** the scaffold runs
- **THEN** it splits the group into `_pseudo_groups` that route back to the same final group via
  `path`
- **AND** it does NOT create additional final groups and does NOT emit one workflow step per field.

#### Scenario: Structure and field anatomy follow the harness conventions

- **WHEN** the scaffold emits the YAML
- **THEN** each group declares group-level `workflow_step`, each direct field declares a
  `workflow_output_key` matching `^[a-z][a-z0-9_]{0,63}$`, pseudo fields use the key plus a `path`,
  and `workflow.agent_chain` is present
- **AND** `records` (charges) groups use the platform-locked field names `charge_amount` and
  `charge_description_as_printed`
- **AND** no output field is nested deeper than `/group/field`.

### Requirement: The app SHALL compile the YAML with the real harness compiler out-of-process

The app MUST compile the scaffolded YAML into workflow JSON by running the **synced, real** harness
`compile_workflow.py` in a **Python build service/job that runs out-of-process**, and MUST NOT
reimplement the compiler in TypeScript, MUST NOT run Python inside the Node middleware process, and
MUST NOT scrape the compiler via an in-process `child_process`. The build service MUST return the
portable workflow JSON, or structured compiler errors surfaced to the editor.

#### Scenario: A valid YAML compiles to workflow JSON

- **WHEN** the build service compiles a scaffolded YAML
- **THEN** it runs the synced real `compile_workflow.py` and returns workflow JSON containing
  `customSteps`, `outputRoutes`, and `leafFields`.

#### Scenario: A rejected YAML surfaces a structured error

- **WHEN** the YAML violates a compiler rule (for example `instruct` at document level or a
  >30-field group without a pseudo split)
- **THEN** the build service returns a structured error and no workflow JSON is PUT.

### Requirement: The synced harness compiler templates SHALL be present

The build service MUST vendor the synced harness `templates/` — `compile_workflow.py`,
`requirements.txt`, and the referenced GroundX SDK — and a guard MUST assert the executable
templates are present after sync.

#### Scenario: The executable templates are present after sync

- **WHEN** the synced-templates guard runs
- **THEN** `compile_workflow.py` and `requirements.txt` are present in the build service.

### Requirement: The app SHALL sanity-check the compiler output before save

Before any `PUT /v1/workflow`, the app MUST verify that each `outputRoutes` record in the
**compiler's own output** has exactly one matching `leafFields` record (matched on `finalPath`,
`workflowGroup`, `workflowField`, `stepName`, `level`, and `outputKey`), and MUST reject a corrupt
artifact rather than write it. This check MUST NOT re-derive or re-emit the workflow.

#### Scenario: An inconsistent compiler output is rejected

- **WHEN** the compiler output has an `outputRoutes` record with no matching `leafFields` record
- **THEN** the app rejects the artifact and does not call `updateGroundXWorkflow`.

### Requirement: The editor SHALL surface harness best-practice guidance

The editor MUST surface guidance sourced from the synced harness `references/` while the user edits
the desired schema — including the pseudo-group split when a group approaches or exceeds 30 fields
and the platform-locked charge field names — as advisory copy rather than hard-coded rule logic.

#### Scenario: An oversized group prompts a pseudo-group split

- **GIVEN** a group being edited that exceeds the harness's 30-fields-per-group limit
- **WHEN** the user adds another field
- **THEN** the editor surfaces the harness's split-into-pseudo-groups guidance.

### Requirement: Schema editing and save SHALL be authenticated-only

Editing and saving the schema MUST be gated behind sign-in. In an **anonymous** (onboarding) session
the editor MUST be disabled — the panel is read-only and the `Edit schema` toggle is locked behind
sign-in, reusing the existing "🔒 Locked behind sign-in" Extract UX; no save and no draft are
offered. In an **authenticated** session, committing MUST scaffold the desired schema into YAML,
compile it with the out-of-process build service, sanity-check the compiler output, and
`PUT /v1/workflow` (`updateGroundXWorkflow`) using the customer key threaded server-side as
`session.groundxApiKey`, with engine secrets redacted.

#### Scenario: Anonymous cannot edit or save

- **WHEN** an anonymous/onboarding user views the Extract panel
- **THEN** the `Edit schema` toggle is locked behind sign-in and no save affordance is present.

#### Scenario: Authenticated commit compiles and writes the workflow

- **WHEN** an authenticated user commits schema edits
- **THEN** the app scaffolds the YAML, compiles it with the real compiler out-of-process,
  sanity-checks the output, and updates the GroundX workflow with the customer's key
- **AND** committing does NOT modify already-extracted data
- **AND** no engine `apiKey`/`baseURL` is written back or logged.

### Requirement: Refreshing extracted results SHALL be an explicit, separate action

The app MUST trigger re-running extraction only by an explicit user action, and MUST NOT run it
automatically as a side effect of saving the schema. Re-running extraction re-ingests the
document(s), overwrites the persisted output, and takes minutes.

#### Scenario: Save does not re-extract

- **WHEN** an authenticated user saves schema edits
- **THEN** the workflow is updated but no re-ingestion is triggered.

#### Scenario: The user explicitly re-runs extraction

- **WHEN** the user activates the "Re-run extraction" action
- **THEN** the app re-ingests the document(s) with a confirm and a "re-extracting…" state.
