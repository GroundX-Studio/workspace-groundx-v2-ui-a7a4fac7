# Tasks — report-default-template

> **STATUS (server + client + builder DONE; onboarding integration REMAINS).**
> ✅ T1–T5 complete + verified (seed + boot wiring, access-scoped read endpoint,
> write-side ownership guard, builder load + fork-on-edit) — middleware 917 green,
> builder/endpoint/client suites green, tsc clean, `validate --strict` green.
> ⬜ T6 (experience-config wiring), T6b (makeFakeApi seam + re-create the deleted
> OnboardingShell content tests), T7 (e2e + spec + data-model + live-verify + close).
>
> **UNBLOCKED by archived `standardize-viewer-widget-shell`
> (2026-06-13). Re-derive T6/T6b against the post-standardize structure before
> executing:** the session/experience layer now has scope-keyed sessions
> (`scopeKey`) through `ChatStore`, `useConversation`, and scoped viewer widgets,
> and `OnboardingShell` uses the shared `AppShell`/viewer-frame path. Stale T6
> specifics to re-point: the scenario-config schema is NOT literally
> `scenarioSchema`; the onboarding bootstrap/composition site moved; and
> `reportOverlay.templateId` now lives on a scope-keyed session. T6 intent still
> holds and aligns better with the new scope/experience-driven canvas. T6b's
> makeFakeApi seam is intact. T7 intent unaffected. T1–T5 work remains intact
> and green in the full local verification suite.

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

- [ ] **T6 — Experience-config-driven wiring (failing test first; design §E).**
  Add `reportTemplateId?: string` to the scenario config (`scenarioSchema` in
  `@groundx/shared`); the UTILITY scenario config sets it to
  `SAMPLE_REPORT_TEMPLATE_ID`, loan/solar omit it. Add a generic
  `setReportTemplateId` ChatStore action. The bootstrap reads
  `activeScenario.reportTemplateId` and sets it when present — NO `if
  scenario==="utility"` branch in the shell (config is the only place utility
  differs). The re-render effect (from `report-empty-state`) picks up a late set.
  RESET: `templateId` is in the ALREADY-cleared ChatStore namespace — likely NO
  new clearing code; ADD a reset TEST asserting it clears, touch
  `resetExperience.ts` only if the test shows a gap.
  - ↳ **Review:** utility (configured) renders the default; loan/solar + steady
    (no config) → empty — driven by config, with NO scenario special-cased in
    code (grep the shell: no literal `"utility"` gating the templateId); render
    fires for the set id (no stale-empty); reset test proves `templateId` clears;
    `setReportTemplateId` has a non-test writer (bootstrap) + read site (render)
    round-trip; the SAME setter is what a future Project experience would call.

- [ ] **T6b — Restore the render test seam + re-create the OnboardingShell
  utility-render content tests (design §F2).** FIRST update
  `app/src/test/makeFakeApi.ts` so its `renderReport` fake returns the seeded
  template's sections (cited bodies) for the utility scope — `report-empty-state`
  left it returning empty, so without this the restored tests have no content to
  assert. THEN, now that T6 wires utility → `templateId`, re-create the THREE tests
  `report-empty-state` (T6b) rebased-to-empty / deleted: "Phase 0 …renders the
  surface", the anon export-lock-over-content preview, and the Extract→Report
  scope-content test, AND (AS-BUILT, moved from T5) the render→builder edit-§N
  hand-off integration test — all need the onboarding render pipeline this task
  wires. Assert the THREE T1-verified section names — billing summary / charges
  by service / service accounts — NOT the dropped `charge breakdown` /
  `anomalies` / `recommendation` (and NOT `account activity`, dropped at T1).
  - ↳ **Review:** every restored test asserts only sections the seeded template
    actually produces (no assertion on a dropped section); bodies are cited from
    the live render (no hardcoded numbers); the edit-§N test still targets
    `billing_summary` (a surviving section); suite green.

- [ ] **T7 — End-to-end + spec + data-model + close.** seed → render endpoint
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
