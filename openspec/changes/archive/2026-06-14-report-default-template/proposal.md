# Report: seed a real default onboarding template (rendered live, editable)

## Why

After `report-empty-state` removes the client-side fake fixture, the Report
surface is an empty builder. The BASE experience is the authenticated member: a
member's report renders from THEIR saved template via real report state
(`reportOverlay.templateId` → live render). Onboarding is a special EXPERIENCE
overlaid on that base — it needs REAL demo content, via real infrastructure,
never a client fake: a real DB-backed default report template that the onboarding
experience CARRIES (as scenario config) and the live render fills from the actual
sample invoice. This change builds the shared mechanism (template-read endpoint,
render wiring, write-side ownership) and instantiates it for the onboarding
overlay; the member's-own-template flow rides the SAME mechanism and is the
primary follow-on (see Scope). This is "existing-or-new UX" done right (and what
`project_prelaunch_correctness` is REVISED to allow: a real seeded sample
template, not a client fake).

## Depends on

`report-empty-state` (this change builds on its `reportOverlay.templateId`
render source + the deleted fixture + the no-fixture guard). Execute after it.

## What changes

- **Seed** one real `kind:"report"` row into the `templates` table via a
  BOOT-TIME DB seed (`seedSampleReportTemplate`, colocated with
  `seedSampleProject` and called from `index.ts` — a pure DB upsert, no GroundX
  API, so NOT a standalone script and NOT gated on the samples bucket),
  `body_json` via the SERVER serialization
  (`reportTemplateToSaveInput`/`reportTemplateFromRecord`, reportRenderer.ts),
  owned by a reserved `SAMPLE_TEMPLATE_OWNER` sentinel, id = a single SHARED
  CONSTANT `SAMPLE_REPORT_TEMPLATE_ID` (in `@groundx/shared` — both the seed and
  the client bootstrap import it).
- **Client template read:** a new `getReportTemplate(id)` api method + a new
  anon-readable `GET /api/widgets/smart-report/reports/template/:id`,
  ACCESS-SCOPED (anon reads only the sentinel-owned sample template — NOT an open
  IDOR; members read their own). The existing `POST /api/templates` is auth-gated
  and cannot be reused.
- **Write-side ownership enforcement (the dangerous IDOR — now IN scope).** The
  save path (`POST /api/widgets/smart-report/reports` → `saveTemplate`) upserts
  on the template **id alone** and its `ON DUPLICATE KEY UPDATE` overwrites
  `groundx_username` too — so a member who saves under an existing id would
  overwrite AND hijack a row they don't own (incl. the sentinel-owned sample this
  change makes loadable). Two layers close it: (a) the save endpoint REJECTS
  (403) a save whose id already exists and is owned by someone else; (b) the
  builder FORKS-ON-EDIT — editing a template you don't own (the sample) mints a
  NEW member-owned id on Save (copy-on-write), never targeting the sample id. The
  seeded sample is protected by enforcement, not by the boot seed overwriting
  edits.
- **Builder loads the real template:** `SmartReportBuilder` seeds its base rows
  from `getReportTemplate(reportOverlay.templateId)` (not the deleted fixture),
  so the default template is EDITABLE and the render→builder edit hand-off
  (`✎ edit §N`) works against the real template. Editing it forks (above).
- **Experience-config-driven wiring (NOT a hardcoded scenario branch):** the
  scenario config carries an optional `reportTemplateId` (the utility scenario
  sets it to the seeded id; loan/solar omit it); the bootstrap reads
  `activeScenario.reportTemplateId` and sets `reportOverlay.templateId` via a
  generic `setReportTemplateId` action. No scenario is special-cased in code —
  the SAME mechanism a future authenticated Project experience uses to carry its
  own template id (AGENTS.md → `real-data-rewire-gap.md`: the entry point selects
  the experience; the canvas is driven by the active experience).

## The template content (5a — CONFIRMED with the user, then T1-verified)

Section definitions (the render fills answers live from the real City of Windom
bill — no hardcoded numbers):

| Section | renderAs | Question |
|---|---|---|
| billing_summary | PARAGRAPH | Customer/addressee, utility company, statement date, service period, total amount due, payment due date |
| charges_by_service | TABLE | Total charges per utility service: Electric / Water / Sewer / Irrigation |
| service_accounts | TABLE | Each metered account: meter id, utility type, rate plan, usage, total charges |

**T1 verification (against the real extract, doc `c3bfff49…`):** the bill is a
single-period "Direct" statement (`addressee` KWIK TRIP (1147), `utility_company`
City of Windom, `issued_on` 2025-07-08, `period_total`/`balance_payable`
7613.20, `payment_deadline` 2025-07-30, 8 `meters[]` across
electric/water/sewer/irrigation with per-`line_label` charges). It has **NO
balance-forward / prior-payment / payments-through fields**, so:
- **`account_activity` was DROPPED** (it was the optional section; the doc cannot
  ground it → would render `—`).
- **`billing_summary` trimmed** — removed "balance forward, payments" (not on the
  bill); the remaining fields all ground.

Also dropped earlier (would fabricate): Anomalies, Recommendation.

## Scope

**In:** seed + GET endpoint + **save-endpoint ownership guard +
builder fork-on-edit** + builder read + onboarding wiring + tests.

**Out (the PRIMARY base-experience follow-on, not afterthoughts):**
- **The authenticated member's report flow** — opening a member's saved template
  so it renders. This is the BASE experience and the main thing this change is a
  stepping stone toward. It reuses this change's mechanism (the write-guard, the
  read endpoint, the generic `setReportTemplateId`) — BUT note (design §G): the
  current template-id source, `reportOverlay.templateId`, is CLIENT-ONLY and
  ephemeral, so the base flow must resolve the template from a DURABLE,
  scope/project-tied SERVER-SIDE source (not the client overlay, which is lost on
  reload). Tracked as the next change. (The pin path already sets `templateId`
  in-session for base members, so the render path is partially exercised today.)
- Per-scenario default templates for loan/solar (they get the empty state;
  tracked).
- Hardening the render's PRE-EXISTING `getTemplate(id)` (reads any id, no owner
  check) — a separate READ-side follow-up; the NEW read endpoint here is scoped,
  and the WRITE-side IDOR is closed in this change (above).
- Unifying template access (owner-based) with the project-grant RBAC — templates
  are scope-independent and already owner-scoped, so the sentinel-owner public
  marker EXTENDS the existing template model rather than inventing one; a future
  unification (if templates gain sharing) is tracked, not silently divergent.

## Conformance to core architectural decisions

- **No fake data.** Real DB-backed template via real endpoints + live render —
  the anti-fixture direction; passes the no-fixture guard from `report-empty-state`.
- **Done = round-trip (5).** Seeded byte → `getTemplate(id)` (render) +
  `getReportTemplate(id)` (builder) read sites. Onboarding-set `templateId` has a
  read site.
- **One source of truth (6).** Single shared template-id constant; server
  serialization reused for the seed; render section stays `RenderedSection`.
- **Security.** New READ endpoint access-scoped (anon → sentinel-owned sample
  only) with a negative IDOR test; the WRITE path enforces ownership (no
  overwriting/hijacking a row you don't own) + the builder forks-on-edit — both
  with negative tests. Make-illegal-states-unrepresentable: the sample is
  protected by enforcement, not by a reverting boot seed.
- **TDD / adversarial review per task:** tasks lead with failing tests + gates.
