Each task is TDD (failing test first) and ends with the Discipline §10 adversarial-review gate before the next. WIP cap = 3.

## 0. Decisions to lock before coding
- [x] 0.1 Rewrite prompt: D3 draft accepted as the starting point ("good enough"); tune against real docs during implementation (2.1 is TDD).
- [x] 0.2 Baseline = snippets + source-document context, one LLM call (no baseline extraction). Name is NOT agent-editable (auto at creation, user-only after).
- [x] 0.3 Endpoint namespacing: keep `/api/extract-field` + add `/api/report-section/preview`, single `/api/template-item/rewrite`.
- [x] 0.4 Persistence (review blocker RESOLVED; shape refined in 0.6): persist the in-progress schema to the entity twin as an uncommitted `Template`; previews are TRANSIENT (in-memory, recomputed), NOT DB. Distinct from the committed Template save.
- [x] 0.5 Reuse shared `GeneratedResult` (no new `PreviewItemResult`); rewrite output has NO citations (citation-verify is preview-only); rewrite is NOT an LLM tool; hook owns async ops only (components keep form state, adapter owns the `applyProposal`/`persistPreview` side-effects); refactor the EXISTING `SectionRow` (no new component); single-section preview reuses `renderReport`'s section internals (server honors `sectionIds`, `reportRenderer.ts:543`).
- [x] 0.6 (2nd review) Persist the draft as an **uncommitted `Template`** (`TemplateSaveInput` shape, resolved body — NOT a Map/Set overlay blob); `itemPreviews` values carry the discriminant (`ExtractedFieldValue | RenderedSection`); clear previews on document-scope change; the `itemPreviews` fix (§5) MUST precede the hook wiring (§6); anon+sample = draft keeps the user's edits / freezes (confirmed; a later sample-schema change does not discard saved edits).

## 1. Shared contracts (`@groundx/shared`)
- [x] 1.1 Add Zod `TemplateItemKind`, `RewriteItemRequest`, `RewriteItemResult` (`{kind, proposedItem, reasoning}`, discriminated) + `reportSectionItemSchema`; preview REUSES `ExtractedFieldValue`/`RenderedSection` — NO new preview type. 8 contract tests green (`app/src/types/templateItemAgent.contract.test.ts`); shared builds; app tsc clean.
- [x] 1.2 Updated `docs/agents/data-model.md` reconciliation matrix: rows for RewriteItem, the in-memory `itemPreviews` (not persisted), and the uncommitted draft `TemplateSaveInput` column. Drift guards + catalog-parity green.

## 2. Middleware — rewrite prompt + service + endpoint
- [x] 2.1 `services/prompts/itemRewriter.ts` builder (kind-aware, source-document-grounded, never outputs `name`); test green; promptLiterals guard green.
- [x] 2.2 `services/itemRewriter.ts`: scope from session; one GroundX search (limit 8) → matched (4) + doc-context (8) snippets; one `llmClient` chat-profile call; parse; proposed item OVERLAYS only LLM fields onto the input so `id`/`name` are immutable + schema-validated; throws on bad JSON. 3 unit tests green (incl. LLM-rename-ignored).
- [x] 2.3 `POST /api/template-item/rewrite` route: zod-validated (400 on kind/item mismatch), ownership (403), 404, `llmLimiter`; NOT in `SERVER_TOOL_CATALOG` (user-invoked). 4 route tests green; middleware tsc clean; 241 middleware tests green. (Client-side `ApiError` subclass lands with the client in §6.)

## 3. Middleware — single-section report preview
- [x] 3.1 The reusable per-section render unit is `groundedAnswerOverScope` (what `renderReport` calls per section). `services/sectionPreview.ts` wraps it for ONE ad-hoc (unsaved) section — no whole-template render, no fork; citation-verify identical.
- [x] 3.2 `POST /api/report-section/preview` (ad-hoc section, the report analog of /api/extract-field) → `RenderedSection`; zod-validated (`previewReportSectionRequestSchema` in shared), ownership, `llmLimiter`, 503 when no model. 4 route tests green; middleware tsc clean; 239 middleware tests green.

## 4. Data tier — persist the uncommitted draft TEMPLATE on the entity twin (NOT previews)
- [ ] 4.1 Add additive `JSON NULL` column to `chat_session_entities` (e.g. `draft_template_json`) holding the uncommitted draft as a `TemplateSaveInput`-shaped object (resolved body — plain JSON, no Map/Set), via an explicit idempotent `ALTER TABLE … ADD COLUMN` reconciliation (NOT `CREATE TABLE IF NOT EXISTS`, NOT drop+recreate). Integration test: FRESH has it, STALE reconciles, concurrent-add is idempotent, no dead columns; note the safe-rollback behavior.
- [ ] 4.2 Write + read site (`viewerFromActiveEntity` seeds the working draft from the uncommitted Template); round-trip test (anon + authed; added + edited + removed → resolved body); `persistedColumnPolicy` guard green; excluded from the committed Template save. Adversarial review.

## 5. App — ChatStore: persist draft Template; in-memory preview slice (MUST precede §6)
- [ ] 5.1 Serialize the resolved draft as an uncommitted `Template` (`TemplateSaveInput`, nullable name) into the entity twin + localStorage cache; hydrate on load (seed the working draft). Serialize/hydrate tests first.
- [ ] 5.2 Add IN-MEMORY `itemPreviews: Map<string, ExtractedFieldValue | RenderedSection>` + `setItemPreview`/clear actions (seeded + added) + clear-on-scope-change; migrate `setSchemaFieldExtraction` callers off the `addedFields`-only path (this fixes the seeded-field bug). Tests: rerun a SEEDED field → `itemPreviews[fieldId]` populated + shown; previews NOT serialized to DB (assert excluded from the persisted Template JSON AND the committed save). Reducer tests first. Adversarial review.

## 6. App — shared hook + adapters + client
- [ ] 6.1 `api/templateItem.ts` client (rewrite + preview) over the shared contracts. Client test.
- [ ] 6.2 `hooks/useTemplateItemAgent.ts` (form state, rewrite→proposal→accept/discard, preview, loading/error) + `TemplateItemAdapter` type. Hook tests first.
- [ ] 6.3 `extractFieldAdapter` + `reportSectionAdapter`. Adapter tests + a parity test that both surfaces route through the hook. Adversarial review.

## 7. App — shared widgets
- [ ] 7.1 `RewriteProposalCard` (before→after per changed field, Accept/Discard) — sibling test + README + role/scope contract.
- [ ] 7.2 Shared preview chip (value/confidence/citation or rendered text). Adversarial review.

## 8. App — wire Extract editor (anon + authed)
- [ ] 8.1 Refactor `FieldInlineEditor` to consume the hook + extractFieldAdapter; REPLACE the entire `(rewritten)` stub onClick block (don't patch it). Failing test: rewrite proposal appears; Rerun on a seeded field surfaces + persists a value.
- [ ] 8.2 Verify rewrite + preview are available to anon (D8 — NOT gated like Save) and authed via the same path; only Save/export stay padlocked. Adversarial review.

## 9. App — wire Report builder (refactor existing SectionRow)
- [ ] 9.1 Refactor the EXISTING `SectionRow` inline editor to consume the hook + reportSectionAdapter (rewrite + per-section preview) — NO new `SectionInlineEditor`. NET-NEW UI in SectionRow (it has none today): a per-section preview chip + a ↻ Rerun button + reading its result from `itemPreviews`. Failing tests first.
- [ ] 9.2 Adversarial review.

## 10. Closure
- [ ] 10.1 `openspec validate --all --strict`; full app + middleware suites green; drift guards (catalog-parity, recurrence-drift, persistedColumnPolicy, no-hardcoded-styles) green.
- [ ] 10.2 Live-verify each surface in the browser (rewrite proposal, accept, rerun/preview, persistence across reload). Delete any inline TODOs; honest commit.
