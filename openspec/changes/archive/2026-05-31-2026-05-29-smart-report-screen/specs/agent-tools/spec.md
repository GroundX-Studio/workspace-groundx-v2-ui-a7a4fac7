# Spec Delta — agent-tools

Consolidates the report tool surface under the new `smart-report` capability. The registry mechanics
stay here; the surface behavior is owned by `smart-report` (mirroring how `propose_schema_field`
delegates its surface to `onboarding-schema-editor`). Report and Extract template-mutation tools are
a **shared family** (same Template+Scope+Results lifecycle).

## ADDED Requirements

### Requirement: The verb allowlist SHALL admit `show_` for canvas-dispatch tools

`check-tool-quality`'s `ALLOWED_VERBS` SHALL include `show_`, the canonical canvas-dispatch verb for
the ScopedViewerWidgets (`show_understand` / `show_document`, `show_extraction`(+`_edit`),
`show_smart_report_render`(+`_edit`), `show_integrate`). This closes the gap where the `show_*`
family was spec-only and would have failed the quality guard the moment it was authored (per
`feedback_no_shortcuts`).

#### Scenario: A show_ tool passes the quality guard

- **GIVEN** a `show_smart_report_render` tool authored as a co-located `*.tools.ts`
- **WHEN** `check-tool-quality` runs
- **THEN** the `show_` prefix is allowlisted and the tool passes the verb-prefix rule.

### Requirement: The registry SHALL include the smart-report canvas-dispatch tools, mirrored both sides

The registry SHALL include `show_smart_report_render({ template_id?, scope })` and
`show_smart_report_edit({ template_id, selected_section_id? })`, where `scope` is a `ContentScope`.
`show_smart_report_render` SHALL move the canvas to the report render surface (frame f4 / S3) for the
given scope; `show_smart_report_edit` SHALL move the canvas to the builder (frame f4a / S3a) with the
named section pre-selected when supplied. Each SHALL be mirrored on BOTH the app `*.tools.ts` AND the
middleware `SERVER_TOOL_CATALOG`, with the drift-guard test green. The surface contract is owned by
the `smart-report` capability.

#### Scenario: Render tool opens the report surface for a scope

- **WHEN** the LLM emits `show_smart_report_render` with a `scope`
- **THEN** the canvas moves to the report render surface (frame f4) rendered over that scope.

#### Scenario: Edit tool opens the builder with a section selected

- **WHEN** the LLM emits `show_smart_report_edit` with a `selected_section_id`
- **THEN** the canvas moves to the report builder (frame f4a) with the named section pre-selected.

### Requirement: Report template-mutation tools SHALL share the Extract builder tool family

The report builder's section-mutation tools SHALL be the SAME tool family as the Extract schema
builder's field-mutation tools — same naming, Zod-validation, chip routing, and both-side mirroring
(`*.tools.ts` + `SERVER_TOOL_CATALOG`) — since both operate on the shared template lifecycle. This
covers proposing, accepting, rejecting, editing, deleting, and reordering a section, setting a
section's scope, and running a render. Names SHALL use the allowlisted verb set
(`propose_`/`accept_`/`reject_`/`edit_`/`delete_`/`run_`); any genuinely new verb SHALL be added to
`ALLOWED_VERBS`, never bypassed.

#### Scenario: A report section mutation uses the shared builder tool family

- **GIVEN** the report builder
- **WHEN** a section is proposed / edited / deleted / reordered or a render is run via a tool
- **THEN** the tool conforms to the same family contract (verb allowlist, Zod, chip routing, both-side mirror) as the Extract field-mutation tools.

## MODIFIED Requirements

### Requirement: pin_to_report tool SHALL pin literal turn text to a report template

The agent-tool registry SHALL include `pin_to_report({turn_id, template_id?})`. On invocation it
SHALL pin the turn's literal text as a section into the target template; when no `template_id` is
supplied the surface SHALL prompt the user to choose an **existing template or a new one** (NO silent
auto-create) and land the section through the shared create/edit-template methods. Pins are
**literal text** — automatic variable inference is parked (decision #12). The pinned-section surface
contract (provenance, the existing-or-new UX, where the section lands) is owned by the `smart-report`
capability.

#### Scenario: Pin without a template_id prompts existing-or-new

- **WHEN** the LLM emits `pin_to_report` without a `template_id`
- **THEN** the surface prompts for an existing template or a new one (no silent auto-create)
- **AND** on selection the turn's literal text lands as a section via the shared template method.

### Requirement: propose_report_section tool SHALL emit a ProposalCard in S3a

The agent-tool registry SHALL include `propose_report_section({section_def})`. On invocation, a
ProposalCard SHALL surface in the report builder (frame f4a / S3a) section list; on Accept the
section SHALL be added to the active template via the shared template-edit method. The ProposalCard
surface contract is owned by the `smart-report` capability and mirrors `propose_schema_field`.

#### Scenario: Tool surfaces a section propose-card

- **WHEN** the LLM emits `propose_report_section`
- **THEN** a ProposalCard renders in the report builder (frame f4a)
- **AND** Accept lands the section into the template via the shared edit-template method.
