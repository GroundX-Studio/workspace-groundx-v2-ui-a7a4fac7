## Context

The inline template-item editor (Extract field editor `SchemaView.tsx` → `FieldInlineEditor`; report builder `SmartReportBuilder`) exposes two agentic affordances that are broken:

- **✨ rewrite with agent** ([SchemaView.tsx:1113](../../../app/src/components/viewer-widgets/Extract/SchemaView.tsx)) appends the literal `" (rewritten)"` — a stub, no LLM. Dormant plumbing (violates `docs/agents/hacking-vs-solving.md`).
- **↻ Rerun** calls the real `fireExtraction` → `POST /api/extract-field`, but the result is dropped: `setSchemaFieldExtraction` ([ChatStoreContext.tsx:1796](../../../app/src/contexts/ChatStoreContext/ChatStoreContext.tsx)) returns early (`if (idx === -1) return prev`) for any field not in `pendingSchemaOverlay.addedFields`; seeded schema fields therefore have no slot, and the preview reads `extractionsById` built only from `addedFields`.

These must work identically on three surfaces (anon extract, authed extract, report builder). The reusable substrate already exists: a generic `PendingTemplateOverlay<Item, Edit, Proposal>` with `PendingSchemaOverlay` (Extract) and `PendingReportOverlay` (Report); Extract is one widget used anon+authed via `role`+`scope`; the LLM pipeline (`middleware/src/services/llmClient.ts` profiles, `services/prompts/` builders, `services/fieldExtractor.ts`'s search→snippet→grounded-LLM→`verifyAndTierSnippetCitation`) is the precedent to mirror.

**Storage constraint (chat-session-model):** DB is source of truth for anon + authed; anon sessions are DB-twinned from day one (entity twin = `chat_session_entities`, columns `last_step_json` + `reached_stages_json`). The draft schema overlay is currently **client-only** (no DB column) — so DB-persisting the **draft schema** is a real addition, not free (previews are NOT persisted; see D5).

## Mental model (read this first — plain English)

Three kinds of data, three homes — getting this wrong is the #1 risk:

| Data | What it is | Saved to DB? |
|---|---|---|
| **Draft schema** | the field/section definitions you're editing (your work) | **Yes** — auto-saved to the session (survives reload, even anonymous). This is NOT the "Save" button. |
| **Preview results** | the *answers* (extracted value / rendered section text) | **No** — in browser memory only; recomputed on demand. Cheap, derived, throwaway. |
| **Committed Template** | the official, named, saved version | **Yes**, but only via the existing auth-gated "Save". Unchanged. |
| **The "Save" button** | a deliberate user action that commits the current draft into a persisted, owned, named `Template` | only for signed-in users |

The draft and the committed Template share ONE shape (`TemplateSaveInput`): the draft is just the uncommitted form of it (nullable name, no owner/timestamps). Auto-saving the draft ≠ the "Save" button. The schema is the *source* and is worth persisting; a preview is *derived from schema + document*, so it's cheap to regenerate and pointless to store.

Two operations, one distinction: **Rerun produces an answer; Rewrite improves the question.**
- **↻ Rerun (preview):** run the field's current (unsaved) definition against the doc → show value + confidence + citation. Not stored.
- **✨ Rewrite:** send the field's definition + latest answer + a chunk of the real source document to the LLM → it rewrites the definition (everything except the name) → show before→after → Accept fills the form (then Rerun to test, Save when happy).

## Goals / Non-Goals

**Goals:**
- Real, grounded, result-aware "rewrite with agent" that proposes a whole improved item shown as before→after (Accept/Discard), via a direct inline endpoint.
- Per-item preview/rerun using the current unsaved editor values (seeded + added items), shown on the card; the **draft schema** persists in DB with the session, while previews are transient (in-memory, recomputed — never DB).
- One shared hook + per-surface adapter so anon extract, authed extract, and report builder reuse one implementation.
- Reuse the existing prompts module, `llmClient`, and the grounded/extract pipeline + citation verification. No parallel LLM path.

**Non-Goals:**
- Changing what a committed `Template`/`Result` contains.
- A chat agent-loop tool for rewrite (it's a direct endpoint).
- Batch/whole-template rewrite; multi-document preview.
- A unified field/section mega-component.

## Decisions

### D1 — Reuse seam: shared hook (async ops only) + per-surface adapter; refactor the EXISTING editors
`app/src/hooks/useTemplateItemAgent.ts` owns the two async ops (`rewrite`, `preview`) + proposal/loading/error state ONLY. It does NOT own the editor form state — the existing components keep their component-local `useState` (review finding: the project pattern is local form state + ChatStore actions; a hook owning form state would create two state homes). A `TemplateItemAdapter` per surface carries `kind: "extract-field" | "report-section"`, `serializeItem(formValues)` (request payload), `applyProposal(proposal, setters)` (writes an accepted rewrite back into the component's form setters), and `persistPreview(itemId, result)` (writes a preview result into the ChatStore `itemPreviews` slice). **Ownership boundary (review finding):** the hook stays ChatStore-free — it returns `{ proposedItem, reasoning, previewResult, loading, error }`; the adapter owns the side-effects (`applyProposal` into form state, `persistPreview` into the store). **Sequencing (review finding):** the `itemPreviews` slice that fixes the `addedFields`-only seeded-field bug (tasks §5) MUST land before the hook is wired (tasks §6–9), or the hook inherits the dropped-result bug. The TWO existing inline editors are REFACTORED to consume the hook + render the shared `RewriteProposalCard` + preview chip:
- Extract: `FieldInlineEditor` (in `SchemaView.tsx`).
- Report: the existing `SectionRow` inline editor in `SmartReportBuilder.tsx` — **refactored, NOT a new `SectionInlineEditor`** (it already is the section editor; adding a parallel component would violate the no-fork rule).
- *Alternatives rejected:* (a) one unified field↔section component — lossy (`type`/`renderAs`, `identifiers`/`variables` differ); (b) hook-owns-form-state — fights the existing local-state + ChatStore-action seam.

### D2 — Rewrite is a direct, inline endpoint reusing the extract pipeline, grounded in the SOURCE DOCUMENT
`POST /api/template-item/rewrite` `{ chatSessionId, kind, item, currentResult? }`. Server: derive `ContentScope` from the session (same as `/api/extract-field`); assemble TWO kinds of grounding and pass both to the prompt:
1. **Field-query snippets** — the matched snippets for this item (reuse `fieldExtractor`'s search/snippet builder), i.e. where the value likely is.
2. **Source-document context** — a representative, token-bounded view of the **actual source document** (reuse GroundX document-content retrieval — the same content the viewer/extract use), so the agent improves the definition against the real document (surrounding labels, layout, alternative phrasings, format), not only the narrow field match. This is REQUIRED both in the request implementation and surfaced in the prompt.

Then build the rewrite prompt; one `llmClient` **chat-profile** call (quality over latency); zod-validate; return `{ proposedItem, reasoning }`. Rate-limited by the **LLM limiter** (expensive).
- **NOT an LLM tool.** Rewrite is invoked ONLY by the user clicking "✨ rewrite with agent" in the editor. It is a plain endpoint (like `POST /api/extract-field`), absent from `SERVER_TOOL_CATALOG`/app `*.tools.ts`; catalog-parity does not apply. The LLM never emits a rewrite tool call.
- **No citation verification on the output.** The rewrite returns a field/section DEFINITION, which contains no citations. The grounding (snippets + source-document context) lives in the PROMPT; the output is not run through `verifyAndTierSnippetCitation` (that pipeline is for preview/extracted-value + rendered-section only — see D4). The `reasoning` may quote a label for explanation, but it is not a user-facing citation.
- Errors use a dedicated `ApiError` subclass (D9), not `extends Error`.
- *Alternative rejected:* chat agent-loop tool — couples editor↔chat, slower, result lands in chat (user chose direct/inline).

### D3 — Prompt lives in `services/prompts/itemRewriter.ts` (builder/consumer split, guard-enforced)
Kind-aware builder mirroring `extractor.ts` house style; tight, JSON-only output. The agent rewrites every editable field EXCEPT `name` (D7). **Structure LOCKED** (instruction order, output schema, no-`name` rule); only the phrasing is tuned during §2.1 TDD against ≥3 real-sample docs (the user accepted this draft as the starting point). The no-rename rule is enforced STRUCTURALLY: the rewrite service asserts `output.name === input.name` (and `name` is not in the output schema) — it is not delegated to the LLM. Draft (Extract field; section variant tunes `{renderAs, question, instructions, variables}`, "current result" = rendered section text):
> **System:** You are improving the DEFINITION of one extraction field so it extracts more accurately from this document type. You are NOT extracting the value, and you do NOT change the field's name. You are given: the field's current definition, the value it currently extracts (with confidence + cited snippet), the matched snippets, AND a representative view of the **source document** itself. **Read the source document** — use its real labels, layout, units, and alternative phrasings — to diagnose why the current definition may be wrong/low-confidence/empty, then rewrite the definition to fix it. Return ONLY JSON `{type,description,instructions[],identifiers[],format,reasoning}`. Rules: keep the field's intent (improve precision, don't redefine); ground every change in the source document (cite the actual labels/anchors you saw); prefer concrete testable instructions over vague ones; identifiers must be real anchor text from the document, not guesses; change `type` only if clearly wrong (say so in reasoning); if already precise, return largely unchanged with reasoning "already precise"; never invent a value; never output a `name`.
> **User:** current field def (incl. its fixed name, for context only) + current extraction (value/confidence/quote) + the matched snippets + the source-document context (token-bounded; same snippet-header format the extractor uses).

### D7 — The item `name` is auto-populated once, then user-only
The `name` is set at item creation (auto-populated by the propose/creation flow) and thereafter edited only by the user in the form. The rewrite agent NEVER proposes a new `name` (it's not in the rewrite output schema), so it's absent from the before→after diff. The item `id` is always stable and independent of `name`.
- *Rationale:* the user wants a stable, human-owned name; letting the agent churn it (and the extractor's search query) is undesirable.

### D4 — Preview/rerun uses current unsaved editor values; reuses shared result shapes
`preview` is discriminated by kind: extract-field → existing `POST /api/extract-field` (`ExtractedFieldValue`); report-section → a new `POST /api/report-section/preview` returning `RenderedSection`. The request carries the in-editor (unsaved/accepted) values, so BOTH endpoints take an **ad-hoc item definition**, not a saved id — `/api/extract-field` already takes an ad-hoc field, and the report endpoint is its direct analog (the reason it's a small new route rather than a call to `renderReport(templateId, sectionIds)`, which renders SAVED sections). It reuses `renderReport`'s single-section rendering internals — confirmed feasible: the server already filters to a `sectionIds` subset (`reportRenderer.ts:543`), so only the ad-hoc-input wrapper is new, no pipeline fork. Preview IS where citation verification applies (reuse `verifyAndTierSnippetCitation`). The in-memory `itemPreviews` value is the discriminated `ExtractedFieldValue | RenderedSection` (carries `fieldId`/`sectionId`), not the bare `GeneratedResult` (D5).

### D5 — Persist the draft as an UNCOMMITTED TEMPLATE; previews are TRANSIENT (never DB)
Decision (user): persist the user's in-progress **schema** so it survives reload, **including onboarding/anon** where no committed `Template` can be saved. **Reframe (review finding — resolves serialization + duplication + lifecycle at once):** persist the **resolved draft as an uncommitted `Template`** using the locked shared shape `TemplateSaveInput` (`templateSchema` discriminated `extract | report` body, name nullable until committed) — NOT a bespoke overlay blob. Rationale:
- The overlay's mutators (`addedFields`/`editedFields`/`removedFieldIds`) use `ReadonlyMap`/`ReadonlySet` (NOT JSON-serializable); persisting the *resolved body* (apply overlay → effective template) is plain arrays, sidestepping any Map/Set serialization.
- A draft schema IS an uncommitted Template; reusing `templateSchema`/`parseTemplate` avoids a duplicate shape + a second source of truth, and unifies the edit-entry path (load base → apply overlay → the working draft is a Template).
- Lifecycle identity: the draft is an **uncommitted, session-scoped Template draft** — orthogonal to the committed Template lifecycle (the auth-gated `/api/templates` save, unchanged), NOT a new "third state". See the `template-lifecycle` delta.

**Previews are NOT persisted.** Per-item preview/extraction results live in an in-memory ChatStore `itemPreviews: Map<string, ExtractedFieldValue | RenderedSection>` slice — the value carries its discriminant (`fieldId`/`sectionId`), NOT the bare `GeneratedResult` base (review finding: the consumer needs to know field-value vs section-body to render). It covers seeded + added items (fixing the `addedFields`-only `setSchemaFieldExtraction` bug — replaces that path), shows on the card during the session, and is RECOMPUTED on demand. Because no preview is persisted, there is no orphan risk. Previews are **cleared when the document scope changes** (a preview is scope-specific).
- DB: an additive `JSON NULL` column on `chat_session_entities` (e.g. `draft_template_json`) holding the serialized uncommitted `Template`, with a read site on hydrate (`viewerFromActiveEntity` seeds the working draft), the `persistedColumnPolicy` guard, and the data-model reconciliation matrix updated. Excluded from the committed `Template`/`Result` save.
- **Anon + sample (review finding):** the persisted draft is the user's working copy and FREEZES what they edited; a fresh load with no draft seeds from the live workflow/manifest schema. If the underlying workflow schema changes between sessions, the existing draft wins (it is a full resolved Template, independent of the manifest) — least-surprising for the user. (Confirmed by user: keep their edits.)
- *Migration care:* `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table (2026-06-22 `last_step_json` outage). Add an explicit `ALTER TABLE … ADD COLUMN` reconciliation (idempotent if the column already exists) + an integration test asserting the column on FRESH, reconciled on STALE, and a safe-rollback note.

### D6 — Single shared request/response contract in `@groundx/shared`
`TemplateItemKind` + `RewriteItemRequest`/`RewriteItemResult` as Zod schemas — one source of truth, mirrored by the app client and the middleware route (apiRouteContract test). The preview result REUSES the existing `generatedResultSchema` (`ExtractedFieldValue`/`RenderedSection`) — no new preview type. New rows added to the `data-model.md` reconciliation matrix.

### D8 — Rewrite + preview are available to anonymous users (NOT gated like Save)
Rewrite and preview are core demo interactions of the onboarding extraction editor, so they are available to `role: anonymous` (consistent with the existing per-field extract/Rerun, which already runs for anon). Only Save/export remain auth-gated (the existing 🔒 padlocks). The LLM rate limiter is the guard against abuse. Server still enforces session ownership.

### D9 — Dedicated `ApiError` subclass for the new endpoints
The rewrite + section-preview routes use a dedicated subclass of the shared `ApiError` base (never `extends Error`), mirrored app-side in `api/templateItem.ts` — satisfying the data-model "before you add" error rule + recurrence-drift guard.

## Risks / Trade-offs
- **DB persistence of overlay is new surface** → entity-twin column + migration. *Mitigation:* mirror `last_step_json` exactly; integration test FRESH+STALE; persistedColumnPolicy guard; round-trip read site before closure.
- **Whole-item rewrite changes many fields at once (incl. `type`/`renderAs`)** → user confusion / downstream breakage. *Mitigation:* before→after diff per changed field; `id` stays stable; type change must be justified in `reasoning`.
- **Rewrite cost/latency (search + chat-profile LLM)** → rate pressure. *Mitigation:* LLM limiter; one LLM call (no baseline-extract by default); loading state in the proposal card.
- **Report per-section render** is NOT a divergence (review finding): `renderReport` already accepts `sectionIds`. *Mitigation:* thin app entry passing `[sectionId]` + a contract test; no pipeline fork.
- **Persistence scope** (RESOLVED, D5): persist the draft SCHEMA; previews are transient (never persisted). No orphan risk — previews aren't stored; the schema they reference is.
- **Citation parity** → previews must verify citations through the same pipeline. *Mitigation:* reuse `verifyAndTierSnippetCitation`; assert tiering in tests.
- **Cross-surface drift** → three editors reimplementing. *Mitigation:* the hook/adapter is the only path; a parity test asserts both surfaces use it.

## Migration Plan
1. Add `@groundx/shared` contracts (no behavior).
2. Middleware: prompt + service + routes + entity-twin column + reconciliation + tests (additive, backward-compatible).
3. App: persist the draft schema overlay (DB twin) + an in-memory `itemPreviews` slice (NOT persisted); hook + adapters; shared widgets; refactor `FieldInlineEditor` AND the existing report `SectionRow` (no new component); remove the stub.
4. No rollback hazard beyond the DB column — additive only; old clients ignore the new column.

## Open Questions
- **RESOLVED (2nd review) — Persistence shape (D5)**: persist the draft as an UNCOMMITTED `Template` (`TemplateSaveInput` resolved body — no Map/Set serialization, no duplicate shape, defined lifecycle identity); previews transient + discriminated (`ExtractedFieldValue | RenderedSection`) + cleared on scope change.
- **RESOLVED (2nd review) — Hook ownership (D1)**: hook is ChatStore-free; the adapter owns `applyProposal`/`persistPreview`; the seeded-field `itemPreviews` fix (§5) precedes the hook wiring (§6).
- **RESOLVED (2nd review) — Prompt status (D3)**: structure locked, phrasing tuned in §2.1 TDD; no-rename enforced structurally.
- **RESOLVED — Anon + sample (D5)**: a persisted anon draft KEEPS the user's edits (freezes); a no-draft load seeds from the live workflow schema. A later change to the sample's built-in schema does NOT discard the user's saved edits. (Confirmed by user.)
- **RESOLVED — Reuse `GeneratedResult`**: no new `PreviewItemResult`; reuse the shared base + `ExtractedFieldValue`/`RenderedSection`.
- **RESOLVED — Citation verification**: applies to PREVIEW only, never to the rewrite output.
- **RESOLVED — Not a tool**: rewrite is user-invoked, absent from the tool catalog.
- **RESOLVED — Baseline-first vs snippets-only**: snippets-only (one LLM call); no baseline extraction. The agent is grounded by the matched snippets + the source-document context (D2).
- **RESOLVED — Rename**: the agent NEVER rewrites `name` (D7); name is auto-populated at creation, user-only after.
- **Source-document grounding (D2)**: confirmed required — pick the concrete GroundX content-retrieval call and the token budget for the source-document view at implementation (reuse what the viewer/extract already use).
- **Endpoint namespacing**: keep `/api/extract-field` + add `/api/report-section/preview` (the ad-hoc-values analog of extract-field), single `/api/template-item/rewrite` (revisit only if a third kind appears).
