# Design Bundle

Where the wireframes + spec JSX live and how to use them.

## Location

Extracted locally at:
```
/tmp/design-bundle/v2-dashboard-chat-driven-ui/
```

This path may be cleared on reboot; re-fetch with:
```bash
curl -sL https://api.anthropic.com/v1/design/h/j-C-MbJTp9HVSOwQ5hHaGA?open_file=Onboarding+Spec.html \
  -o /tmp/bundle.tar.gz && tar -xzf /tmp/bundle.tar.gz -C /tmp/design-bundle/
```

## Structure

| File | What it covers |
|---|---|
| `README.md` | The handoff agent instructions; says "read the chats first" |
| `chats/chat1.md`, `chats/chat2.md` | Full back-and-forth between user and design assistant — source of intent |
| `project/Onboarding Spec.html` | Thin shell that loads the JSX bundle |
| `project/spec-app.jsx` | Composition of all artboards; the frame map |
| `project/spec-primitives.jsx` | Component library — ScenarioCard, CiteChip, MiniNav, AppShell, navTopFor/navBottomFor, SCENARIOS data |
| `project/spec-flow.jsx` | F1–F6 onboarding frames + F3a edit-schema |
| `project/spec-nav-v2.jsx` | Canvas_Ingest (F1), Canvas_Integrate (F7), OnboardingStepStrip, transition frames |
| `project/spec-chapters.jsx` | F2 Flow_Processing (the wireframe the F2 chat + canvas was rebuilt to match) |
| `project/spec-scenarios.jsx`, `spec-scenario-end.jsx` | S1 Loan, S2 Solar, S3 IC brief, S3a Report Builder |
| `project/spec-widgets.jsx` | W1–W8 widget anatomies |
| `project/spec-layout.jsx`, `spec-responsive*.jsx`, `spec-canvas-states.jsx` | Layout system, responsive matrix, lifecycle frames |
| `project/spec-workspace.jsx`, `spec-backout.jsx` | P1/P2 (parked) + back-out audit |
| `project/design-system/colors_and_type.css` | **Production design tokens** — Inter, navy/green/coral/cyan, type scale, radii. This is the visual source of truth, NOT the wireframe's Kalam/Caveat aesthetic |
| `project/uploads/preloaded-content-scenarios.md` | Utility / Loan / Solar scenario definitions |

## How to apply it

When asked about a frame's intended shape:
1. Read the relevant JSX (`spec-flow.jsx` for F1–F6, `spec-chapters.jsx`
   for F2's Flow_Processing detail, `spec-nav-v2.jsx` for F1 + F7).
2. Compare line-by-line against the current code.
3. Use the chats only for "why" questions (intent, tradeoffs).

The wireframes use Kalam (cursive) font for the medium itself —
that's a wireframe convention. **Production uses Inter.** Don't
copy Kalam into committed code.

## What's already done from the spec

- F1 IngestView matches `Canvas_Ingest` per spec-nav-v2.
- F2 (chat + canvas) matches `Flow_Processing` per spec-chapters.
- F3 ExtractView matches the field-list + citation-peek pattern
  (the full extraction-workbench widget integration with real PDF
  + region overlays is Phase 7 work).
- The OnboardingNav matches `MiniNav` from spec-primitives — same
  items, same logged-out state, chevron toggle for compact /
  labeled.
- StepStrip matches the wireframe.

## What's not yet done from the spec

- F5 InteractView shape — the wireframe shows the chat-with-sources
  widget anatomy + citation-driven page navigation; we have a
  basic stub.
- F7 IntegrateView matches its wireframe today but the
  agent-integration download surface is mocked.
- Smart Report (S3a) — not started.
- Responsive matrix (`spec-responsive-atlas.jsx`) — only desktop +
  iPad-landscape are exercised; mobile + iPad-portrait deferred.

## When the spec disagrees with the user

The user wins. Update the spec doc in this folder (or note the
deviation in `gotchas.md`) and proceed.
