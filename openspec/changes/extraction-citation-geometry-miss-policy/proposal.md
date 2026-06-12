# Extraction-citation geometry-miss policy — data-gated follow-up

## Status: NOT STARTED — gated on funnel data (T-DEFER-2 of 2026-06-12-harden-citation-emission)

## Why

The durable chat-routing spec requires that a FULLY VALIDATED
extraction-sourced citation (documentId matches, `field` path resolves,
`value` matches the payload) be DROPPED when geometry cannot be resolved
("no pageless citation form", user decision 2026-06-11). One live all-dropped
turn was observed (6 emitted → 0 shipped) before the funnel existed; the
funnel's `dropReasons.geometry` counter now measures how often validated
claims die on geometry alone.

## Decision gate (do this FIRST — the change may be a no-op)

Measure `dropReasons.geometry` over a usage soak. If geometry-only drops are
rare, CLOSE this change with the measurement recorded — the locked rule
stands.

## What (only if the gate trips — a USER DECISION is required either way)

Options to put to the user with the data:
1. Keep the drop (status quo) — citations only ever point at a page.
2. Ship a source-chip-only citation (no page, no bbox) for validated
   extraction claims — requires relaxing the locked requirement via the
   MODIFIED delta in this change AND an FE rendering decision (CiteChip
   without a highlight target).
3. Fall back to the primary document's page 1 with no bbox — rejected in
   prior review (wrong-region risk); listed for completeness.

Per the locked discipline: the spec delta lands BEFORE any behavior change.

## Conformance to core architectural decisions

- **Composable (P1):** policy change inside `verifyExtractionCitation`; no
  new component or abstraction.
- **Done-able (P5):** closure = measurement recorded + user decision; if
  relaxed, a live extraction-grounded turn shows the chip render.
- **One source of truth (P6):** the shared `Citation` shape decision (page
  optional?) is the core cost of option 2 — called out, not hidden.
- **TDD (P2):** if built, starts with a failing test (validated entry +
  unresolvable geometry → chip-only citation, not a drop).
