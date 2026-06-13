# Spec Delta — smart-report

## ADDED Requirements

### Requirement: Onboarding SHALL load a real seeded default report template

Onboarding SHALL provide a report demo via a REAL, DB-backed default report
template — never a client-side fixture. A server-side seed (a script parallel
to the sample-bucket seed) SHALL upsert exactly ONE `kind:"report"` row into the
`templates` table with a well-known SHARED-CONSTANT id, owned by a reserved
public-sample owner sentinel (the `templates` row has no public flag and its
owner column is NOT NULL — the sentinel owner IS the public marker), whose
`body_json` (produced via
the server `reportTemplateToSaveInput` serialization) carries the
user-confirmed section definitions (name + `renderAs` + question). Onboarding
session bootstrap SHALL set `reportOverlay.templateId` to that constant id FOR
THE UTILITY SCENARIO ONLY so the live render fills the sections from the real
sample invoice; the section ANSWERS come from the live render, never hardcoded.
Loan/solar samples and steady-mode members SHALL NOT load it (empty-state
fallback). The seed SHALL be idempotent and its absence SHALL never break
onboarding.

The seeded default template SHALL be EDITABLE: the builder SHALL load its
section definitions via a CLIENT template-read path (`getReportTemplate(id)` — a
NEW anon-readable `GET …/reports/template/:id`, since `POST /api/templates` is
auth-gated and cannot serve it) keyed off `reportOverlay.templateId`, so the
render→builder edit hand-off (`✎ edit §N`) opens the real template's section,
not a fixture row. The new GET endpoint SHALL be ACCESS-SCOPED: anon reads only
public/sample-owned templates (the seeded default qualifies), members read their
own — it SHALL NOT return any template by id to anon. The response SHALL also
carry an `owned` flag (whether the caller owns the row — FALSE for the sample
and for anon) so the builder can decide whether editing forks to a member-owned
copy (see the save-path ownership requirement).

#### Scenario: Onboarding renders the seeded default template over the real invoice

- **GIVEN** the default report template is seeded and onboarding bootstrap has set `reportOverlay.templateId` for the utility scenario
- **WHEN** the user reaches the Report step
- **THEN** the render surface renders the template's sections live over the sample invoice with real cited bodies
- **AND** no client-side fixture or hardcoded answer is involved.

#### Scenario: Loan/solar and steady members get the empty state

- **GIVEN** a loan/solar onboarding sample, OR a steady-mode member with no template
- **WHEN** the user reaches the Report step
- **THEN** the empty state / empty builder is shown — the utility default is NOT injected.

#### Scenario: The default template is editable from the render

- **GIVEN** onboarding has loaded the seeded default template and the render surface is shown
- **WHEN** the user clicks `✎ edit §N` on a rendered section
- **THEN** the builder opens with that section pre-opened, sourced from the real template (via `getReportTemplate`), not a client fixture row.

#### Scenario: The template-read endpoint is access-scoped (no IDOR)

- **GIVEN** the new `GET …/reports/template/:id` endpoint
- **WHEN** an anonymous caller requests a public/sample template id
- **THEN** it is returned
- **AND** when an anonymous caller requests a member-owned (non-public) template id, it is NOT returned.

### Requirement: The report-template save path SHALL enforce ownership

The report-template save path SHALL prevent a caller from overwriting a template
they do not own: a member SHALL be able to persist only a template id that is new
or already theirs — never the sentinel-owned sample id or another member's id.
This is load-bearing because `saveTemplate` upserts on the template id alone and
its update overwrites the owner column, so without enforcement a member could
overwrite AND hijack the sample row this change makes loadable. Two layers
enforce it: (1) the save endpoint SHALL REJECT (403) a save whose id already
exists and is owned by neither the caller nor a value the caller may claim; (2)
the builder SHALL FORK-ON-EDIT — when it loaded a template the caller does not
own, Save SHALL mint a NEW member-owned id (copy-on-write) rather than write the
loaded id. The seeded sample's integrity SHALL rest on this enforcement, NOT on
the idempotent boot seed reverting unauthorized edits.

#### Scenario: A member cannot overwrite a template they do not own

- **GIVEN** the sentinel-owned seeded sample template (or another member's template)
- **WHEN** a signed-in member sends a save under that template's id
- **THEN** the save is rejected (403) and the persisted row is unchanged (body and owner intact).

#### Scenario: Editing the seeded default template forks to a member-owned copy

- **GIVEN** the builder has loaded the seeded default template (owned by the sample sentinel) for a signed-in member
- **WHEN** the member edits a section and saves
- **THEN** the save persists under a NEW member-owned template id (the member owns the copy)
- **AND** the seeded sample row (its id, owner, and body) is unchanged.
