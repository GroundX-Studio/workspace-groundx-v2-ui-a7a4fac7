# Tasks — f3a-save-signin-gate-handoff

## 1. Failing closure-gate tests

- [x] ExtractView round-trip: anonymous user on F3a clicks `💾 Save` →
  F6 gate opens inline (`gate-rail-preamble` shown with text
  `Sign in to save this schema`).
- [x] OnboardingSessionContext test: `preAttachedSchemaId` slot starts
  null; setting it via `setPreAttachedSchemaId("es-1")` persists.
- [x] IngestView render: when `preAttachedSchemaId` is set on the
  session, the `ingest-pre-attached-schema` banner renders with text
  `SCHEMA ATTACHED` + the schema id.
- [x] Round-trip from anonymous Save → 401 → gate opens → `commitGate("register")`
  → schema persists (mocked 200) → user lands on F1 with the new
  schema's banner showing.

## 2. Implementation

- [x] Replace ExtractView's 401-status branch: instead of setting
  `saveStatus = "needs-signin"`, reset to `idle` and call
  `openGate("save", { cause: "save-schema" })`.
- [x] Overlay is preserved across the gate (overlay lives in ChatStore
  which doesn't reset on gate-open).
- [x] Added a `useEffect` in ExtractView that watches `session.gate`:
  on `status === "committed"` with `cause === "save-schema"`, fire the
  actual `saveExtractionSchema` (now signed-in, will succeed), then
  `setPreAttachedSchemaId(id)` + `advanceFrame("f1")`. A `consumedRef`
  prevents the post-commit save from firing twice on re-render.
- [x] Extended `GateStatus` with optional `cause?: GateCause` on the
  open / committed / dismissed variants.
- [x] Extended `openGate` to accept `options?: { cause }`, threading
  the cause through to the open state; `commitGate` propagates the
  cause from the previous open state forward.
- [x] Added `preAttachedSchemaId: string | null` slot + setter
  `setPreAttachedSchemaId` to `OnboardingSessionContext`.
- [x] Added cause-aware preamble override in `GateChatRail` —
  `PREAMBLE_BY_CAUSE["save-schema"] = "Sign in to save this schema"`.
- [x] IngestView reads `session.preAttachedSchemaId` and renders the
  `ingest-pre-attached-schema` banner when set.

## 3. Cross-checks

- [x] Dead-context: `preAttachedSchemaId` is READ by IngestView; setter
  is called by ExtractView's signed-in Save branch AND its post-commit
  gate-handoff effect.
- [x] Dead-endpoint: `POST /api/extraction-schemas` is now reachable
  both directly (signed-in user) AND via the gate-handoff path
  (anonymous user → sign-in → save retry).
- [x] Round-trip: covered by step 1's e2e mock — `GateCommitter`
  simulates the gate sign-up + mocks the retry response.

## 4. Verification

- [x] vitest green (888/888 app suite).
- [x] tsc green on app side; pre-existing middleware errors unrelated.
- [x] `openspec validate f3a-save-signin-gate-handoff --strict` green.
