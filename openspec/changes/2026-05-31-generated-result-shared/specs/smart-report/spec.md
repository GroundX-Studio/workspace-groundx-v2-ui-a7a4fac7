# smart-report (delta)

## ADDED Requirements

### Requirement: The report render wire section SHALL be a shared generated-result specialization

The report render wire section SHALL derive its generated-result fields — `body`, citations
(`cites`), optional `confidence`, optional `warnings` — from the shared `RenderedSection`
(`GeneratedResult` specialization) in `@groundx/shared`, NOT from a free-standing per-side interface.
Both wire twins — the middleware render endpoint and the app render client — SHALL anchor those
fields to the shared core via a compile-time drift assert (`Eq<>` or structural), so the report
body/citations/confidence/warnings contract cannot drift from Extract's shared generated-result core.
The snake_case display metadata the wire carries (`name`, `render_as`, and the `cites` alias for the
shared `citations`) MAY remain layered on top as the wire-specific view; only the generated-result
core is single-sourced. The change SHALL be behavior-preserving: the emitted render wire JSON is
byte-identical and the rendered Report sections (markdown body, CiteChips, confidence/warnings, and
the em-dash low-confidence degrade) are unchanged.

#### Scenario: The wire section is pinned to the shared generated-result core

- **GIVEN** the middleware and app `RenderedSectionWire` declarations
- **WHEN** either re-forks the body/citations/confidence/warnings core away from the shared `RenderedSection`
- **THEN** the compile-time drift assert fails and `npm run build` (tsc) errors
- **AND** with both wire twins derived from the shared core, the build passes and the render wire JSON is unchanged.

#### Scenario: Rendered Report output is preserved through the single-sourcing

- **GIVEN** a rendered report (sections with markdown bodies, citations, and a low-confidence section)
- **WHEN** the render endpoint and the app client run against the single-sourced wire section
- **THEN** the rendered sections, CiteChips, confidence/warnings, and the em-dash low-confidence degrade are identical to before
- **AND** the full SmartReport render + app `smartReport` test suites pass with no behavior change.
