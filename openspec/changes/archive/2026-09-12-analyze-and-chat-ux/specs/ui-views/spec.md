## MODIFIED Requirements

### Requirement: F3 Extract SHALL render live workflow schema and extract values

F3 MUST render the **full extracted object output-first** — its STRUCTURE walked from the live
extraction OUTPUT tree (`getGroundXDocumentExtract(documentId)`) as-received, and its LABELS/TYPES
joined from the live workflow schema fields **by field name** — with **no hardcoded group names**
and **no first-element flatten**, not from the scenario manifest. STRUCTURE MUST come from the
output tree: top-level scalar fields (statement scalars hoisted to root), top-level array groups
(`meters`, synthesized `account_charges`), and within a meter its nested `meter_charges` array. The
app MUST NOT reassemble, re-nest, or group-by — the server already reshaped the output. The parse
MUST yield **one instance per array element** (every meter; every charge nested under its meter),
not element `[0]`. LABELS/TYPES/instructions MUST come from the workflow schema fields read by name
(`workflowToSchema` over `workflow.extract.<group>.fields.<id>.prompt`, resolved via `getDocument`
→ `getGroundXWorkflow(filter.workflow_id)`); a charge field under `meter_charges` OR
`account_charges` MUST resolve to the `charges` group's field def by name. The workflow schema MUST
NOT be restricted to a fixed `{statement, meters, charges}` allow-list. Hiding MUST be by absence of
a matching schema field: an output key with no schema field MUST NOT render; there MUST be no
hardcoded `__conflicts` pattern and no `leafFields` allow-list. `ExtractView` and `SchemaView`
(F3a) MUST NOT read `scenario.manifest.extractionSchema` or `sampleExtractionValues`. A
`{value, confidence}` field value MUST be unwrapped defensively with the confidence surfaced per
instance when present; the real output carries none, so the confidence band is dormant. The render
source is live data (output + workflow schema), NOT the persisted Extract Template (a different,
flat `{categories}` shape); this requirement does NOT assume a v1 workflow.

#### Scenario: F3 shows real extracted values

- **GIVEN** the Utility sample doc with a `filter.workflow_id`
- **WHEN** F3 renders
- **THEN** the values come from `getGroundXDocumentExtract` (the real bill figures)
- **AND** no manifest `sampleExtractionValues` are displayed.

#### Scenario: All array instances render (no flatten)

- **GIVEN** the Utility bill output with 8 meters, each with nested `meter_charges`, plus top-level `account_charges`
- **WHEN** F3 renders the fields panel
- **THEN** all 8 meters render, each with its charges nested beneath it, and `account_charges` renders as its own top-level group
- **AND** no meter or charge beyond the first is dropped.

#### Scenario: An arbitrary output shape renders (anti-hardcode)

- **GIVEN** an extraction output whose top-level array group is NOT named `statement`/`meters`/`charges` and nests an array two levels deep
- **WHEN** the parse + render walk the output and join labels from the schema by name
- **THEN** every group, instance, and nested instance renders
- **AND** no group is dropped for not matching a name allow-list.

#### Scenario: An output key with no schema field is hidden

- **GIVEN** an extraction output containing a key that has no matching workflow schema field
- **WHEN** F3 renders
- **THEN** that key is not displayed
- **AND** no hardcoded `__conflicts` filter is used to hide it.

### Requirement: F3 PDF viewer SHALL highlight the selected field's source region

The F3 ExtractView SHALL cross-link a field-instance row to its source region on the left-pane
`PdfViewerWidget` via `targetPage` + `highlightBbox`, driven by **hover/focus** (transient) and
**click** (pinned), keyed **per field-instance** (a value on meter 2 charge 3 is distinct from
meter 0 charge 0). On mouse-leave/blur the transient highlight clears; when nothing is
hovered/pinned the viewer falls back to its uncontrolled default. The highlight overlay MUST use
the padded overlay geometry so it does not visually clip the marked glyphs.

#### Scenario: Hovering a field-instance highlights its source page + bbox

- **GIVEN** the user is on F3 with the Utility scenario
- **WHEN** they hover the row for meter 2's `line_amount`
- **THEN** the left-pane PdfViewerWidget renders `targetPage` matching that instance's citation page
- **AND** an element with testid `pdf-viewer-highlight` overlays that instance's bbox
- **WHEN** they move the pointer off the row
- **THEN** the transient highlight clears.

#### Scenario: No hover/pin leaves the viewer at its default

- **GIVEN** the user is on F3 with nothing hovered or pinned
- **WHEN** the viewer renders
- **THEN** no `pdf-viewer-highlight` overlay is in the document.

## ADDED Requirements

### Requirement: The chat SHALL render a thinking stream instead of a bare loading dot

While a chat turn is in flight, the chat message list SHALL render a live **thinking stream** —
the turn's ordered status lines (and any model-reasoning summary, when present) — in place of the
bare "…" indicator. This indicator lives in `app/src/conversation/chatPrimitives.tsx` (the
`showThinking` → `LoadingDots` `BotBubble`), NOT in `ChatColumn`. When the final message event
arrives, the thinking stream SHALL collapse and the rendered answer (with citations) SHALL
replace it.

#### Scenario: In-flight turn shows status, not a bare dot

- **GIVEN** the user sends a chat message
- **WHEN** the turn is still resolving (searching, verifying citations)
- **THEN** the chat shows the streamed status lines (e.g. "verifying citations"), not only a "…"
- **WHEN** the final message arrives
- **THEN** the thinking stream is replaced by the answer and its citation chips.

### Requirement: The Extract fields scrollbar SHALL sit flush at the pane edge

The Extract fields scroll container SHALL NOT reserve an unused right-margin gutter; its vertical
scrollbar SHALL sit flush at the fields pane edge. The ChatColumn scrollbar-gutter requirement is
unchanged.

#### Scenario: No wasted gutter beside Extract fields

- **GIVEN** F3 Extract with enough fields to scroll
- **WHEN** the fields pane renders
- **THEN** `extract-fields-scroll` places its scrollbar at the pane edge without an internal empty gutter.

### Requirement: The chat header SHALL NOT clip the top of scrolled content

The chat column header's fade/mask SHALL pad its own text rather than overlap the scroll
region, so the message list can scroll fully to the top (y=0) without the first content being
clipped behind the header.

#### Scenario: Scrolled chat content reaches the top

- **GIVEN** a chat with enough messages to scroll
- **WHEN** the user scrolls to the top
- **THEN** the first message is fully visible, not clipped behind the header fade.

## REMOVED Requirements

### Requirement: F4 SHALL render a Field provenance panel on field-card click

**Reason**: Retired. The inline provenance block (`<Box data-testid="field-provenance-panel">`
at `Extract.tsx:1033` — SOURCE / WHY MATCHED, swapped into the right pane on field-card click)
added little: WHY MATCHED merely echoed the field description, and swapping the pane was heavier
than the task. It is an inline block inside `Extract.tsx`, not a `FieldProvenancePanel` component.
It is replaced by driving the PDF bounding-box highlight directly from hover/click on a
field-instance row (see the modified "F3 PDF viewer SHALL highlight the selected field's source
region"), with the confidence band shown inline on the row. The `field-provenance-panel` test
contract in `docs/agents/testing.md` is retired with it.
