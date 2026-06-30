# F3a Save → sign-in gate → F1 handoff

## Why

The spec (`v2-dashboard/spec-flow.jsx::Flow_EditSchema` lines 1037-1038
narrative) says Save while anonymous "opens the sign-in flow, persists
the schema, and drops the user into the F1 ingest surface with it
pre-attached." This is a complete loop that lets the user leave F3a
with a saved, reusable schema attached for the next ingest.

Today my scaffold's Save behavior on a 401 returns the topbar status
`Sign in to save this template.` and does nothing else — the user is
stranded on F3a without a way to actually sign in or attach the saved
schema to anything.

## What changes

- ON `💾 Save` click in F3a while anonymous, OPEN the F6 gate **inline
  in chat** (existing flow). Pass a preamble `"Sign in to save this
  schema"` and preserve the overlay across the gate.
- ON successful sign-in (gate `committed → done`), PERSIST the schema
  via `POST /api/extraction-schemas` and CAPTURE the returned `id`.
- ON persist success, DISPATCH `advanceFrame("f1")` AND populate F1's
  picker with the saved schema pre-attached. Add a new ChatStore /
  OnboardingSession slot `preAttachedSchemaId: string | null` that
  F1's ingest picker reads to surface the schema as the default.
- WHEN the user is already signed in on Save, persist immediately
  without opening F6 — match current happy-path behavior.

## Out of scope

- F1's full ingest-picker UI changes — only the "preAttachedSchemaId
  populates the default" hook is in scope here. The picker already
  exists.
- The `customer-extraction-schemas` GroundX → server sync (the saved
  template needs to land in the user's GroundX workspace too, not just
  the app DB). Track separately.

## Affected

- Scaffold: `ExtractView.tsx` (Save handler change), `OnboardingSessionContext`
  (new `preAttachedSchemaId` slot + setter), `IngestView.tsx` (read
  `preAttachedSchemaId` and pre-select), `GateView` integration tests.
- Requirement: `Save SHALL gate on sign-in and pre-attach the schema on F1 return`.
