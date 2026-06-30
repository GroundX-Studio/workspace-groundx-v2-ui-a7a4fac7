# Spec Delta — scenarios

Report is a general capability reachable for **all** scenarios over the active `ContentScope`. The
**Utility** single-document case is the v1 demo fixture; **Solar** exercises the multi-document /
multi-project generality on the same surface (live behind WF-10).

## ADDED Requirements

### Requirement: Report SHALL be reachable for every scenario

Every scenario SHALL reach the Report chapter — report runs over the active `ContentScope`, so it is
not a per-scenario feature flag. `chapters.report` SHALL NOT gate reachability (if retained it only
flavors guided-demo emphasis). Each scenario SHALL render a report over its current scope (for the
demos, `bucket + project filter`).

#### Scenario: Any scenario reaches Report

- **GIVEN** any scenario (Utility, Loan, Solar)
- **WHEN** the user clicks the Report step-strip pill
- **THEN** the report render surface opens over that scenario's current scope.

### Requirement: The Utility scenario SHALL ship the v1 single-document report fixture

The Utility scenario SHALL ship a MOCK_MODE report fixture — a single-document IC-brief-style
template scoped to the Utility bill via `bucket + project filter` (the demo's opening scope) with
sections such as billing summary, charge breakdown, anomalies, and recommendation, plus their cited
rendered bodies — so the Report chapter is demonstrable on the current real use case without the live
multi-doc seed (WF-10).

#### Scenario: Utility report previews on the single-doc scope

- **GIVEN** MOCK_MODE and the Utility scenario
- **WHEN** the user reaches the Report chapter
- **THEN** the render surface shows the single-doc IC-brief sections with cited bodies
- **AND** the builder shows those sections as editable rows.

### Requirement: The Solar scenario SHALL exercise the multi-document / multi-project report path

The Solar scenario SHALL carry a report template whose scope spans **many documents across projects**
(a `group` or `bucket + filter` `ContentScope`), demonstrating that the same report surface renders
1→N documents, projects, and workspaces. Authoring the live Solar documents remains WF-10 (blocked on
source assets); until then a MOCK_MODE Solar fixture SHALL drive this multi-doc path, and live render
SHALL supersede the fixture on the same surface when WF-10 lands.

#### Scenario: Solar exercises a multi-document scope on the same surface

- **GIVEN** the Solar scenario
- **WHEN** the report renders
- **THEN** it runs over a multi-document `ContentScope` (group or bucket+filter) on the same surface Utility uses
- **AND** no surface-specific fork is required for the multi-document case.
