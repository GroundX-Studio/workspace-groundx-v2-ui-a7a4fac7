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
- [x] 5.2 (core, shipped) In-memory per-item results: `ChatSession.fieldExtractions: Map<itemId, SchemaFieldExtractionResult>` (kept the status-based UI type — pending/error/done + `previousConfidence` — over settled `GeneratedResult`, since the UI needs the transient status); rewrote `setSchemaFieldExtraction` to upsert the map for ANY field (removed the `addedFields`-only bail = the seeded-field Rerun bug); `SchemaView` reads `extractionsById` from the map (seeded + added). In-memory only (absent from `parseChatStoreSnapshot` → never DB/committed). 2 reducer regression tests + 131 Extract/SchemaView/ChatStore tests green; tsc clean. Remaining: clear-on-document-scope-change folds in with the hook wiring (§6/§8).

## 6. App — shared hook + adapters + client
- [x] 6.1 `api/templateItem.ts` client (`rewriteTemplateItem` + `previewReportSection`) + `TemplateItemApiError`; registered on `realApi.templateItem`. tsc + client/fake tests green.
- [x] 6.2 `hooks/useTemplateItemAgent.ts` — the shared rewrite hook (async op + proposal/loading/error only; ChatStore-free; kind-parameterized). 3 hook tests green.
- [x] 6.3 (simplified) No separate adapter files/`TemplateItemAdapter` type — the hook is kind-parameterized and each editor applies the accepted proposal via its own form setters (thin per-surface glue), which is the smallest reuse seam. (Revisit if a 3rd caller needs a formal adapter.)

## 7. App — shared widgets
- [x] 7.1 (extract) The before→after proposal UI (SUGGESTED REWRITE, before/after, reasoning, Accept/Discard) is rendered INLINE in `FieldInlineEditor` — a sub-component of the Extract widget, not a new top-level widget, so no widget-contract README/sibling ceremony. Report reuses the same inline pattern in §9. (If a 3rd surface needs it, extract to a shared `RewriteProposalCard`.)
- [x] 7.2 Preview chip — extract reuses its existing preview chip; report gained a per-section preview result box in §9.

## 8. App — wire Extract editor (anon + authed)
- [x] 8.1 `FieldInlineEditor` consumes the hook; the `(rewritten)` stub onClick is fully REPLACED by `requestRewrite`; proposal card + Accept (applies type/description/instructions/format/identifiers, NEVER name) + Discard + loading/error. Rerun on a seeded field works (§5.2). Integration test green (open→rewrite→proposal→Accept→prompt updated, no stub suffix); 95 touched-suite tests green; tsc clean.
- [x] 8.2 Extract is ONE widget (role+scope) → rewrite is available to anon + authed via the same path; only Save/export stay padlocked (unchanged). No per-role gating added (D8).

- [x] 9.1 Refactored the EXISTING `SectionRow` (no new component): consumes `useTemplateItemAgent("report-section")` for rewrite (before→after proposal → Accept applies renderAs/question/instructions/variables, NEVER name) + a net-new per-section preview (`↻ preview section` → `api.templateItem.previewSection` → result box). 2 integration tests (rewrite accept + preview) + 24 report tests green; tsc clean.
- [x] 9.2 Same hook/pattern as extract (one shared implementation across both surfaces); Box-based inline UI mirroring the extract proposal card.

## 10. Closure
- [ ] 10.1 `openspec validate --all --strict`; full app + middleware suites green; drift guards (catalog-parity, recurrence-drift, persistedColumnPolicy, no-hardcoded-styles) green.
- [ ] 10.2 Live-verify each surface in the browser (rewrite proposal, accept, rerun/preview, persistence across reload). Delete any inline TODOs; honest commit.
