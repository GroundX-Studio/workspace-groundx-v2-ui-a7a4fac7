# Design — report default template (real, DB-backed, editable)

## Infra that already exists (verified)

- `templates` table (mysqlRepository.ts:217: `templates(id, kind,
  groundx_username, name, body_json, …)`); report templates are `kind:"report"`.
- Repo `saveTemplate` / `getTemplate`; render endpoint
  `POST …/reports/render` already does `getTemplate(id)` → `renderReport`,
  returning the no-template state when null.
- Server serialization `reportTemplateToSaveInput` / `reportTemplateFromRecord`
  (reportRenderer.ts:172/206) — the seed reuses these (it's a server script).
- `authorizedProjectIds(repo, null)` returns public-grant projects; the sample
  project is seeded public → an anon onboarding render retrieves over the sample
  invoice (real content), not empty.

## A. Seed (5b)

`seed-report-template.ts` (parallel to `seed-bucket.ts`) upserts ONE
`kind:"report"` row via `saveTemplate`: id = a single SHARED CONSTANT
(`SAMPLE_REPORT_TEMPLATE_ID`, colocated with `SAMPLE_PROJECT_ID` in
`seedSampleProject`/`@groundx/shared`), `body_json` produced via
`reportTemplateToSaveInput` from the confirmed sections (NOT hand-rolled JSON,
so `getTemplate→reportTemplateFromRecord` round-trips). Idempotent. Verify the
deploy runs it; absence degrades to the empty state.

**Owner — concrete, because templates can't reuse the project convention.** The
public sample PROJECT is `ownerUsername: null` + a `public/viewer`
`project_grants` row (visibility via the GRANT). Templates have NO grant table
AND `templates.groundx_username` is **NOT NULL** (mysqlRepository.ts:220) with no
`is_public`/`is_sample` column — so the template CANNOT be null-owned and there
is nothing to "mark public." Instead the seed writes a RESERVED owner sentinel
`SAMPLE_TEMPLATE_OWNER` (a non-UUID, non-email value that can never collide with
a real GroundX username; colocated with the id constant). "Public/sample" for a
template MEANS `groundx_username === SAMPLE_TEMPLATE_OWNER`; the §C predicate is
that equality. (A general `is_public` column on `templates` is the heavier
alternative — deferred until more than one public template exists; YAGNI.)

## B. The sections (5a — CONFIRMED, then T1-verified against the real extract)

THREE sections, all groundable against the real bill:
- **billing_summary** (PARAGRAPH) — customer/addressee, utility company,
  statement date, service period, total amount due, payment due date.
- **charges_by_service** (TABLE) — total charges per utility service (electric /
  water / sewer / irrigation).
- **service_accounts** (TABLE) — each metered account: meter id, utility type,
  rate plan, usage, total charges.

T1 evidence (extract of doc `c3bfff49…`): KWIK TRIP (1147), City of Windom,
`issued_on` 2025-07-08, `period_total` 7613.20, `payment_deadline` 2025-07-30, 8
`meters[]` (electric/water/sewer/irrigation) with per-`line_label` charges. The
bill has NO balance-forward/prior-payment/payments-through fields, so
**`account_activity` was DROPPED** (ungroundable → would render `—`) and
**`billing_summary` trimmed** of "balance forward, payments".
Anomalies/Recommendation were dropped earlier (would fabricate).

## C. Client template read (5e) — anon GET-by-id, access-scoped

New `getReportTemplate(id)` api method + new
`GET /api/widgets/smart-report/reports/template/:id`. It returns BOTH the
`reportTemplateFromRecord` shape AND an `owned: boolean` flag — i.e.
`{ template, owned }` — where `owned` is whether the CALLER owns the row
(`record.groundx_username === callerUsername`; FALSE for the sentinel-owned
sample, and FALSE for anon). The server already computes this in the access
check, so it is free to return. **`owned` is load-bearing: the builder's
fork-on-edit (§C2.2) reads it** — without it the client cannot tell that the
loaded template isn't the caller's. The existing `POST /api/templates` is
auth-gated and is NOT a GET-by-id — cannot be reused.

**Access scoping (NOT an open IDOR) — concrete predicate:** the endpoint loads
`getTemplate(id)` then returns it ONLY IF
`record.groundx_username === SAMPLE_TEMPLATE_OWNER` (public sample — anon OR
member) OR `record.groundx_username === callerUsername` (a member's own);
otherwise 404. So anon gets the seeded default but NOT a member-owned template
by id; a member gets their own but not another member's. (The render's existing
`getTemplate(id)` at app.ts:1334 reads by id with NO owner check under
`requireSession` — verified; a PRE-EXISTING READ-side posture this change does
not widen; tracked follow-up; the NEW read endpoint ships scoped.)

## C2. Write-side ownership enforcement (the dangerous IDOR — closed here)

**The hole (verified):** `saveTemplate` upserts on the PRIMARY KEY `id` ALONE,
and its `ON DUPLICATE KEY UPDATE` clause overwrites `groundx_username =
VALUES(...)` (mysqlRepository.ts:653-658) — i.e. saving under an existing id
rewrites BOTH the body AND the owner. The save endpoint
(`POST /api/widgets/smart-report/reports`) assigns the owner from the session
(so the body can't *claim* a different owner) but does NOT check whether the id
being written already belongs to someone else. So a signed-in member who saves
under `SAMPLE_REPORT_TEMPLATE_ID` would overwrite AND hijack the system-owned
sample. It is only unreachable today because the builder mints a fresh id and
never loads the sample — and §D (loading the sample into the builder) is exactly
what makes it reachable through the UI. So this change MUST close it (not lean on
the boot seed reverting edits — that's a symptom patch).

**Two layers (defense in depth):**
1. **Endpoint guard (boundary).** Before persisting, the save endpoint loads
   `getTemplate(input.id)`; if a row exists and its `groundx_username` is neither
   the caller's nor the caller's to claim, it returns **403** (a member may only
   write an id that is new or already theirs — never a sentinel-owned or another
   member's id). Closes it even against a hand-crafted request.
2. **Builder fork-on-edit (UX).** When the builder loaded a template the caller
   does NOT own, Save mints a NEW member-owned id (copy-on-write) —
   `templateIdentity` becomes a fresh `rt-…` id, NOT `SAMPLE_REPORT_TEMPLATE_ID`
   — so the member's customization lands as THEIR template and never targets the
   sample row. Ownership is known from the read: `getReportTemplate` returns
   `owned` (§C); `owned === false` (the sentinel-owned sample, or any
   not-the-caller's row) → fork. (Belt-and-suspenders with layer 1: even if the
   fork logic regressed, the endpoint guard still 403s the overwrite.)

Make-illegal-states-unrepresentable: the sample is immutable-to-non-owners by
enforcement; the idempotent boot seed only reconciles a row nothing else can
legally have changed.

## D. Builder loads the real template (so it's editable)

`SmartReportBuilder` seeds base rows from
`getReportTemplate(reportOverlay.templateId)` when set (else `[]` from
`report-empty-state`). This makes the seeded default EDITABLE and RESTORES the
render→builder edit hand-off (`✎ edit §N` → builder pre-opens that section,
sourced from the real template, not the deleted fixture). Effective rows = base
⊕ overlay pins, unchanged. On Save of a NOT-owned loaded template, the builder
FORKS to a new member-owned id (§C2.2) — editing the sample never writes the
sample row.

## E. Experience-driven wiring (5c) — config-carried, NOT a hardcoded scenario branch

PHILOSOPHY (AGENTS.md → `real-data-rewire-gap.md`): the entry point selects the
experience and the canvas is driven by the active experience's data — NOT a
bespoke `if scenario === "utility"` branch in the shell. So the template id is
**experience/scenario CONFIG**, resolved generically:

- Add an optional `reportTemplateId?: string` to the scenario config
  (`scenarioSchema` in `@groundx/shared`, the same per-experience carrier that
  already holds `hero`/`thinkingScript`/`chatSeeds`). The UTILITY scenario's
  config sets it to `SAMPLE_REPORT_TEMPLATE_ID`; loan/solar simply omit it.
- The bootstrap reads `activeScenario.reportTemplateId` and, when present, calls
  a new generic `setReportTemplateId` ChatStore action — so a scenario WITH a
  configured template loads it and one WITHOUT gets the empty state. No scenario
  is special-cased in code; the config is the only place utility differs. This is
  the SAME path a future authenticated Project experience uses (it carries its
  own `reportTemplateId`), so the base experience reuses the mechanism, not a
  fork.

AS-BUILT (from `report-empty-state`): the pin path ALREADY writes
`reportOverlay.templateId`, and the render ALREADY has a `templateId`-change
re-render effect — so the re-trigger concern is closed and a late set is picked
up. `setReportTemplateId` is a standalone setter (onboarding isn't pinning).
Steady-mode with no configured/selected template → empty state.
RESET: `reportOverlay.templateId` is a field in the ALREADY-cleared ChatStore
namespace — likely no new clearing code; ADD a reset test (touch
`resetExperience.ts` only if the test shows a gap; `feedback_debug_reset_exhaustive`).

## F2. OnboardingShell tests re-created against the real template

`report-empty-state` (T6b) rebased two utility-render content tests to the empty
state and DELETED two that need rendered content (the edit-§N hand-off ~1219 and
the Extract→Report scope-content ~1254). Once §E wires utility → `templateId`,
utility Report renders the seeded sections again, so this change RE-CREATES them
— but asserting the NEW section names: **billing summary / charges by service /
service accounts / account activity**. The old `charge breakdown` / `anomalies`
/ `recommendation` sections were DROPPED (§B) — no restored test may assert them.
Section bodies are cited from the live render (no hardcoded numbers).
`billing_summary` survives as the first section, so the edit-§N
hand-off's `report-section-edit-billing_summary` →
`report-builder-editor-billing_summary` ids are still valid.

**Test seam (`makeFakeApi`).** `report-empty-state` (T2) made the fake API's
`renderReport` return the empty/no-template result. The OnboardingShell content
tests reach the render THROUGH this fake — so for them to render the real
template's sections, this change updates `app/src/test/makeFakeApi.ts` so its
`renderReport` fake returns a `RenderedReport` whose sections are the seeded
template's sections (keyed off the utility scope / the seeded `templateId`),
with cited bodies. This fake is the ONLY place the integration tests get render
content; without updating it, T6b's restored tests cannot assert content. (The
fake mirrors the real `getTemplate(id)`→`renderReport` path; it is test infra,
not a client fixture, so the `report-empty-state` no-fixture guard stays green.)

## G. KNOWN LIMIT — the template-id source is ephemeral (base experience needs durable resolution)

`reportOverlay.templateId` is CLIENT-ONLY ChatStore state (verified: `reportOverlay`
is not persisted server-side). This is fine for the ONBOARDING overlay because
onboarding re-derives it from scenario config on every visit (§E) — but it is NOT
a durable mechanism for the BASE (authenticated) experience: a member's selected
template id is lost on reload (render → empty), which contradicts the
chat-session-model storage rule (DB is source of truth for session state). So
this change does NOT claim the client overlay field as "the" template source for
the base experience. The deferred base flow (proposal Scope) MUST resolve the
report template from a DURABLE, scope/project-tied SERVER-SIDE source (e.g. the
project's default report template, or the member's saved template for the scope)
— NOT inherit this onboarding-shaped ephemeral field. Flagging here so the
follow-on doesn't bake in the wrong assumption. (Within THIS change, the
ephemeral field is correct: onboarding is re-bootstrapped, and a member's pin is
a deliberate in-session action.)

## F. Spec delta (smart-report)

ADD "Onboarding SHALL load a real seeded default report template" — DB-backed,
rendered live, EDITABLE (builder loads via `getReportTemplate`), onboarding +
utility-scoped, empty-state fallback elsewhere, anon-read access-scoped.
