# smart-report Specification (delta)

## ADDED Requirements

### Requirement: Report rendering SHALL have a live multi-doc path, not only a fixture

Report rendering SHALL have a **live** render path that produces real cited sections — not only the
MOCK_MODE fixture. Outside MOCK_MODE, for each template section (in template order, honoring any
`section_ids` subset), the render service SHALL search the section's `question` over the resolved
`ContentScope` doc set, run grounded LLM generation over the returned snippets, verify each
citation against its source chunk via the WF-06b path (verify → tier → confidence), and emit a
cited section. The live path SHALL reuse the established live precedents (the Extract per-field
search→generate→parse loop and the RAG search→generate→verify pipeline) rather than re-implement
search, generation, or verification. The live path SHALL return the **same**
`RenderReportResponse` shape the fixture path returns — ordered sections each carrying `name`,
`render_as`, `body`, `cites`, optional `confidence`, and optional `warnings` — so the render
surface and `CiteChip` are unchanged regardless of which path produced the report. Outside
MOCK_MODE the render service SHALL require its live dependencies (GroundX client + API key + LLM
client + model id) and SHALL throw a clear error when they are absent, mirroring the Extract and
RAG required-deps guards. This requirement does NOT remove MOCK_MODE — after it is satisfied the
render service works **both** with the fixture and live.

#### Scenario: Live render returns cited sections without MOCK_MODE

- **GIVEN** MOCK_MODE is OFF and the render service has a GroundX client, API key, LLM client, and model id
- **WHEN** a report is rendered over a non-empty sample `ContentScope`
- **THEN** each section's `question` is searched over the resolved doc set, an LLM generates a grounded body, and each citation is verified (tier + confidence)
- **AND** the response is the same `RenderReportResponse` shape as the fixture path (ordered sections with `name`, `render_as`, `body`, `cites`, `confidence?`, `warnings?`).

#### Scenario: Live render preserves the section degradations

- **GIVEN** the live render path and a section with no supporting source in the resolved doc set
- **WHEN** that section renders
- **THEN** it degrades to `—` with a `⚠ no support in docs` low-confidence flag, the same as the fixture path
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

## MODIFIED Requirements

### Requirement: The live multi-document render (Phase 7) SHALL remain deferred to WF-10

The live multi-document render path SHALL be **built**: it fans each section's `question` through
GroundX search (scoped by the render's `ContentScope`) with grounded generation and WF-06b
verification against real documents. The render surface SHALL serve the live multi-document case
with no surface rework. The MOCK_MODE fixtures SHALL remain available as the offline render path
alongside the live path — removing MOCK_MODE is a separate, dependent change and is NOT in scope
here. (The Solar multi-document / multi-project / multi-workspace render still depends on the
WF-10 source-content seed; this change wires the live render mechanism so it is ready for that
content, and serves the live path today for sample scopes whose documents exist.)

#### Scenario: Live render path is wired alongside the fixture

- **GIVEN** MOCK_MODE is OFF
- **WHEN** the report surface renders a non-empty sample scope
- **THEN** the report is sourced from a live GroundX search + grounded-generation + WF-06b-verification fan-out, not the fixture
- **AND** **GIVEN** MOCK_MODE is ON
- **THEN** the same render service still returns the fixture result with no surface rework.
