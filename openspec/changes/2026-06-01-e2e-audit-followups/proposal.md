# E2E audit follow-ups — remaining live surfaces + DL-2 (2026-06-01)

## Why

The live end-to-end audit (`2026-05-31-e2e-experience-audit`) completed its foundational
measured sweep against REAL GroundX (there is no MOCK_MODE) and is being closed out:
**F1 Ingest, F2 Understand/PdfViewer, F3 Extract, and the no-template Report empty state all
PASSED live and console-clean.** Two things remain that should not block that close-out:

1. **Surfaces not yet driven live.** The audit established the methodology and cleared the
   hardest trap (the 24px-collapsed PDF canvas), but a number of interactive surfaces were
   never exercised with measured evidence: deep Extract (field add/edit, JSON-render toggle,
   field-card→provenance highlight), Report-with-a-template (render + section accept/reject +
   the f4a builder + pin→report), Integrate, the sign-up gate, the gate lifecycle, the
   citation round-trip, auth (password show/hide, claim/flip), steady-mode parity, the
   debug-overlay reset, responsive (mobile), reduced-motion, and a full console/network sweep.
2. **The minor console-warning defect DL-2.** The React Router **v7 future-flag warning**
   (`v7_startTransition`) logs ~24× to the console, polluting the console sweep.

This change is the TICKET that carries that remaining work forward. It continues the live
audit's exploratory-then-fix shape and its **MEASURE, don't eyeball** discipline: every
"expected effect" verdict is backed by a measured value (rendered px / visibility / attribute
/ scroll / network body / console / a11y node), never a screenshot glance.

**Out of scope — split out.** The P1 chat-RAG defect (DL-1: live RAG returns 0 citation
chips / no grounded "amount due" answer on the extract-workflow-indexed utility sample) is its
OWN change, `2026-06-01-rag-retrieval-correctness`, and is NOT duplicated here. This change may
itself legitimately spawn further surface-specific tickets for defects it finds — it does not
force-fix everything inline.

### Tooling policy (inherited from the audit, locked project rule)

- **Start the dev servers with `Claude_Preview` `preview_start`** (reads `.claude/launch.json`,
  starts paired frontend :5173 + middleware :3001 against REAL GroundX).
- **Screenshots via `Claude_Preview` `preview_screenshot`** (Chrome DevTools `take_screenshot`
  has timed out repeatedly on this project).
- **Inspect with the `chrome-devtools` MCP**: `evaluate_script` for DOM measurement, network
  response bodies, console state, the accessibility snapshot.
- **MEASURE, don't eyeball.** Every rendered-effect assertion cites a measured value; a
  screenshot is corroborating evidence only, never the proof.

## What Changes

- **Per-surface measured live passes.** One task per remaining surface drives its controls via
  the MCP against REAL GroundX and records a measured before/after value + expected effect +
  pass/defect verdict per control:
  - **2.3-deep Extract** — field add/edit; JSON-render toggle flips the output format
    (measured); field-card click → provenance / source-region highlight on the PDF (measured
    box).
  - **2.5 Report** — render WITH a user-created template; section accept/reject as a measured
    state change; the f4a builder; the pin→report path.
  - **2.6 Integrate** — connector cards/controls; plugin-download states.
  - **2.7 sign-up gate** — staggered reveal; three doors (magic-link email+send / SSO /
    book-a-call); value-prop canvas; commit/dismiss; book-a-call card.
  - **2.9 gates** — open via Save / Export / metered ceiling; commit each method;
    dismiss/back-out; the overlay; nav-while-gated.
  - **2.10 citation round-trip** — chip click → viewer mounts the right doc/page → MEASURED
    highlight box on real geometry; survives refresh.
  - **2.11 auth** — login; register; password show/hide (measured input `type` flip); reset;
    claim / anon→authed flip with state preserved.
  - **2.12 steady-mode parity** — workspaces/projects nav; the same production widgets on real
    data; `mode` prop = steady.
  - **2.13 debug-overlay reset** — ALL session state cleared (localStorage / sessionStorage /
    cookies / in-memory contexts / server row); forward-binding check vs `lib/resetExperience.ts`.
  - **2.14 responsive** — golden path at desktop AND mobile viewports; no overflow / unreachable
    controls.
  - **2.15 reduced-motion** — staggered reveals degrade to crossfade / instant.
  - **2.16 full console + network sweep** — any uncaught error / non-2xx on a happy path is a
    defect row.
- **DL-2 fix (P3).** Set the `v7_startTransition` (and the other v7 future flags as
  appropriate) on the Router, or suppress — clean console. Failing-first: a console-clean
  assertion that currently fails on the warning, then passes after the fix.
- **Defect log + fix loop.** Each found defect → a defect-log row → fixed (failing-test-first
  where a unit/widget test can reach it; browser-measured where it can't) OR triaged to its own
  ticket. No dormant or stale code left behind.
- **Closeout.** Acceptance = every remaining surface above exercised with measured evidence,
  DL-2 fixed and console-clean, defect log with no open row (each fixed-and-reverified or
  triaged-ticketed), suites + build + drift guards green, `openspec validate --strict`.

## Affected

- **Specs:** `testing-suite` (primary — extends the durable e2e-audit contract with the
  remaining-surfaces + console-clean requirements).
- **App / middleware:** the Router config for the DL-2 fix
  (`app/src/main.tsx` / wherever the router is mounted) plus any surface a confirmed defect
  lives in — scoped per logged defect, not speculatively.
- **Audit artifacts:** the continued defect log lives under this change directory.
