# WF-13: F5 Interact — live chat turns, not a seeded script (finding 2)

## Why

Live-drive finding (2026-05-29): the F5 canvas showed the seeded `sampleChatScript` turn ("Demand
charges came in highest at $9,418") + its fake citation — separate from the live left-pane chat.
`InteractView.tsx:52,61` seed `turns` from `scenario.manifest.sampleChatScript`. The litRegions on
the canvas derive from that mock turn, not the live reply.

## What changes

F5 InteractView SHALL NOT seed `turns` from `manifest.sampleChatScript`; the displayed turns +
their citations (and the derived `litRegions`) MUST come from the live chat session. `chatSeeds`
remain as starter chips that feed the real chat (Option A).

## Out of scope

- F3 extract (WF-12); citation persistence (WF-16).

## Affected

- App: `InteractView.tsx` (drop sampleChatScript seeding; bind turns to live session), tests.
- Specs: `ui-views` (F5 turns are live).
