## ADDED Requirements

### Requirement: Report builder section editor supports rewrite and per-section preview
The report builder's EXISTING inline section editor (`SectionRow` in `SmartReportBuilder`, refactored — NOT a new parallel component) SHALL expose rewrite-with-agent (tuning `renderAs`, `question`, `instructions`, `variables`; never `name`) and a per-section answer preview, both via the shared `useTemplateItemAgent` hook with the report-section adapter. Per-section preview SHALL render only the selected section against the session scope using the existing `renderReport` `sectionIds` parameter, distinct from rendering the whole template.

#### Scenario: Rewrite a report section's question
- **WHEN** the user clicks rewrite-with-agent on a report section
- **THEN** the grounded agent proposes an improved section (question + instructions + renderAs + variables) shown as before→after; Accept populates the section form

#### Scenario: Preview a single section
- **WHEN** the user previews one section with its current unsaved values
- **THEN** only that section is rendered against the scope and its rendered text + citations are shown, without rendering the entire report

#### Scenario: Whole-template render is unchanged
- **WHEN** the user renders the full report
- **THEN** the existing whole-template render path is used and per-section preview does not alter it
