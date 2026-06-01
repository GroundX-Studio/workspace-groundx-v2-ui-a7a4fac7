# Spec Delta — testing-suite

> This change extends the durable end-to-end audit contract with the **remaining-surfaces**
> follow-up obligation (the surfaces the foundational live sweep did not yet drive) and a
> **console-clean** acceptance bar. It builds on, and does not restate, the parent audit's
> requirements (full-audit-before-release, measured-evidence-not-screenshots, enumerated-surface
> coverage, regression-test-per-fix). The chat-RAG retrieval defect (DL-1) is owned by a separate
> change and is out of scope here.

## ADDED Requirements

### Requirement: The remaining audit surfaces SHALL be exercised with measured evidence before release

The surfaces the foundational live sweep did not yet drive SHALL each be exercised live against
the running paired frontend + middleware (REAL backend, no mock data) with **measured** evidence
before this change is released. At minimum these surfaces are: deep Extract (field add / edit,
the JSON-render toggle flipping the output format, and a field-card click producing a
source-region highlight on the document); Report rendered WITH a user-created template, section
accept / reject as a state change, the report builder, and the pin→report path; Integrate
(connector controls and plugin-download states); the sign-up gate (staggered reveal, the
three doors of magic-link / SSO / book-a-call, the value-prop canvas, commit, and dismiss); the
gate lifecycle (open via Save / Export / metered ceiling, commit each method, dismiss / back-out,
the overlay, and navigation while gated); the citation chip → viewer round-trip landing on real
geometry and surviving a refresh; auth (login, register, password show / hide, reset, and the
claim / anonymous→authenticated flip preserving state); steady-mode parity (workspaces / projects
navigation and the same production widgets on real data with the mode prop set to steady); the
debug-overlay reset clearing all session state; responsive layout at desktop and mobile
viewports; and reduced-motion degradation. Every "expected effect" verdict SHALL cite a measured
value read from the live DOM, a network response body, a console state, or the accessibility
tree — not a screenshot. No listed surface SHALL be left unexercised at sign-off.

#### Scenario: Each remaining surface is driven live with a measured verdict

- **GIVEN** the running experience and the list of remaining surfaces (deep Extract, templated Report + builder + pin→report, Integrate, the sign-up gate, the gate lifecycle, the citation round-trip, auth, steady-mode parity, the debug reset, responsive, and reduced-motion)
- **WHEN** the follow-up audit completes
- **THEN** each surface has been driven live with its controls exercised and a recorded verdict
- **AND** every verdict cites a measured value (rendered dimension, visibility, DOM attribute, scroll position, network body, console state, or a11y node), not a screenshot
- **AND** any surface left unexercised blocks sign-off.

#### Scenario: A toggle / flip control is proven by a measured before/after state

- **WHEN** the audit drives a state-flipping control (the Extract JSON-render toggle, a section accept / reject, or the password show / hide toggle)
- **THEN** the verdict cites the measured before and after state read from the live DOM or network body — the output format switching, the section's accepted/rejected status changing, or the password input `type` attribute flipping between `password` and `text`
- **AND** not a screenshot glance.

#### Scenario: The citation round-trip is proven by a measured highlight on real geometry

- **WHEN** the audit clicks a citation chip
- **THEN** the verdict cites the mounted document id and page read from the live state AND a measured non-zero highlight rectangle over the cited region drawn from real geometry
- **AND** the highlight is re-measured present after a page refresh.

### Requirement: The audit happy path SHALL be console-clean and free of non-2xx responses

A full pass over the golden happy path SHALL produce no uncaught console error and no non-2xx
network response that is not an intended, self-healing transient. Any uncaught error or
unexpected non-2xx on a happy path SHALL be recorded as a defect and fixed or triaged before
release. In particular, the recurring framework future-flag console warning SHALL be eliminated:
the audit SHALL hold a console-clean assertion that fails while the warning is present and passes
once the warning is resolved at its source (router configuration) or suppressed.

#### Scenario: The console-clean assertion fails before the fix and passes after

- **GIVEN** the experience currently logs the router v7 future-flag warning repeatedly on the happy path
- **WHEN** a console-clean assertion is added that asserts no such warning is logged
- **THEN** the assertion fails before the fix
- **AND** after the router future flags are set (or the warning is suppressed) the assertion passes and the warning count is measured at zero on a re-driven route transition.

#### Scenario: A happy-path non-2xx or uncaught error is logged as a defect

- **WHEN** the full happy-path console + network sweep observes an uncaught console error or a non-2xx response that is not an intended self-healing transient
- **THEN** it is recorded as a defect-log row with its measured detail
- **AND** it is fixed and re-verified, or triaged to a referenced ticket, before sign-off.
