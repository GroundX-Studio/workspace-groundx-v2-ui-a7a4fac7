# smart-report Specification (delta)

## ADDED Requirements

### Requirement: Report rendering SHALL treat a missing template as the legitimate new-customer starting state

The render service SHALL treat a missing report template as the legitimate new-customer starting
state — a brand-new authenticated customer legitimately has ZERO report templates (`Pin→template =
NO auto`; the existing-or-new UX of the Template + Scope + Results model). The render service SHALL
load the template by the render request's `template_id` via the shared `getTemplate` repo API; when
no template exists for that id, `renderReport` SHALL return the graceful **no-template state** (no
sections, complete, preview-only) — it SHALL NOT return an error and SHALL NOT fabricate or seed a
render. The no-template state SHALL be DISTINGUISHABLE on the wire from an empty-doc-set render via a
discriminator (e.g. `reason: "no_template"` vs `"empty_scope"`) so the surface shows the right copy —
"create or pick a report template" vs "no documents match this scope" — rather than one ambiguous
empty state (make-illegal-states-unrepresentable; two genuinely different user situations are not
conflated). No sample report template SHALL be persisted/seeded by this
change; the ABSENCE of a sample template SHALL never break the render service. The live render
machinery (per-section search → ground → verify → cite) SHALL run ONLY when a real user-created
template exists; the section questions then come from that persisted Template, never from the client
request (one source of truth).

#### Scenario: A new customer with no template renders the no-template state, not an error

- **GIVEN** MOCK_MODE is OFF and no report template exists for the render request's `template_id` (the new-customer norm)
- **WHEN** a report is rendered
- **THEN** the render service returns the graceful no-template state (empty render shape: no sections, `status: "complete"`, `preview_only: true`), never an error and never a fabricated/fixture render
- **AND** no search or LLM call is made, and no sample template is seeded anywhere.

#### Scenario: When a real template exists, its sections drive the live path

- **GIVEN** MOCK_MODE is OFF and a real user-created `report`-kind Template exists for the request's `template_id`
- **WHEN** the render service resolves the template by id
- **THEN** `getTemplate` returns that Template and the live path fans each section's `question` from it
- **AND** the section questions come from the persisted Template, never from the client request.

### Requirement: Report rendering SHALL have a live multi-doc path, not only a fixture

Report rendering SHALL have a **live** render path that produces real cited sections — not only the
MOCK_MODE fixture. Outside MOCK_MODE, when a real user-created Template exists for the request's
`template_id` (when none exists, the no-template state applies — see the no-template requirement
above), for each template section (in template order, honoring any `section_ids` subset), the render
service SHALL search the section's `question` (read from that server-persisted Template) over the
resolved `ContentScope` doc set, run grounded LLM generation
over the returned snippets, verify each citation against its source chunk via the WF-06b path
(verify → tier → confidence), and emit a cited section. The live path SHALL reuse the established
RAG search → grounded-generation → WF-06b-verification orchestration (the genuine second caller of
that seam alongside `runRagPipeline`) rather than re-implement search, generation, or verification.
The live path SHALL return the **same** `RenderReportResponse` shape the fixture path returns —
ordered sections each carrying `name`, `render_as`, `body`, `cites`, optional `confidence`, and
optional `warnings` — so the render surface and `CiteChip` are unchanged regardless of which path
produced the report. The render service SHALL take its scope from the render REQUEST (Report's scope
is a render-time input on the request per Template + Scope + Results), NOT from the chat session's
active entity. Outside MOCK_MODE the render service SHALL require its live dependencies (GroundX
client + API key + LLM client + model id) and SHALL throw a clear error when they are absent,
mirroring the Extract and RAG required-deps guards. This requirement does NOT remove MOCK_MODE —
after it is satisfied the render service works **both** with the fixture and live.

#### Scenario: Live render returns cited sections without MOCK_MODE

- **GIVEN** MOCK_MODE is OFF and the render service has a GroundX client, API key, LLM client, model id, and the resolved server-persisted Template
- **WHEN** a report is rendered over a non-empty sample `ContentScope`
- **THEN** each section's `question` (from the persisted Template) is searched over the resolved doc set, an LLM generates a grounded body, and each citation is verified (tier + confidence)
- **AND** the response is the same `RenderReportResponse` shape as the fixture path (ordered sections with `name`, `render_as`, `body`, `cites`, `confidence?`, `warnings?`).

#### Scenario: Live and fixture share one section degradation path

- **GIVEN** the live render path and a section whose generated result has zero verified citations
- **WHEN** that section renders
- **THEN** it degrades to `—` with a `⚠ no support in docs` low-confidence flag, the same as the fixture path's no-source section
- **AND** an unresolved `{variable}` keeps its placeholder and adds a "bind it" warning, the same as the fixture path.

#### Scenario: Live render still gates BYO and idles on empty scope

- **GIVEN** MOCK_MODE is OFF
- **WHEN** the scope is a BYO scope
- **THEN** the render returns the gate envelope (`gated: true`, `gate: "byo"`) before any search or LLM call is made
- **AND** **WHEN** the scope resolves to an empty doc set
- **THEN** the render returns the idle empty result (`sections: []`, `status: "complete"`, `preview_only: true`) without an LLM call.

#### Scenario: Missing live deps throw a clear error

- **GIVEN** MOCK_MODE is OFF and a sample scope that resolves to documents
- **WHEN** the render service is invoked without a GroundX client, API key, or model id
- **THEN** it throws a clear "live render requires …" error (the Extract / RAG required-deps guard), not a "not yet wired" placeholder.

## REMOVED Requirements

### Requirement: The live multi-document render (Phase 7) SHALL remain deferred to WF-10

**Reason:** The live multi-document render path is now BUILT by this change (search +
grounded-generation + WF-06b verification over the request `ContentScope`), so a requirement that
mandates it "remain NOT built until WF-10" no longer holds. It is replaced by the ADDED requirement
"Report rendering SHALL have a live multi-doc path, not only a fixture" above, whose scenarios
reflect the built behavior. (The Solar multi-document content seed remains WF-10's concern; this
change wires the live render MECHANISM and serves the live path today for sample scopes whose
documents exist — it does not depend on the Solar seed.)

**Migration:** Callers that relied on "the report is always sourced from the MOCK_MODE-backed
render endpoint" must accept the live path outside MOCK_MODE. The MOCK_MODE fixture remains
available; removing it is the dependent change `2026-06-01-retire-mock-mode`.
