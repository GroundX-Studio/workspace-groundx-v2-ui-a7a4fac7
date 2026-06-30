## Why

The field editor's two "agentic" affordances are broken or fake: **✨ rewrite with agent** is a stub that appends the literal text "(rewritten)" (no LLM), and **↻ Rerun** silently drops its result for any seeded (non-added) field because `setSchemaFieldExtraction` bails when the field isn't in `addedFields`. Both are critical, high-visibility features that must exist identically across the **anonymous onboarding extraction editor, the authenticated extraction editor, and the report builder**. They should reuse the project's existing LLM machinery (the `services/prompts` builder/consumer split, `llmClient` chat profile, and the GroundX-search → snippet → grounded-LLM → citation-verify pipeline) rather than grow a parallel path.

## What Changes

- **Rewrite-with-agent (real).** A new direct, inline endpoint rewrites a template item — Extract field: type/description/instructions/identifiers/format; Report section: renderAs/question/instructions/variables (the `name` is NOT agent-editable: it's auto-populated at creation and user-only after). It is **grounded + result-aware** — it sees the item's current definition, its latest preview result (value/confidence/cited quote), the matched snippets, AND a representative view of the **source document itself** (reusing GroundX document-content retrieval) — and returns a proposed item + reasoning. The editor shows a **before→after diff with Accept / Discard**; Accept populates the form, the user still Saves.
- **Preview/Rerun (fixed + extended).** Re-extract a field (existing `POST /api/extract-field`) or render a **single** report section (new endpoint) using the **current unsaved editor values**, so users can tune → preview → see the new confidence before saving.
- **Draft persistence (DB) as an uncommitted Template + transient previews.** The in-progress schema persists in the DB with the **session** (entity twin) as an **uncommitted `Template`** (the locked shared `TemplateSaveInput` shape, nullable name — the resolved draft, not a Map/Set overlay blob), so it survives reload INCLUDING onboarding/anonymous where no committed Template can be saved. Distinct from the committed `Template` (the auth-gated save). **Preview/extraction results are NOT persisted** — an in-memory `itemPreviews` map (`ExtractedFieldValue | RenderedSection`, carrying the discriminant) covering **seeded and added** items (fixing the `addedFields`-only bug), shown on the card and recomputed on demand, cleared on document-scope change.
- **Composable seam.** Two item kinds (extract-field, report-section) across three deployments (anon extract + authed extract are the SAME `FieldInlineEditor`; report is the existing `SectionRow`). One shared hook (`useTemplateItemAgent`, async ops only — components keep their form state) + a per-surface `TemplateItemAdapter` drive both operations; the EXISTING editors are refactored (no new `SectionInlineEditor`) to render the shared `RewriteProposalCard` + preview chip. Preview results reuse the shared `GeneratedResult` base. No unified mega-component.
- Remove the stub rewrite handler and the dead "(rewritten)" suffix.

In scope: the rewrite + preview operations, their endpoints + prompt, the shared hook/adapter, the editors on all three surfaces, and DB persistence of the draft schema (previews are transient, not persisted). Out of scope: changing what a committed `Template`/`Result` contains; persisting previews; new chat tools (rewrite is a direct endpoint, not an agent-loop tool); multi-field/whole-template batch rewrite.

## Capabilities

### New Capabilities
- `agentic-template-item-editor`: the cross-surface rewrite + per-item preview operations, their server contracts and prompt, the shared editor hook/adapter, and DB persistence of the (uncommitted) draft schema (previews are transient, not persisted).

### Modified Capabilities
- `onboarding-schema-editor`: the Extract field editor wires the real rewrite (preview→accept) and a working per-field preview/Rerun on seeded fields; the stub is removed.
- `smart-report`: the report builder's section editor gains rewrite-with-agent and per-section answer preview (render one section against the scope), reusing the same hook.
- `data-tier`: a new persisted column on the chat-session entity twin holds the (uncommitted) draft as a `TemplateSaveInput`-shaped object, with a read site + the `persistedColumnPolicy` guard. (Previews are not persisted.)
- `template-lifecycle`: defines the uncommitted draft template as session-scoped working state (same `Template` shape, nullable name), orthogonal to the committed-Template lifecycle.

## Impact

- **App**: `components/viewer-widgets/Extract/SchemaView.tsx` (FieldInlineEditor refactor), `components/viewer-widgets/SmartReportBuilder/*` (existing `SectionRow` refactor — no new component), new `hooks/useTemplateItemAgent.ts` + adapters, new shared `RewriteProposalCard` + preview-chip widgets, ChatStore draft-overlay persistence + `itemPreviews` (`GeneratedResult`) slice/actions, `api/templateItem.ts` client. Affected frames: F3/F3a (Understand→Analyze extract), F4a (report builder).
- **Middleware**: new `services/prompts/itemRewriter.ts`, `services/itemRewriter.ts`, `POST /api/template-item/rewrite` + `POST /api/report-section/preview` routes, shared zod contracts in `@groundx/shared`, LLM rate-limiter on rewrite, citation verification reuse. Entity-twin persistence + migration (care: see the 2026-06-22 `last_step_json` outage).
- **Contracts/guards**: `@groundx/shared` Zod request/response types; `data-model.md` reconciliation matrix update; catalog-parity + recurrence-drift + persistedColumnPolicy guards; apiRouteContract tests.

## Open questions
- **RESOLVED — Baseline**: rewrite from snippets + source-document context, one LLM call; no baseline extraction.
- **RESOLVED — Name**: the agent never rewrites `name`; it's auto-populated at creation and user-only after (`id` stable).
- **Remaining — Prompt wording**: the design.md §D3 draft rewrite prompt is pending the user's edits.
