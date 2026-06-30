# Wireframes (design bundle)

The wireframe + design-token source of truth for the whole project. OpenSpec
proposals cross-reference these files per `openspec/config.yaml` rules.

Co-located inside OpenSpec because:

- Every spec proposal must "identify the affected wireframe frames (F-series
  in `spec-flow.jsx`)" — keeping the JSX next to the specs avoids drift.
- Every spec must "cross-reference the originating wireframe" — agents can
  grep `source/spec-*.jsx` without leaving the planning surface.
- Replaces the older `/tmp/design-bundle/` fetch flow, which was fragile
  (wiped on reboot; curl URL scoped to the original chat).

## What's here

| Path | What it covers |
|---|---|
| `Onboarding Spec _standalone_.html` | Self-contained built artifact. Open in a browser for the visual reference — the entire spec, no fetch needed. 2.7 MB. |
| `source/spec-app.jsx` | Composition of all artboards; the frame map |
| `source/spec-flow.jsx` | **F1–F6 onboarding frames + F3a edit-schema** |
| `source/spec-chapters.jsx` | F2 `Flow_Processing` artboard (chat-column + thinking-stream + Pick-a-view pills) |
| `source/spec-nav-v2.jsx` | `Canvas_Ingest` (F1), `Canvas_Integrate` (F7), `OnboardingStepStrip`, transition frames |
| `source/spec-primitives.jsx` | Component library — `ScenarioCard`, `CiteChip`, `MiniNav`, `AppShell`, `navTopFor`/`navBottomFor`, `SCENARIOS` data |
| `source/spec-widgets.jsx` | **W1–W8 widget anatomies** |
| `source/spec-scenarios.jsx`, `spec-scenario-end.jsx` | S1 Loan, S2 Solar, S3 IC brief, S3a Report Builder |
| `source/spec-layout.jsx`, `spec-responsive*.jsx`, `spec-canvas-states.jsx` | Layout system, responsive matrix, lifecycle frames |
| `source/spec-workspace.jsx`, `spec-backout.jsx` | P1/P2 (parked) + back-out audit |
| `source/spec-extract.jsx` | F3 ExtractView field-list + citation-peek anatomy |
| `source/design-system/colors_and_type.css` | **Production design tokens** — Inter, navy/green/coral/cyan, type scale, radii. This is the visual source of truth, NOT the wireframe's Kalam/Caveat aesthetic. Every value in `app/src/constants/` traces back here. |
| `source/uploads/preloaded-content-scenarios.md` | Utility / Loan / Solar scenario definitions (the manifest fixtures' source) |
| `source/uploads/Screenshot *.png` | Screenshots referenced by the wireframes |
| `source/concept-*.jsx`, `wireframes-app.jsx`, `wireframe-primitives.jsx` | Earlier concept explorations — kept for "why" context, not the canonical shape |

## How to apply it

When asked about a frame's intended shape:

1. Read the relevant JSX (`source/spec-flow.jsx` for F1–F6,
   `source/spec-chapters.jsx` for F2's `Flow_Processing` detail,
   `source/spec-nav-v2.jsx` for F1 + F7).
2. Compare line-by-line against the current code.
3. Open `Onboarding Spec _standalone_.html` in a browser for the visual.

For "why" questions (intent, tradeoffs), the user-vs-design-assistant chats
are the source — they're not in this folder; ping the user for the chat log
when needed.

## Wireframe aesthetic vs production

The wireframes use **Kalam (cursive)** font as a medium signifier — that's a
wireframe convention only. Production uses **Inter**, with the tokens in
`source/design-system/colors_and_type.css`.

Don't copy Kalam, hand-drawn affordances, or wireframe-only annotations
(e.g., "[stub]", "[TBD]") into committed code.

## When the spec disagrees with the user

The user wins. Update this folder (or note the deviation in
`docs/agents/gotchas.md`) and proceed.

## What's shipped from the spec

- F1 IngestView matches `Canvas_Ingest` per `spec-nav-v2.jsx`
- F2 (chat + canvas) matches `Flow_Processing` per `spec-chapters.jsx`
- F3 ExtractView matches the field-list + citation-chip pattern (full
  extraction-workbench widget integration with real PDF + region overlays
  is Phase 7 work — partially shipped 2026-05-27 via clickable-citations)
- F3a SchemaView is the live schema-agent loop (replaces F4 in the original
  spec)
- OnboardingNav matches `MiniNav` from `spec-primitives.jsx` — same items,
  same logged-out state, chevron toggle for compact / labeled
- StepStrip matches the wireframe
- W1 PdfViewer, W7 Extract, W8 Report widget anatomies partially shipped

## What's not yet shipped

- F5 InteractView shape — wireframe shows the chat-with-sources widget
  anatomy + citation-driven page navigation; we have the citation flow
  but the widget anatomy itself is still placeholder
- F7 IntegrateView matches its wireframe today but the agent-integration
  download surface is mocked
- Smart Report (S3a) — not started
- Responsive matrix (`source/spec-responsive-atlas.jsx`) — only desktop +
  iPad-landscape are exercised; mobile + iPad-portrait deferred
