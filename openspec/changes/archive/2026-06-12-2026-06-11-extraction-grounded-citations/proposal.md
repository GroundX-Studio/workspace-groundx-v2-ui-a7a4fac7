# Proposal — extraction-grounded citations

## Why

**Live-verified defect (adversarial review, 2026-06-11):** answers grounded
ONLY in the EXTRACTED FIELDS block carry ZERO citations. "What is the meter
number?" returns five concrete meter numbers with `citations: []` — no "Show
all sources" chip, no viewer highlight — on the product's flagship question
type. (The durable chat-routing spec briefly recorded this as a Known gap;
that note was dropped when `2026-06-11-wire-embedding-verification` archived
its wholesale rewrite of the requirement — the gap itself is still live in
the product.)

Cause chain: the `CITATIONS_CONTRACT` (prompts/fragments.ts) only defines a
quote-copied-VERBATIM-from-a-SNIPPET citation form. Extraction-grounded claims
have no snippet to quote, so the model (correctly) omits the citations block;
`groundedAnswer.ts#verifiedCitations` reads omission as "the answer did not
draw on the documents" → `[]`. The "absence = uncited" rule is right for jokes
and product questions and FALSE for the extraction path.

## What changes

Extend the citations contract with a second, extraction-sourced citation entry
form, verified against the actual extraction payload (never trusted), with
geometry recovered by the shipped WF-05 field→X-Ray resolver:

1. **Prompt** — when (and only when) the EXTRACTED FIELDS block is in the
   prompt, the citations contract additionally permits entries of the form
   `{documentId, field: "<path into the extraction JSON>", value: "<the cited
   value verbatim from the block>", answerSpan}` (no `page`, no `quote`).
2. **Verification (trust boundary)** — middleware validates each extraction
   entry against the parsed extraction payload it fetched: the documentId must
   be the extraction's document, the `field` path must resolve in the payload,
   and the cited `value` must match the value at that path (normalized). Any
   failure DROPS the entry — the model cannot invent extraction citations. An
   uncited answer (joke, small talk) still carries zero citations.
3. **Geometry** — a validated entry resolves page+bbox via the existing
   `resolveFieldGeometry(value, label, xray)` over the cached document X-Ray
   (the same mechanism the Extract widget's field-geometry route uses) →
   `tier: "paraphrase"` with the chunk box. On a geometry miss the citation
   is **dropped** (user decision 2026-06-11: a citation ships only when it
   can point at a page — no pageless/document-level form, no change to the
   shared `Citation` shape, zero app-side work). Accepted limitation: an
   extraction-grounded claim whose value cannot be located in the X-Ray
   still shows no citation — expected to be rare since the value originates
   from the document.

Not in scope (tracked, not orphaned):

- **Word-level `exact` upgrade for extraction citations** (matching the field
  value through the `-118-map`) — deferred; ticketed as a follow-up task in
  `tasks.md` (T6) and noted in the spec as a MAY-evolution.
- Re-ingesting the sample as plain layout, per-field geometry from GroundX
  (the `/ingest/document/extract/{id}` payload carries field VALUES only — no
  page or geometry, ever; confirmed in `citationGeometry.ts` WF-05 notes and
  `project_groundx_search_geometry.md`). The X-Ray join IS the mechanism.
- Any change to the snippet-quote citation path, tiers enum, or the
  no-invented-citations rule for non-content turns.

## Interaction with related changes (re-checked 2026-06-12 — both SHIPPED)

**`2026-06-11-turn-router-extraction-appstate`** — shipped and archived. Its
`plan.extractionContext` gate is live at the extraction-fetch site
(`groundedAnswer.ts`). Already-correct consequence for this change: a plan
with `extractionContext: false` skips the fetch, so no EXTRACTED FIELDS block
exists, the prompt omits the extraction citations contract, and verification
(holding no payload) drops any fabricated extraction entries. No rebase risk
remains — this change builds directly on the shipped gate.

**`2026-06-11-wire-embedding-verification`** — shipped and archived. The
former delta collision and archive-order constraint are RESOLVED: this
change's spec delta has been verified (2026-06-12 diff) to be a clean
superset of the now-durable requirement text, modifying it directly. The
shipped code also upgraded `verifiedCitations` to verify each quote against
ALL same-page chunks via the async embedder seam (`deps.quoteEmbedder` /
`embedThreshold`) — the extraction branch this change adds is orthogonal (it
never calls `verifyQuote`).

## Conformance to core architectural decisions

- **Composable, not forked (P1):** no new pipeline. The citation entry becomes
  a two-arm discriminated union (`quote`-sourced | `field`-sourced) — a value
  on the existing citation axis, verified inside the ONE `verifiedCitations`
  loop. Geometry reuses `resolveFieldGeometry` + `fetchDocumentXray`, whose
  second caller already exists (the `/api/documents/:id/field-geometry`
  route) — the axis is already earned; we add a third caller, no new
  abstraction. Tier stays the existing 3-value highlight-precision axis
  (rejected a 4th `document` tier — no renderer needs a 4th precision level).
- **Done = user-visible (P5):** done is "what is the meter number?" showing
  citation chips, a Show-all-sources action, and (geometry hit) a viewer
  highlight — asserted by the failing-first test in `tasks.md` T1, live-style
  through `routeChat`. Every persisted byte round-trips (citations_json
  already persists/rehydrates; extraction citations reuse the exact shipped
  `Citation` shape, so persistence/hydrate/rendering need zero changes).
- **One source of truth (P6):** NO citation shape change — extraction
  citations ship as ordinary `Citation`s (`@groundx/shared` untouched).
  Prompt copy lands ONLY in `prompts/fragments.ts` (drift guard holds). No
  twin types: the parsed extraction-entry shape lives beside
  `StructuredCitation` in one place.
- **TDD (P2) / adversarial gate (P3):** `tasks.md` starts with the failing
  user-visible test and tags every task with its gate.
