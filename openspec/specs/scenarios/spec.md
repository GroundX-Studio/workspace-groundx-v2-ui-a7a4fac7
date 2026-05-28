# scenarios Specification

## Purpose

Define the durable shape of the sample scenarios (Utility, Loan, Solar)
— manifest layout, document packets, pre-canned extraction values, chat
seeds and scripts — plus the bucket-seeding contract that lets a fresh
samples bucket boot the F1 picker without runtime authoring.

## Requirements
### Requirement: Loan scenario SHALL ship a 12-doc packet fixture

The Loan scenario SHALL deliver 12 documents matching the spec
shape — 3 paystubs, 1 W-2, 1 employment letter, 3 bank statements, 4
debt docs — wired into the samples bucket so the F2 picker surfaces
all 12 AND F5 cross-doc citations resolve across them. Blocked on real
docs from product.

#### Scenario: Loan picker shows 12 docs with citations

- **GIVEN** the Loan fixture loaded
- **WHEN** the user picks Loan on F1
- **THEN** F2 lists 12 documents
- **AND** an F5 cross-doc question resolves citations into ≥2 of them

### Requirement: Solar 142-doc portfolio SHALL render via virtualized hierarchical tree

The Solar scenario SHALL render its 142-doc portfolio as a
hierarchical Fund→Project tree, virtualized for performance with > 50
nodes. The tree SHALL support search filtering by document name.

#### Scenario: Tree renders 142 nodes smoothly

- **GIVEN** the Solar fixture loaded
- **WHEN** the user picks Solar on F1
- **THEN** the tree renders 142 nodes under Fund→Project hierarchy
- **AND** scrolling stays at 60fps (virtualization on)
- **AND** typing in the search box filters the visible nodes

### Requirement: Solar IC brief template SHALL define four sections

The Solar IC brief template SHALL have four sections in this order:
`executive_summary`, `risk_roll_up`, `comparable_projects`,
`recommendation`. Per `project_scenario_fixtures.md`. F7 SHALL be able
to render the template against the Solar portfolio.

#### Scenario: F7 generates the four sections

- **GIVEN** the Solar IC brief template loaded
- **WHEN** F7 renders the template against the active project
- **THEN** all four sections appear in order with populated content

### Requirement: Sample document assets SHALL ship as real PDFs

The Utility / Loan / Solar samples SHALL ship as real PDFs ingested
into the samples bucket. Today F2 renders a flat-white PDF placeholder;
the closure gate is real pages rendering via the PdfViewer. Blocked on
product delivering the docs.

#### Scenario: F2 renders real PDF pages

- **GIVEN** the real PDFs ingested into the samples bucket
- **WHEN** the user lands on F2 after picking Utility (or any sample)
- **THEN** the PdfViewer renders the document's actual pages — no placeholder

### Requirement: Seed script SHALL attach filter.workflow_id to every uploaded doc

The seed script `middleware/scripts/seed-bucket.ts` SHALL include
`workflow_id` in the filter on every ingest call AND on every filter
refresh (per `memory/project_workflow_id_filter.md`, locked
2026-05-25). Each `scenarios/*.json` MUST gain a `workflowId` field;
`ScenarioSpec` MUST include the field; `refreshManifestIfChanged()`
MUST drift-check `workflow_id` and PUT updates when it changes.

#### Scenario: Fresh re-seed carries workflow_id

- **GIVEN** a scenario JSON with `workflowId: "9910308e-…"`
- **WHEN** the seed script runs end-to-end
- **THEN** every uploaded doc carries `filter.workflow_id` matching the scenario's authored value
- **AND** a manual `workflow_id` change in the scenario JSON triggers a PUT update on the existing doc

