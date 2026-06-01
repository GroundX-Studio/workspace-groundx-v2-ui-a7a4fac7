# Spec Delta — testing-suite

> This change adds the durable contract for a full end-to-end interaction audit of the running
> experience: every interactive control exercised via browser automation with **measured**
> verification, every defect fixed or explicitly triaged before release. The existing
> testing-suite requirements (widget-test decision, browser smoke + a11y golden path, nightly
> visual regression, load test) are unchanged — this audit is the manual/automated exhaustive
> interaction sweep that complements them.

## ADDED Requirements

### Requirement: The experience SHALL pass a full end-to-end interaction audit before release

The running experience SHALL pass a full end-to-end interaction audit in which every
interactive control on every surface is exercised via browser automation, and every defect
found is fixed or explicitly triaged + ticketed, before the change is released. The audit
SHALL be driven against the live paired frontend + middleware, SHALL be scoped by a written
interaction inventory that enumerates every control and navigation path, and SHALL conclude
only when every inventoried path has been exercised AND the defect log has no open defect.

#### Scenario: Audit signs off with no open defect

- **GIVEN** the live experience and a written interaction inventory enumerating every interactive control and navigation path
- **WHEN** the audit exercises every inventoried control via browser automation and records the result of each
- **THEN** every inventory row is marked exercised
- **AND** the defect log contains no `open` row — every logged defect is either `reverified` (fixed and re-checked) or `triaged-ticketed` (deferred to a referenced ticket)
- **AND** the change is not released while any open defect remains.

### Requirement: Audit verdicts SHALL be backed by measured evidence, not screenshots alone

Every "expected effect" verdict in the audit SHALL be backed by a measured value obtained via
browser inspection — a real rendered dimension, visibility, attribute, scroll position, a
network response body, a console state, or an accessibility-tree node — captured via the
DevTools inspection MCP. A screenshot SHALL be corroborating evidence only and SHALL NOT by
itself stand as proof that a control worked. In particular, "rendered" SHALL require asserting
non-collapsed rendered dimensions (both width and height greater than zero), so a visually
plausible but functionally collapsed surface (e.g. a height-collapsed PDF canvas) is caught.

#### Scenario: A rendered surface is proven by measured dimensions

- **WHEN** the audit verifies that a surface (e.g. the PDF viewer canvas) rendered
- **THEN** the verdict cites a measured rendered width AND height, both greater than zero, read from the live DOM
- **AND** a screenshot is attached only as corroboration, never as the sole proof.

#### Scenario: A control effect is proven by measured state change

- **WHEN** the audit drives a control (e.g. a JSON-render toggle, a zoom button, a password show/hide toggle)
- **THEN** the verdict cites the measured before/after state (e.g. the output format, the rendered scale, or the input `type` attribute) read from the live DOM, network body, or a11y tree
- **AND** not from glancing at a screenshot.

### Requirement: The audit SHALL cover the enumerated interaction surfaces

The interaction inventory SHALL cover, and the audit SHALL exercise, at minimum: the
onboarding flow F1→F7 (sign-up, ingest / sample picker, understand / PdfViewer, extract /
Extract widget + schema builder, interact / chat, report render + builder, integrate); steady
mode (workspaces / projects navigation and the same production widgets on real data); every
widget's controls (PdfViewer zoom / page / citation chips, Extract field add / edit /
JSON-render toggle, SmartReport render + section accept / reject + builder, Integrate
connectors); the chat surface (input, thinking stream, suggested-action chips,
propose-schema-field card, booking card); gates (open / commit / dismiss and the gate
overlay); the citation chip → viewer mount round-trip landing on real geometry; auth (login,
register, password show / hide, claim / anonymous→authenticated flip); the debug-overlay
reset; responsive breakpoints; and reduced-motion. No inventoried surface SHALL be skipped at
sign-off.

#### Scenario: Every enumerated surface is exercised

- **GIVEN** the interaction inventory covering onboarding F1→F7, steady mode, each widget's controls, the chat surface, gates, the citation round-trip, auth, the debug reset, responsive breakpoints, and reduced-motion
- **WHEN** the audit completes
- **THEN** each of those surfaces has been driven live with its controls exercised and a recorded verdict
- **AND** any surface left unexercised blocks sign-off.

### Requirement: Each audit-found defect SHALL be reproduced by a regression test where feasible before its fix

Each confirmed defect found by the audit that is fixed in this change SHALL, where feasible,
first be reproduced by a failing regression test (view test, widget test, round-trip test, or
a browser-measured assertion when no unit-level test can reach it); the fix SHALL then make
that test pass and SHALL be re-verified live with a fresh measured pass on the real surface. A
defect that is not fixed in this change SHALL be explicitly triaged and ticketed (an OpenSpec
change or a spawned task), with no dormant or stale code left behind.

#### Scenario: A fixed defect carries a regression test and a live re-verification

- **GIVEN** a confirmed defect with a measured wrong behavior
- **WHEN** it is fixed in this change
- **THEN** a regression test that reproduced the wrong behavior exists and now passes
- **AND** the defect is re-verified live with a fresh measured value matching the expected behavior.

#### Scenario: A deferred defect is triaged and ticketed

- **GIVEN** a confirmed defect that is out of scope to fix in this change
- **WHEN** the audit closes out
- **THEN** the defect is recorded as triaged with a reference to its tracking ticket (OpenSpec change or spawned task)
- **AND** no partial or dormant code for it is left in the tree.
