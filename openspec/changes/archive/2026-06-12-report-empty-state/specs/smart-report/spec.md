# Spec Delta — smart-report

## REMOVED Requirements

### Requirement: The Report chapter SHALL ship on the Utility single-doc case via a fixture

**Reason:** It mandated a client-side `MOCK_MODE` Utility report fixture
(`UTILITY_REPORT`, fabricated numbers). `MOCK_MODE` was removed entirely
(`project_prelaunch_correctness`); the fixture put fabricated data in front of
every user and its fake template id caused the live render to error. The fixture
is deleted; a REAL DB-backed default template (the `report-default-template`
change) replaces it.

## MODIFIED Requirements

### Requirement: Report rendering SHALL treat a missing template as the legitimate new-customer starting state

The render service SHALL treat a missing report template as the legitimate
new-customer starting state (`Pin→template = NO auto`). It SHALL load the
template by the request's `template_id` via the shared `getTemplate` repo API;
when none exists, `renderReport` SHALL return the graceful **no-template state**
(no sections, `status:"complete"`, `preview_only:true`) — never an error, never
a fabricated render — distinguishable on the wire from an empty-doc-set render
via a discriminator (`reason:"no_template"` vs `"empty_scope"`). The live render
machinery runs only when a real persisted template exists; section questions
come from that Template, never the client request.

The CLIENT SHALL mirror this: `SmartReportRender` SHALL resolve the template id
from REAL report state (`reportOverlay.templateId`), NEVER from a client-side
scope→fixture map; a `null` id SHALL show the empty state with no network call.
Report navigation SHALL be template-aware: a present template id routes to the
render surface, an absent one to the empty builder (existing-or-new UX). NO
client-side fake report fixture SHALL exist (a guard test enforces this).

#### Scenario: A new customer with no template renders the no-template state, not an error

- **GIVEN** no report template exists for the render request's `template_id`
- **WHEN** a report is rendered
- **THEN** the render service returns the graceful no-template state (no sections, `status:"complete"`, `preview_only:true`), never an error and never a fabricated render
- **AND** no search or LLM call is made.

#### Scenario: The client never invents a fixture template id

- **GIVEN** the report surface mounts with no `reportOverlay.templateId`
- **WHEN** it resolves what to render
- **THEN** it shows the empty state with no `renderReport` network call
- **AND** there is no client-side scope→fixture template routing in the codebase (enforced by a guard test).

#### Scenario: Report navigation is template-aware

- **GIVEN** the user activates the Report step
- **WHEN** `reportOverlay.templateId` is present
- **THEN** the render surface (f4) is shown
- **AND** when it is absent, the empty builder (f4a) is shown.

### Requirement: Report rendering SHALL have a live multi-doc path, not only a fixture

Report rendering SHALL produce real cited sections via a **live** render path —
there is NO fixture path (the client-side report fixture is removed) and no
`MOCK_MODE`. When a real persisted Template exists for the request's
`template_id` (else the no-template state applies), for each template section
(in template order, honoring any `section_ids` subset) the render service SHALL
search the section's `question` (read from that server-persisted Template) over
the resolved `ContentScope` doc set, run grounded LLM generation, verify each
citation via the WF-06b path (verify → tier → confidence), and emit a cited
section, reusing the established RAG search → grounded-generation →
WF-06b-verification orchestration rather than re-implementing it. The response
SHALL be the `RenderReportResponse` shape (ordered sections each carrying
`name`, `render_as`, `body`, `cites`, optional `confidence`, optional
`warnings`). Scope comes from the render REQUEST, NOT the chat session's active
entity. The render service SHALL require its live dependencies (GroundX client +
API key + LLM client + model id) and SHALL throw a clear error when absent.

#### Scenario: Live render returns cited sections

- **GIVEN** the render service has a GroundX client, API key, LLM client, model id, and a resolved server-persisted Template
- **WHEN** a report is rendered over a non-empty `ContentScope`
- **THEN** each section's `question` is searched, an LLM generates a grounded body, and each citation is verified (tier + confidence)
- **AND** the response is the `RenderReportResponse` shape (ordered sections with `name`, `render_as`, `body`, `cites`, `confidence?`, `warnings?`).

#### Scenario: A section with no verified support degrades visibly

- **GIVEN** a section whose generated result has zero verified citations
- **WHEN** it renders
- **THEN** it degrades to `—` with a `⚠ no support in docs` flag
- **AND** an unresolved `{variable}` keeps its placeholder and adds a "bind it" warning.

#### Scenario: BYO gates and empty scope idles

- **WHEN** the scope is a BYO scope
- **THEN** the render returns the gate envelope (`gated:true`, `gate:"byo"`) before any search/LLM call
- **AND** when the scope resolves to an empty doc set, it returns the idle empty result (`sections:[]`, `status:"complete"`, `preview_only:true`) without an LLM call.
