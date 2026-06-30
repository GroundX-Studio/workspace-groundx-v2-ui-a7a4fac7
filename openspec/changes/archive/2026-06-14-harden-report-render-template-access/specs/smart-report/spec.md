# Spec Delta — smart-report

## ADDED Requirements

### Requirement: The report render path SHALL access-scope its template load identically to the read endpoint

The live report render SHALL load its template by id ONLY when the caller is
permitted to read it — by the SAME rule the builder's template-read endpoint
applies: the public sample (sentinel-owned) is readable by anyone, a member may
read their own template, and no other template is returned. Both read paths
(the builder `GET …/reports/template/:id` endpoint and the render's template
load) SHALL derive this decision from ONE shared predicate so they cannot drift.
When the caller is NOT permitted to read the requested template, the render
SHALL behave exactly as if no template existed — the graceful no-template empty
render — leaking no signal that the template exists. This closes the read-side
IDOR before members can persist private report templates.

#### Scenario: An anonymous caller cannot render a member-owned template

- **GIVEN** a report template owned by a member (neither the public sample nor the caller)
- **WHEN** an anonymous caller posts a render request naming that template id
- **THEN** the render returns the empty no-template state, NOT that template's sections
- **AND** the response is indistinguishable from rendering a non-existent template id.

#### Scenario: The public sample still renders for anyone

- **GIVEN** the sentinel-owned public sample report template
- **WHEN** an anonymous caller renders it
- **THEN** the template's sections render normally (the sample is readable by all).

#### Scenario: A member can render their own template

- **GIVEN** a report template owned by the signed-in caller
- **WHEN** that member renders it
- **THEN** the template loads and its sections render.
