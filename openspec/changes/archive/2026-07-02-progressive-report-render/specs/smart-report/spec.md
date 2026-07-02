## MODIFIED Requirements

### Requirement: The report render surface (S3) SHALL stream ordered, cited sections

The render surface SHALL obtain its rendered report from the render endpoint
(`POST /api/widgets/smart-report/reports/render`) on its **initial** paint — not from a synchronous
client-side fixture read — so the surface the user first sees on the render surface is the endpoint response
(the same path the `↻ re-render` control and the builder Save already use). It SHALL display the
rendered report as its template's sections **in template order**, each with a heading, a body formatted per
`renderAs`, and inline citations using the shared `CiteChip` (honoring the WF-06b tiers). Sections SHALL
be laid out as **template-order slots**; over the wire each section MAY arrive as soon as it completes
(arrival order is arbitrary — sections render concurrently), and the surface SHALL place each arriving
section into its template-order slot, so display order is always template order regardless of completion
order. Each section heading SHALL carry an **✎ edit §N** affordance that navigates to the builder (the
`builder` surface) with that section pre-selected. While a section's slot is still in flight the surface SHALL
show a per-slot loading state; if the endpoint returns no renderable report for the scope it SHALL show the
empty state; if the initial render call fails outright it SHALL show a retryable error affordance rather than a
blank surface or a thrown render. (The endpoint runs the live GroundX fan-out; no MOCK_MODE.)

#### Scenario: Initial paint renders the endpoint response into template-order slots

- **GIVEN** the user reaches the Report render surface
- **WHEN** the surface mounts
- **THEN** it calls `POST /api/widgets/smart-report/reports/render` for its initial report (not a synchronous fixture read)
- **AND** sections are laid out in template order with headings, `renderAs`-formatted bodies, and `CiteChip`s
- **AND** a section that completes later than a following section still lands in ITS template-order slot (display order = template order, not completion order)
- **AND** each heading exposes an edit affordance that opens the builder surface with that section selected.

#### Scenario: Render degrades through loading, empty, and error

- **GIVEN** the render call to the endpoint
- **WHEN** a section's slot is in flight
- **THEN** that slot shows a visible loading state (not a blank surface)
- **AND** **WHEN** the endpoint returns no renderable report for the scope
- **THEN** the surface shows the empty state
- **AND** **WHEN** the render call fails outright
- **THEN** the surface shows a retryable error affordance and does not throw.

#### Scenario: Initial paint and re-render share one fetch path

- **GIVEN** the render surface
- **WHEN** the initial paint and a later `↻ re-render` both resolve their report
- **THEN** both come from the same `POST /api/widgets/smart-report/reports/render` call path
- **AND** no synchronous client-side fixture-read survives as the surface's first-paint source.

### Requirement: The render endpoint SHALL run a template over a ContentScope and return cited sections

The middleware SHALL expose `POST /api/widgets/smart-report/reports/render` accepting
`{ template_id, scope: ContentScope, variables, section_ids|null, chat_session_id, parent_message_id }`.
A `section_ids` subset SHALL scope a re-render to those sections only.

The endpoint SHALL render sections with **bounded concurrency** (not one-at-a-time), so
overall latency approximates the slowest section rather than the sum of all sections.

The endpoint SHALL support two deliveries by content negotiation, over the SAME compute
path:

- A request WITHOUT `Accept: text/event-stream` SHALL receive the existing single JSON
  envelope UNCHANGED: `{ report_id, template_id, status, sections:[{ name, render_as,
  body, cites, confidence, warnings }], resolved_variables, export_formats, preview_only }`.
- A request WITH `Accept: text/event-stream` SHALL receive an SSE stream: a `meta` frame
  (report_id, template_id, ordered section ids) first; one `section` frame per section as
  it completes (carrying that section's ordinal + wire shape + a `status`); a terminal
  `done` frame (resolved_variables, export_formats, preview_only) or an `error` frame.

#### Scenario: Non-streaming request returns the unchanged JSON envelope

- **GIVEN** a saved template and a `ContentScope`
- **WHEN** `POST /api/widgets/smart-report/reports/render` is called WITHOUT the SSE Accept header
- **THEN** the response is the existing single JSON envelope with `sections[]` in template order, each with `body`, `cites`, `render_as`
- **AND** `preview_only` reflects whether this was a sample-scope preview

#### Scenario: Streaming request delivers sections as they complete

- **GIVEN** a template with multiple sections and `Accept: text/event-stream`
- **WHEN** the endpoint renders
- **THEN** a `meta` frame with the ordered section ids arrives first
- **AND** each section arrives in its own `section` frame as soon as that section finishes (not after all sections)
- **AND** a terminal `done` frame carries `resolved_variables`, `export_formats`, `preview_only`

#### Scenario: Sections render concurrently, not sequentially

- **GIVEN** a template whose sections each take comparable time
- **WHEN** the endpoint renders them
- **THEN** total render time approximates the slowest single section, not the sum of all sections

## ADDED Requirements

### Requirement: Report render SHALL isolate and retry per section, never failing the whole report

Each section's generation SHALL be isolated: a section's timeout or error SHALL NOT abort
the other sections or fail the whole render. A transient timeout SHALL be retried at least
once. A section that ultimately cannot be generated SHALL be delivered with a `failed`
status (streaming) or a warning-flagged body (JSON) in its own slot, and the overall report
SHALL still be produced. The endpoint SHALL NOT return a wholesale 504 because one section
was slow.

#### Scenario: One slow section does not sink the report

- **GIVEN** a template where one section's generation exceeds the upstream timeout even after a retry
- **WHEN** the report renders
- **THEN** that one section is delivered with a `failed`/low-confidence status in its slot
- **AND** every other section is delivered normally
- **AND** the request does NOT return a 504 for the whole report

### Requirement: A failed section slot SHALL be independently retryable from the surface

A section delivered with a `failed` status SHALL render an inline "couldn't generate —
retry §N" affordance that re-renders THAT section only (via the `section_ids` subset
re-render), without disturbing the already-rendered slots. (Progressive template-order
slot fill-in itself is specified in the modified S3 requirement above; this requirement
adds only the failure-recovery affordance.)

#### Scenario: A failed slot is independently retryable

- **GIVEN** the render surface has a section delivered with `failed` status
- **WHEN** the user activates its "retry §N" affordance
- **THEN** only that section re-renders (a `section_ids` subset render), the other slots are untouched
- **AND** on success the slot replaces its error affordance with the rendered section

### Requirement: Save and Export SHALL require a complete report, with a reload affordance to recover

Save and Export SHALL be disabled while ANY section is in a `failed` state — the exported
/ saved report must be complete. This completeness gate is SEPARATE from and ADDITIONAL to
the scope-based anon/BYO gate (which still mirrors Extract). To avoid a dead-end, the
surface SHALL show a recovery affordance while any section is failed — a "N sections failed
— retry" control that re-renders all failed sections in one `section_ids` subset render.
When the last failed section succeeds, Save and Export SHALL re-enable. Viewing the
(partial) report SHALL never be blocked by this gate.

#### Scenario: Save/Export blocked until the report is whole, then re-enabled

- **GIVEN** a rendered report with at least one section in `failed` state
- **WHEN** the user looks at Save / Export
- **THEN** both are disabled, and a "N sections failed — retry" recovery affordance is visible
- **AND** the partial report is still fully viewable (the gate blocks only Save/Export)
- **AND** **WHEN** the user retries and every section then succeeds
- **THEN** Save and Export re-enable
- **AND** retrying one section leaves the already-rendered sections untouched
