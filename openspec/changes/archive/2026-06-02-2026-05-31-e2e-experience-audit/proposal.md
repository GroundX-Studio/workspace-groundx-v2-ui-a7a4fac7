# Full end-to-end experience audit + defect remediation (2026-05-31)

## Why

The onboarding and steady experiences have been built and rewired surface-by-surface across
many changes (wireframe-fidelity, live-data rewires, citation geometry, gate-as-chat, etc.).
No single pass has driven **every interactive control** end to end against the running app
with **measured** evidence. Per-surface audits have repeatedly caught defects that passed
self-review (e.g. the 24px-collapsed PDF canvas that *looked* fine in a screenshot but was
broken in fact). This change runs ONE exhaustive interaction audit of the live experience —
click every button, exercise every path — captures measured state for each, logs every
defect, then fixes each defect (failing regression test where feasible) until the experience
clears a visual + functional bar with no open defect.

This is an exploratory-audit-then-fix change: the audit passes discover the work; the defect
log + fix loop close it. It is not pure TDD up front (we don't know the defects yet), but
every confirmed defect SHALL get a regression test before its fix lands.

### Tooling policy (locked project rule — encoded here)

- **Launch the dev servers with `Claude_Preview` `preview_start`** (it reads
  `.claude/launch.json` and starts the paired frontend + middleware). This is the reliable
  start path.
- **Capture screenshots with `Claude_Preview` `preview_screenshot`** — the reliable screenshot
  path (Chrome DevTools `take_screenshot` has timed out repeatedly on this project).
- **Use the `chrome-devtools` MCP for inspection**: DOM measurement via `evaluate_script`,
  network response bodies, console errors, and the accessibility snapshot.
- **MEASURE, don't eyeball.** Every assertion of a rendered effect SHALL be backed by a
  measured value (real rendered width/height/visibility/scroll position/attribute via
  `evaluate_script`, a network response body, a console state, or an a11y-tree node) — not by
  glancing at a screenshot. Screenshots are corroborating evidence, never the proof.

## What Changes

- **Interaction inventory.** Build a single checklist file enumerating every interactive
  control and path across both experiences (read `app/src/views` + `app/src/components` to
  ground it). This is the audit's scope-of-record.
- **Per-surface audit passes.** One task per surface drives its controls via the MCP and
  records measured evidence (a measured value + expected effect + pass/defect verdict per
  control). Surfaces:
  - **Onboarding F1→F7** — sign-up; ingest / sample picker; understand / PdfViewer; extract /
    Extract widget + schema builder; interact / chat; report render + builder; integrate.
  - **Steady mode** — workspaces / projects nav and the same production widgets on real data.
  - **Widget controls** — PdfViewer (zoom, page, citation chips); Extract (field add / edit,
    JSON-render toggle); SmartReport (render, section accept / reject, builder); Integrate
    (connectors).
  - **Chat surface** — input, thinking stream, suggested-action chips, propose-schema-field
    card, booking card.
  - **Gates** — open / commit / dismiss, the gate overlay.
  - **Citation round-trip** — citation chip click → viewer mount → measured highlight on real
    geometry.
  - **Auth** — login, register, password show / hide, claim / anon→authed flip.
  - **Debug overlay reset** — clears all session state (forward-binding check vs
    `resetExperience`).
  - **Responsive breakpoints** + **reduced-motion**.
- **Defect log.** A single ledger of every defect found (id, surface, control, measured
  actual vs expected, severity).
- **Fix loop.** Each logged defect → a failing regression test where feasible → fix →
  re-verify with a fresh measured pass. Defects that are out of scope to fix here are
  explicitly triaged and ticketed (OpenSpec change or `spawn_task`), never left as stale code.
- **Sign-off.** Acceptance = every inventoried path exercised with measured evidence AND no
  open defect (every defect fixed, or explicitly triaged + ticketed). Suites + build green;
  `openspec validate --strict`; archive.

## Affected

- **Specs:** `testing-suite` (primary — the durable e2e-audit contract). `ui-views` /
  `ui-runtime` may be touched only if a defect reveals a missing durable UI requirement;
  primary stays in `testing-suite`.
- **App / middleware:** any surface a confirmed defect lives in (`app/src/views/*`,
  `app/src/components/{chat-widgets,viewer-widgets}/*`, `app/src/lib/resetExperience.ts`,
  relevant middleware routes) — scoped per logged defect, not speculatively.
- **Audit artifacts:** the interaction-inventory checklist + the defect log live under this
  change directory.
