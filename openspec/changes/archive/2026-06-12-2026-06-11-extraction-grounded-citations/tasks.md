# Tasks — extraction-grounded citations

Every task is SEQUENTIAL unless tagged WORKFLOW. A task is done only when its
adversarial gate passes against the plan AND the real code (discipline §10).

No app-side tasks: extraction citations ship as ordinary `Citation`s (shared
shape untouched; geometry-miss entries are dropped per the 2026-06-11 user
decision), so chip rendering, click, hydrate, and persistence are already
covered by existing suites.

- [x] **T1 — failing user-visible test (SEQUENTIAL).** In
  `middleware/src/services/chatRouter.test.ts` (or a sibling
  `extractionCitations.test.ts` exercised through `routeChat`): stub the LLM
  to answer a "what is the meter number?" turn citing ONLY extraction-form
  entries over a fixture extraction payload + fixture X-Ray; assert the reply
  carries ≥1 citation, the `show-source` suggested action seeds, and the
  geometry-resolved citation carries `page` + `bbox` + `tier: "paraphrase"`.
  Must FAIL against current code (citations come back `[]`).
  *Gate:* run the test, paste the failure; confirm it asserts user-visible
  reply fields, not internals.

- [x] **T2 — prompt: `EXTRACTION_CITATIONS_CONTRACT` fragment (SEQUENTIAL).**
  Add the fragment to `prompts/fragments.ts` (the entry form, the
  copy-verbatim rule for `value`, the only-fields-you-saw rule);
  `buildGroundedSystem` appends it iff `extraction` is non-null. Extend
  `prompts.test.ts`; prompt-literal drift guard stays green.
  *Gate:* assert byte-identical prompt when `extraction` is null.

- [x] **T3 — parser union arm (SEQUENTIAL).** `parseGroundedAnswer`:
  `StructuredCitation` → `SnippetCitation | ExtractionCitation`; filter
  malformed/mixed entries per arm; unit tests for both arms + garbage.
  *Gate:* existing snippet-arm tests untouched and green (no retargeting).

- [x] **T4 — fetch shape + verification (SEQUENTIAL).**
  `fetchDocumentExtraction` → `{ payload, promptBlock } | null`;
  `verifiedCitations` gains the extraction branch: doc-id check, pure
  path-resolver check, normalized value check; failure DROPS the entry.
  Unit tests: wrong doc / unknown path / mismatched value all dropped; a
  fabricated extraction citation on a turn with NO extraction block dropped;
  joke turn still `[]`.
  *Gate:* adversarially attempt to smuggle an invented citation through each
  check in a test; confirm the SHIPPED `plan.extractionContext` gate still
  short-circuits cleanly (gate `false` ⇒ no fetch ⇒ extraction-form entries
  dropped — covered by a test).

- [x] **T5 — geometry + tiering (SEQUENTIAL).** Validated entries resolve via
  cached `fetchDocumentXray` + `resolveFieldGeometry(value, lastSegment,
  xray)`: hit ⇒ `page`/`bbox`/`tier: "paraphrase"`, `snippet` = `"<label>:
  <value>"`, verified-level confidence; miss or X-Ray failure ⇒ the entry is
  DROPPED (no pageless citation) and the turn succeeds. X-Ray fetched at
  most once per doc per turn (shared with the snippet path's cache).
  *Gate:* T1 flips green; fault-injection test (X-Ray throws) yields a reply
  with that citation absent and no thrown error.

- [x] **T6 — deferred ticket (SEQUENTIAL, docs-only).** Word-level `exact`
  upgrade for extraction citations via the `-118-map` (resolve the verbatim
  field value with `resolveWordGeometry`): record as a follow-up OpenSpec
  change stub or backlog entry per delivery discipline — NOT dormant code.
  DONE 2026-06-12 as spawn_task `task_3e576642` ("Upgrade extraction citations
  to word-level exact tier") with a self-contained prompt.
  *Gate:* grep confirms no half-wired upgrade path shipped.

- [x] **T7 — closure (SEQUENTIAL).** `OPENSPEC_TELEMETRY=0 npx
  @fission-ai/openspec@1.3.1 validate --all --strict` passes; app +
  middleware vitest suites green; durable spec deltas archived on ship; update `docs/agents/data-model.md` (extraction
  citation note) in the same change.
  *Gate:* full adversarial pass — falsify every proposal claim against the
  merged code; cross-plan collision re-check against
  `2026-06-11-turn-router-extraction-appstate` (groundedAnswer.ts merge).
