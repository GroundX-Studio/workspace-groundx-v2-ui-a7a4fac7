# Tasks — extract-workflow-authoring

TDD (failing test first), adversarial-review gate per task.

## 1. Extend the workflow type to the real shape
- [x] 1.1 Extend the app `Workflow` type (`app/src/api/entities/sdkTypes.ts:207`) and
      `WorkflowInput` (`app/src/api/entities/groundxWorkflowsEntity.ts:14`) with `leafFields`,
      `customSteps`, `outputRoutes` (the structures `GET`/`PUT /v1/workflow` carry). Mirror in
      `@groundx/shared` and add the reconciliation-matrix row in `docs/agents/data-model.md`.
      Redact any engine `apiKey`/`baseURL` in the `steps` blob from the round-trip — never PUT back,
      never log. Test: a fixture `GET /v1/workflow` payload round-trips through the type
      (leafFields/customSteps/outputRoutes present); engine secrets are stripped before PUT and
      absent from logs.

## 2. Harness template sync (re-added — we run the real compiler)
- [ ] 2.1 Sync `templates/compile_workflow.py` + `templates/requirements.txt` + the referenced
      GroundX SDK into the build service (reverses the earlier "no template sync"). Guard test: the
      executable templates are present after sync.

## 3. Python build service (out-of-process real compiler)
- [ ] 3.1 A Python build service/job exposing `compile(yaml) → {workflowJson, errors}` running the
      **synced** `compile_workflow.py` + GroundX SDK. Deploy honestly: a Python runtime +
      `requirements.txt` in a **separate** service/job image (Dockerfile + Helm chart/job) — NOT
      inside the Node middleware process, and Python is NOT added to the Node image. Engine config
      (`EXTRACT_MODEL_*`) read from the service's own env. Test: a fixture YAML compiles to workflow
      JSON via the real compiler; a bad YAML surfaces a structured error.

## 4. App-side YAML scaffold (deterministic — structure only)
- [ ] 4.1 `scaffoldWorkflowYaml(desiredSchema) → yamlSource` (TDD) — a pure TS function encoding the
      harness authoring CONVENTIONS for STRUCTURE (from `references/2_schema_design.md`):
      - step-kind by output shape (`object`→`instruct`/statement; `records`→`keys`/charges;
        `summary`→`summary`/meters); one `charges` + one `meters` max, rest `statement`; no
        `instruct` at document level.
      - `extraction_policy_version: v1`.
      - executable steps under `workflow.custom_steps`; group-level `workflow_step:` (never
        field-level).
      - ≤30 fields/group; over the limit → split into `_pseudo_groups` routing back to the same
        final group via `path` (never more final groups, never one step per field); output keys
        match `^[a-z][a-z0-9_]{0,63}$`.
      - `workflow.agent_chain` with the internal role names (reconcile → qa → save per shape).
      - per-field prompt block (`description`, `identifiers`, `instructions`, `type`, optional
        `format`); charges use locked names `charge_amount` / `charge_description_as_printed`.
      - business-logic metadata where the shape needs it (`match_attrs`, `unique_attrs`, etc.).
      It does NOT render prompts and does NOT finalize routing (that is the compiler's job, §3).
      Tests: fixture desired-schema → expected YAML structure; a >30-field group emits
      `_pseudo_groups` not extra final groups; a records group emits the locked charge field names
      + `agent_chain`.

## 5. Pre-PUT sanity check (on the compiler's OWN output)
- [ ] 5.1 `validateWorkflowConsistency(workflowJson)` (TDD): each `outputRoutes` record has exactly
      one matching `leafFields` record (finalPath/workflowGroup/workflowField/stepName/level/
      outputKey); reject a corrupt artifact before PUT. It is a lightweight sanity check on the
      compiler's output — NOT a substitute for compiling and NOT a re-derivation. Test: a
      deliberately mismatched compiler output fails the check.

## 6. Schema-authoring UI (over the recursive render)
- [ ] 6.1 `Values | Edit schema` toggle on the Extract panel; edit mode over the recursive
      tabs+tree (from `analyze-and-chat-ux`). Edit the desired schema only — add/rename/remove
      groups; add/remove fields; set field `type`/`description`/`identifiers`/`instructions`/
      `format`; set group output shape (`object`/`records`/`summary`).
- [ ] 6.2 Best-practice guidance (TDD): surface harness `references/` guidance inline — a group
      approaching/exceeding 30 fields shows the pseudo-split guidance; records groups show the
      locked charge-field-name guidance. Advisory copy sourced from `references/`, not hard-coded
      rule logic. Test: an oversized group renders the split guidance.

## 7. Save (authenticated-only) + explicit re-extraction
- [ ] 7.1 Anon/onboarding → read-only: `Edit schema` locked behind sign-in, reusing the existing
      "🔒 Locked behind sign-in" UX (`Extract.tsx:1470` / `SchemaView.tsx`). No editor, no save, no
      draft. Test: anon has no editable schema affordance / no save.
- [ ] 7.2 Authed commit (TDD): on save, run `scaffoldWorkflowYaml` → build-service `compile` →
      `validateWorkflowConsistency` → `updateGroundXWorkflow` (`PUT /v1/workflow`) using the customer
      key threaded server-side as `session.groundxApiKey`, with engine secrets redacted. Writes the
      workflow definition only; does not touch extracted data. apiRouteContract test: authed save
      compiles + PUTs the workflow JSON with the session key; anon is rejected; no raw secrets in
      the request body or logs.
- [ ] 7.3 "Re-run extraction" as a separate, explicit action (TDD): a distinct button that
      re-ingests the doc(s), with a confirm + "re-extracting…" state. Never fires automatically on
      save. Test: save alone does not trigger re-ingest; the button does.

## 8. Verification
- [ ] 8.1 tsc + app + middleware vitest green; drift guards green (reconciliation-matrix,
      synced-templates presence, catalog parity, widget-contract).
- [ ] 8.2 `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"; cd scaffold;
      OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate extract-workflow-authoring --strict`.
- [ ] 8.3 Live Chrome E2E: authed user edits the desired schema (rename a field, add a field, split
      an oversized group); save scaffolds YAML, the build service compiles it with the real
      compiler, and the workflow JSON is PUT; guidance shows inline; the separate "Re-run
      extraction" button re-ingests; anon cannot edit.
- [ ] 8.4 Adversarial gate: the workflow build RUNS the synced real `compile_workflow.py`
      out-of-process (NO TS re-implementation of the compiler; NO Python in the Node image; NO
      `child_process` scrape kludge); app-side logic is deterministic YAML STRUCTURE scaffolding
      plus a sanity check on the compiler's OWN output; the synced templates are present (guard);
      guidance traces to `references/`; anon never writes a workflow; save never auto-re-extracts;
      no engine `apiKey`/`baseURL` PUT back or logged.

## Deferred (tracked)
- D.1 Richer `agent_chain` reconcile/QA roles and business-logic metadata beyond the scenario
      shapes (statement · meters · charges · charges-under-meters).
- D.2 In-UI accuracy/score loop against expected answers.
