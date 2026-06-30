## ADDED Requirements

### Requirement: Rewrite a template item with a source-document-grounded agent
The system SHALL provide a direct endpoint that rewrites a template item (Extract field or report section) using an LLM grounded in BOTH the matched field-query snippets AND a representative, token-bounded view of the **source document itself** (reusing GroundX document-content retrieval) plus the item's current result, and SHALL return a proposed item plus a one-line reasoning. The endpoint MUST reuse the existing prompts module (`services/prompts`) and `llmClient` chat profile. The rewrite output is a DEFINITION (no citations) and SHALL NOT be run through citation verification (that applies to preview only). The endpoint is user-invoked and SHALL NOT be exposed as an LLM tool in `SERVER_TOOL_CATALOG`. The agent MUST NOT extract or invent a value, and MUST NOT change the item `name`; it edits the rest of the item definition only.

#### Scenario: Source-document-grounded rewrite returns a proposed item
- **WHEN** the editor calls `POST /api/template-item/rewrite` with `{chatSessionId, kind, item, currentResult?}` for an owned session
- **THEN** the server derives the session's ContentScope, assembles both the matched snippets and a source-document view, makes one chat-profile LLM call with the item-rewriter prompt, and returns a zod-valid `{proposedItem, reasoning}` whose `id` equals the input item's `id` and whose `name` equals the input item's `name`

#### Scenario: The rewrite is grounded in the actual document
- **WHEN** the rewrite prompt is built
- **THEN** it includes the source-document context (not only the narrow field-query match) and instructs the agent to use the document's real labels/layout/units to improve the definition

#### Scenario: Rewrite is rate-limited and authorized
- **WHEN** the caller does not own the chat session, or exceeds the LLM rate limit
- **THEN** the endpoint returns the normalized `ApiError` envelope (`not_session_owner` / rate-limit) and makes no LLM call

#### Scenario: Already-precise item is returned largely unchanged
- **WHEN** the current item definition already extracts well
- **THEN** the proposed item is returned substantially unchanged with `reasoning` indicating it is already precise

### Requirement: Rewrite is delivered as a before→after proposal the user accepts
The editor SHALL present the agent's proposed item as a before→after diff of every changed field with Accept and Discard controls. Accepting SHALL populate the editor form only (the user still Saves); discarding SHALL leave the form unchanged. The legacy stub that appended the literal text "(rewritten)" SHALL be removed.

#### Scenario: Accept applies the rewrite to the form
- **WHEN** the user clicks Accept on the rewrite proposal
- **THEN** the editor form fields update to the proposed values, the proposal card closes, and nothing is persisted until the user Saves

#### Scenario: Discard leaves the form untouched
- **WHEN** the user clicks Discard
- **THEN** the form retains its prior values and no field is changed

### Requirement: Preview a template item with the current unsaved values
The system SHALL preview a single template item against the session scope using the values currently in the editor (including an accepted rewrite, before Save). The result SHALL reuse the shared `GeneratedResult` base: an Extract field yields `ExtractedFieldValue` (value + verified citations + confidence); a report section yields `RenderedSection` (rendered body + verified citations) via the existing `renderReport` `sectionIds` parameter. Citation verification (the shared verify-and-tier pipeline) applies here.

#### Scenario: Field preview uses current editor values
- **WHEN** the user edits a field's prompt and clicks Rerun
- **THEN** the extraction runs with the edited (unsaved) values and returns `{value, confidence, citation}` reflecting them

#### Scenario: Report section preview renders one section
- **WHEN** the user previews a single report section
- **THEN** the server renders only that section against the scope and returns `{renderedText, citations}` without rendering the whole template

### Requirement: The draft persists as an uncommitted Template; previews are transient
The in-progress schema SHALL be persisted in the DB with the chat-session entity twin AS AN UNCOMMITTED TEMPLATE (the shared `TemplateSaveInput` shape — the resolved draft body, name nullable), surviving editor-close and reload (DB source of truth, localStorage cache), INCLUDING for an anonymous session with no committed Template. It SHALL NOT be written into a committed `Template`/`Result` (the separate, auth-gated save). Preview/extraction results SHALL NOT be persisted: they are an in-memory `itemPreviews` map whose values are the discriminated `ExtractedFieldValue | RenderedSection` (carrying `fieldId`/`sectionId`), covering seeded and added items, shown on the card during the session, recomputed on demand, and cleared when the document scope changes. The previous behavior of dropping results for non-added (seeded) fields SHALL be removed.

#### Scenario: A seeded field's preview shows on its card during the session
- **WHEN** the user reruns a seeded (non-added) field and closes the editor in the same session
- **THEN** the latest value + confidence is held in memory against that field id and shown on the collapsed field card

#### Scenario: The draft schema survives reload; previews are recomputed
- **WHEN** the session is reloaded
- **THEN** the draft schema edits are restored from the DB entity twin, and previews are absent until recomputed on demand (no preview is read from or written to the DB)

#### Scenario: The committed Template save excludes draft-only preview state
- **WHEN** a Template/Result is saved
- **THEN** the saved payload contains the committed template, with no in-memory preview results

### Requirement: One shared implementation across all three editor surfaces
The rewrite and preview operations SHALL be implemented once in a shared hook (`useTemplateItemAgent`) parameterized by a per-surface `TemplateItemAdapter`, and consumed by the anonymous extraction editor, the authenticated extraction editor, and the report builder. No surface SHALL reimplement either operation.

#### Scenario: All surfaces route through the shared hook
- **WHEN** rewrite or preview is invoked on any of the three surfaces
- **THEN** the call flows through `useTemplateItemAgent` + the surface's adapter, verified by a parity test
