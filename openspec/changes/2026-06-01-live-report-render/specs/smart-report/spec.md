# smart-report Specification (delta)

## ADDED Requirements

### Requirement: The sample report template SHALL be persisted server-side as the live path's source of section questions

The sample report template (`rt-utility-ic-brief`, the Utility IC-brief) SHALL be persisted
server-side as a `report`-kind `Template` whose sections each carry a `question`, so the live render
path obtains its section questions from the SERVER (the durable Template), not from the client
request or a client fixture. The persistence SHALL use the same `Template` lifecycle Extract uses
(the shared `saveTemplate` / `getTemplate` repo API + the `report`-kind `TemplateSaveInput` bridge),
with server-assigned ownership. The fixture (MOCK_MODE) pre-rendered bodies MAY remain as the
offline render bodies, but they SHALL NOT be the source of section *questions* for the live path.
The client request SHALL NOT carry section questions (one source of truth: the persisted Template).

#### Scenario: The sample template is retrievable from the server without a prior Save

- **GIVEN** a fresh deployment (no client has hit the report Save endpoint)
- **WHEN** the render service resolves the `rt-utility-ic-brief` template by id
- **THEN** `getTemplate` returns a `report`-kind Template with the four ordered sections (`billing_summary`, `charge_breakdown`, `anomalies`, `recommendation`), each carrying a non-empty `question` and its `renderAs`
- **AND** the live path fans each section's `question` from that persisted Template, never from the client request.

### Requirement: Report rendering SHALL have a live multi-doc path, not only a fixture

Report rendering SHALL have a **live** render path that produces real cited sections — not only the
MOCK_MODE fixture. Outside MOCK_MODE, for each template section (in template order, honoring any
`section_ids` subset), the render service SHALL search the section's `question` (read from the
server-persisted Template) over the resolved `ContentScope` doc set, run grounded LLM generation
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
