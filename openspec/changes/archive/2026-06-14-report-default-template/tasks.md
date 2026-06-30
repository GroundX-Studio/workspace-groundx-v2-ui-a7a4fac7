# Tasks — report-default-template

> **STATUS (server + client + builder DONE; onboarding integration REMAINS).**
> ✅ T1–T5 complete + verified (seed + boot wiring, access-scoped read endpoint,
> write-side ownership guard, builder load + fork-on-edit) — middleware 917 green,
> builder/endpoint/client suites green, tsc clean, `validate --strict` green.
> ⬜ T6 (experience-config wiring), T6b (makeFakeApi seam + re-create the deleted
> OnboardingShell content tests), T7 (e2e + spec + data-model + live-verify + close).
>
> **UNBLOCKED + RE-DERIVED (2026-06-13).** `standardize-viewer-widget-shell`
> LANDED (archived `2026-06-13-…`); the tree tsc-cleans and T1–T5 + change 3 stay
> green. T6/T6b are re-pointed at the now-current experience-driven canvas
> (design §E rewritten) — VERIFIED structure: the scenario schema is
> `scenarioManifestSchema` in `@groundx/shared` (carries hero/thinkingScript);
> experiences (onboarding/project/workspace/scoped) are composed in
> `ChatColumn.tsx:131-142` via `chatExperienceRegistry.byId(id).create(config)`;
> sessions are scope-keyed (`scopeKey` = serialized ContentScope; onboarding
> sessions are NON-scope-keyed); the report surface mounts via `ScopedCanvas`
> (`report` kind) and `SmartReportRender` reads `reportOverlay.templateId`; the
> ONLY writer today is `pinToReport`. T6 design intent (config-driven, NO
> hardcoded scenario branch) is unchanged and fits the new model cleanly.

Dependency: `report-empty-state` is SHIPPED + **archived**
(`changes/archive/2026-06-12-report-empty-state/`). SEQUENTIAL tasks; **each
followed by an adversarial-review gate**; TDD failing-test-first. node 20 for
all commands (`$HOME/.nvm/versions/node/v20.20.2/bin`).

- [x] **T1 — Field-name verification against the real bill.** Verified section
  field names against the REAL seeded doc (City of Windom bill) via
  `document_getextract`, not the screenshot. RESULT: dropped `account_activity`
  (the bill has no balance-forward / payment-activity → ungroundable) and trimmed
  `billing_summary` → **3 groundable sections** (design §B).
  - ↳ **Review (passed):** every kept section is answerable from the actual
    invoice (no section the doc can't ground → no `—`/empty render).

- [x] **T2 — Shared constants.** `SAMPLE_REPORT_TEMPLATE_ID` → **`@groundx/shared`**
  (the client onboarding bootstrap needs it AND the middleware seed does — the
  app cannot import middleware, so the single source is the shared package, NOT
  colocated with `SAMPLE_PROJECT_ID` in middleware as originally planned). Rebuild
  `shared/dist`. `SAMPLE_TEMPLATE_OWNER` (reserved non-UUID/non-email owner
  sentinel — design §A) is SERVER-ONLY → middleware (`seedSampleProject.ts`).
  - ↳ **Review:** single source; no duplication across server/app/tests; the
    sentinel cannot collide with a real GroundX username; `shared/dist` rebuilt.

- [x] **T3 — Seed script (failing test first).** `seed-report-template.ts`
  upserts ONE `kind:"report"` row (`SAMPLE_REPORT_TEMPLATE_ID`; `groundx_username`
  = `SAMPLE_TEMPLATE_OWNER`; `body_json` via `reportTemplateToSaveInput`).
  Idempotent.
  - ↳ **Review:** `getTemplate(id)` returns it with the right sections;
    idempotent (re-run = no dup); body round-trips `reportTemplateFromRecord`;
    owner is the `SAMPLE_TEMPLATE_OWNER` sentinel (not null — `groundx_username`
    is NOT NULL).

- [x] **T4 — Client template read + endpoint (failing test first).**
  `getReportTemplate(id)` api + new `GET …/reports/template/:id`. ACCESS-SCOPED
  by the §C predicate: return iff `groundx_username === SAMPLE_TEMPLATE_OWNER`
  (public sample) OR `=== callerUsername` (member's own), else 404. The response
  is `{ template, owned }` where `owned = (groundx_username === callerUsername)`
  (FALSE for the sample / anon) — the builder's fork-on-edit reads it (§C), so it
  must NOT be omitted.
  - ↳ **Review:** anon CAN read the seeded sample (and gets `owned:false`) AND
    CANNOT read a member-owned template by id (negative IDOR test); a member
    reading their own gets `owned:true`; a member cannot read another member's;
    `owned` is present + correct in every returned case; endpoint test green.

- [x] **T4b — Save-endpoint ownership guard (the WRITE-side IDOR; failing test
  first).** `POST /api/widgets/smart-report/reports` loads `getTemplate(input.id)`
  before persisting and REJECTS (403) when **a row already exists under that id
  AND its `groundx_username !== callerUsername`** (design §C2.1) — a member may
  write only a NEW id or one already theirs, NEVER the sentinel-owned sample or
  another member's. (`saveTemplate` upserts on id alone + overwrites the owner,
  so without this a member could hijack the sample.)
  - ↳ **Review:** member saving under `SAMPLE_REPORT_TEMPLATE_ID` → 403, row
    unchanged (body + owner intact); member saving under another member's id →
    403; member saving a NEW id or their OWN existing id → 200; the existing
    member-Save test still green; the boot seed (direct `saveTemplate`, not the
    endpoint) is unaffected.

- [x] **T5 — Builder loads the real template + forks-on-edit (failing test
  first).** Builder now drives base rows from
  `getReportTemplate(reportOverlay.templateId)` (scope-independent template-load
  effect; instructions string↔array bridged); `getReportTemplate` wired into the
  api-client `report` object. FORK-ON-EDIT (design §C2.2): reads `owned`; when
  `owned === false` (sample / not-the-caller's) Save mints a NEW member-owned id
  (copy-on-write), never the loaded id; `owned === true` saves under its own id.
  AS-BUILT: the **builder-side + render-side hand-off mechanisms are already
  unit-tested** (builder `selectedReportSectionId` pre-open; SmartReportRender
  `editTemplate` dispatch) — the OnboardingShell render→builder edit-§N
  INTEGRATION test needs the onboarding render PIPELINE (T6 templateId + T6b
  makeFakeApi content), so it is restored in **T6b**, not here.
  - ↳ **Review (passed):** 3 builder unit tests green — loads real-template rows;
    fork (`owned:false`) Saves id ≠ sample id; owned (`owned:true`) Saves own id
    (both arms covered, not dormant); full builder suite 17 green; app tsc clean;
    no fixture ref.

- [x] **T6 — Experience-config-driven wiring (failing test first; design §E,
  RE-DERIVED for the experience-driven canvas).** DONE 2026-06-13. All four edits
  landed; proven end-to-end. AS-BUILT: (a) `scenarioManifestSchema` carries
  `reportTemplateId?`, utility sets `SAMPLE_REPORT_TEMPLATE_ID` in
  `sampleScenarios.ts` (+ test fixture `scenarioFixtures.ts`), loan/solar omit it,
  `shared/dist` rebuilt; (b) `setReportTemplateId` ChatStore action + test (green);
  (c) `OnboardingExperienceConfig` + `onboardingConfigSchema` (the z.object strip
  guard) gain `reportTemplateId?` + the once-on-mount Choreography effect, covered
  by `experience.reportTemplate.test.tsx` (3 tests incl. the registry-parse guard);
  (d) `ChatColumn.tsx:135` threads `scenario.manifest.reportTemplateId` into
  `.create({…})` (config-read, NO literal `"utility"`). Reset: `templateId` rides
  the already-cleared `groundx-onboarding.` ChatStore namespace — no new clearing
  code. The render's late-set re-trigger effect (SmartReportRender:238-247) picks
  up the mount-time set. End-to-end integration test in `OnboardingShell.test.tsx`
  ("report-default-template: the utility onboarding scenario loads its seeded
  template…") proves the full ChatColumn→experience→ChatStore→routing→render chain.
  App 1730 / mw 917 / both tsc 0 / `validate --strict` green.
  FOUR edits, none a hardcoded scenario branch:
  (a) `scenarioManifestSchema` in `@groundx/shared` (NOT `scenarioSchema`) gains
      `reportTemplateId?: string`; the UTILITY scenario sets it to
      `SAMPLE_REPORT_TEMPLATE_ID` in `middleware/src/scenarios/sampleScenarios.ts`,
      loan/solar omit it; rebuild `shared/dist`.
  (b) `setReportTemplateId(templateId)` ChatStore action — writes
      `reportOverlay.templateId` on the active session (mirrors the `pinToReport`
      write; the only other writer).
  (c) `OnboardingExperienceConfig` (`experiences/onboarding/experience.tsx`) gains
      `reportTemplateId?`; the onboarding experience fires
      `setReportTemplateId(config.reportTemplateId)` from a once-on-mount effect
      (same shape as the existing `firstUserMessageSent` effect), guarded to run
      once when the active session exists.
  (d) `ChatColumn.tsx:131-142` threads
      `reportTemplateId: scenario.manifest.reportTemplateId` into the onboarding
      `.create({…})` — READ FROM CONFIG, no literal `"utility"`.
  The `report-empty-state` re-render effect picks up the late set (no
  stale-empty). RESET: `templateId` is in the ALREADY-cleared ChatStore namespace
  — likely NO new clearing code; ADD a reset TEST asserting it clears, touch
  `resetExperience.ts` only if the test shows a gap.
  - ↳ **Review:** utility (configured) renders the default via `ScopedCanvas`
    `report` kind; loan/solar + scope-keyed steady (no config) → empty — driven by
    config, NO scenario special-cased in code (grep the shell/ChatColumn: no
    literal `"utility"` gating the templateId); render fires for the set id;
    reset test proves `templateId` clears; `setReportTemplateId` has a non-test
    writer (the onboarding mount effect) + read site (render) round-trip; the SAME
    config path a future scoped/project experience uses.

- [x] **T6b — Restore the render test seam + re-create the OnboardingShell
  utility-render content tests (design §F2).** DONE 2026-06-13. AS-BUILT: the
  `makeFakeApi.ts` seam was refactored to ONE shared `sampleSeededReport(scope)`
  helper feeding both `renderReport` (rendered cited bodies) and a NEW
  `getReportTemplate` fake (the builder's editable section definitions, `owned:
  false`), so the section ids stay consistent across render + builder. All four
  content tests are GREEN in `OnboardingShell.test.tsx`: (1) the T6 end-to-end
  render ("Phase 0" successor); (2) ANON export-lock-over-content (preview badge +
  locked export/Save over the rendered report); (3) Extract→Report scope-content
  (records the render `scope` → `{type:"bucket", filter:{projectId:"proj_utility"}}`
  + asserts the three sections); (4) render→builder edit-§N hand-off (✎ edit on
  billing_summary → f4a builder with `report-builder-editor-billing_summary`
  open). All assert the THREE T1-verified section names only; no dropped section;
  the no-template empty arm re-pointed at `loan`. App 1733 / mw 917 / tsc 0 /
  `validate --strict` green.
  FIRST update
  `app/src/test/makeFakeApi.ts` so its `renderReport` fake returns the seeded
  template's sections (cited bodies) for the utility scope — `report-empty-state`
  left it returning empty, so without this the restored tests have no content to
  assert. THEN, now that T6 wires utility → `templateId`, re-create the THREE tests
  `report-empty-state` (T6b) rebased-to-empty / deleted: "Phase 0 …renders the
  surface", the anon export-lock-over-content preview, and the Extract→Report
  scope-content test, AND (AS-BUILT, moved from T5) the render→builder edit-§N
  hand-off integration test — all need the onboarding render pipeline this task
  wires. NOTE (re-verified 2026-06-13): `OnboardingShell.tsx` still has the
  `f4`/`f4a` Report frames + the "Report" sub-pill, and `OnboardingShell.test.tsx`
  still carries the change-1 breadcrumb comments (where the deleted tests go) — so
  re-create them THERE against the intact click-Report→`f4`→`ScopedCanvas`(`report`)
  flow; the standardize change wrapped the canvas in `ScopedCanvas` but did NOT
  remove the report nav. Assert the THREE T1-verified section names — billing
  summary / charges by service / service accounts — NOT the dropped
  `charge breakdown` / `anomalies` / `recommendation` (and NOT `account activity`,
  dropped at T1).
  - ↳ **Review:** every restored test asserts only sections the seeded template
    actually produces (no assertion on a dropped section); bodies are cited from
    the live render (no hardcoded numbers); the edit-§N test still targets
    `billing_summary` (a surviving section); suite green.

- [x] **T7 — End-to-end + spec + data-model + close.** DONE 2026-06-13 (all work; only `openspec archive` remains as the mechanical closure step):
  the smart-report spec delta is AUTHORED + `validate --strict` green (it merges
  to the durable spec at `openspec archive` time, not before). `docs/agents/
  data-model.md` is DONE + every claim verified against code: the reconciliation
  matrix gained a "Seeded default report template" row (shared
  `SAMPLE_REPORT_TEMPLATE_ID="rt-sample-utility-bill"` → `seedSampleReportTemplate`
  + `SAMPLE_TEMPLATE_OWNER` sentinel → one `templates` row → access-scoped
  `GET …/reports/template/:id` + the POST-render 403 `not_template_owner` guard);
  the `ScenarioManifest` (`reportTemplateId?`), `PendingReportOverlay`
  (`templateId?` + `setReportTemplateId`/pin writers), `GetReportTemplateResult` +
  `getReportTemplate`, and `SAMPLE_REPORT_TEMPLATE_ID` rows were added.
  REMAINING: LIVE render verify RAN 2026-06-13 via `middleware/scripts/verify-report-render.ts`
  (standalone, MemoryAppRepository + real GroundX/LLM/embeddings, anon path, no
  DB/HTTP). RESULT — the render path is LIVE-PROVEN: GroundX search hit the real
  City of Windom doc `c3bfff49…` (scores 294/230/221, correct `projectId` filter)
  and 2 of 3 sections grounded with real citations: **billing_summary** ✓ (7 cites:
  KWIK TRIP 1147 · City of Windom · 2025-07-08 · $7,613.20 · due 2025-07-30) and
  **charges_by_service** ✓ (Electric $5,193.30 / Water $810.80 / Sewer $1,017.98 /
  Irrigation $591.12 / total $7,613.20). service_accounts initially blanked `—`:
  the LLM produced the full per-meter table, but its citations targeted the meter
  ARRAY/OBJECT nodes → correctly dropped by `verifyExtractionCitation`'s
  `branchNode` rule → 0 citations → `degradeSection` correctly blanks. Root cause
  (confirmed against the REAL extract): the section asked for a per-meter "total
  charges" column that is a DERIVED sum of `meter_charges[]` (no extracted leaf to
  cite). **FIXED** by reframing the section to the four leaf-citable fields
  (meter id / utility type / rate plan / usage); per-service totals already live
  in `charges_by_service`. RE-VERIFIED 2026-06-13: **all 3 sections PASS** —
  billing_summary (7 cites), charges_by_service (2), service_accounts (40, pages
  1–2). `verify-report-render.ts` exits 0. The seed + the `makeFakeApi` seam were
  both updated to the leaf-field shape. REMAINING: archive the change.
  seed → render endpoint
  produces cited sections over the sample invoice (anon path); Report cold-start
  renders the default. Apply the smart-report spec delta (design §F). **Update
  `docs/agents/data-model.md` + its reconciliation matrix (AGENTS.md mandate,
  closeout step):** the `PendingReportOverlay` row (now carries `templateId` —
  change 1 debt swept in here), the new `setReportTemplateId` ChatStore action +
  the pin-path `templateId` writer, the scenario-config `reportTemplateId`, and
  the `SAMPLE_REPORT_TEMPLATE_ID` (shared) + `SAMPLE_TEMPLATE_OWNER` + the new
  `GET …/reports/template/:id` endpoint + `getReportTemplate` client method rows.
  **LIVE-verify, not just the fake:** the unit/integration tests drive `makeFakeApi`, which returns
  CANNED sections — so they prove wiring, NOT that the live render actually
  answers the three section questions over the real bill. Run the real render
  endpoint against the seeded template + the City of Windom doc (anon path) and
  confirm each section grounds (billing summary fields, per-service totals, the
  per-meter list) with real citations — no `—`/empty section.
  - ↳ **Review:** final hostile pass — `validate --strict` + app + middleware
    suites + `npm run build` green; the no-fixture guard from `report-empty-state`
    still green (this change adds NO client fixture); the LIVE render produced
    grounded, cited sections (evidence captured), not just a green fake; every
    persisted byte read.

Deferred (tracked): member Save→templateId; scope→saved-templates listing;
per-scenario loan/solar templates; hardening the render's existing
`getTemplate(id)` owner-check.
