# Spec Delta — ui-views

## MODIFIED Requirements

### Requirement: ChatColumn SHALL render citation chips beneath every assistant bubble

`ChatColumn` SHALL render an assistant turn's citations as the **footnote model**, NOT a
detached row of standalone numbered chips (that flat row is RETIRED). This applies on every
flow that renders assistant turns (`F2ConversationFlow`, `SteadyConversationFlow`, and the
single `ConversationFlow`). The footnote model is:

- **Inline markers** — each cited claim in the answer prose carries an inline `[N]`
  superscript marker (`CiteChip` `variant="footnote"`), `N` 1-based matching the order of
  the turn's `citations` array. Clicking a marker keeps the existing jump-to-region
  behavior (the `highlightCitation` dispatch + `cite.peeked` telemetry).
- **Grouped source list** — beneath the bubble, a single collapsed `N sources` affordance
  expands to a `SourceList` grouped by `documentId` → page, deduped by region (so many
  citations on one document collapse to that document's distinct pages). The existing
  "Show all sources" action lives in this list.
- **Never-drop** — the `SourceList` is built from the FULL `citations` array, so every
  citation is reachable there even when its inline marker is absent or failed to anchor.

The same shared components are used on every surface (no per-surface fork).

#### Scenario: Assistant reply with two citations

- **GIVEN** a chat send returns `{ answer: "...[1]...[2]...", citations: [c1, c2] }`
- **WHEN** the reply renders
- **THEN** two inline `[1]` / `[2]` footnote markers appear within the answer prose
- **AND** a collapsed `2 sources` affordance beneath the bubble expands to the grouped source list
- **AND** each marker exposes `data-citation-doc` + `data-citation-page` and routes to the viewer on click

#### Scenario: Many citations on one document do not become a wall

- **GIVEN** an answer with 27 citations, all the same document across pages 1–3
- **WHEN** the reply renders
- **THEN** NO flat row of 27 standalone numbered chips is rendered
- **AND** inline markers sit next to their claims in the prose
- **AND** the collapsed `27 sources` affordance expands to a single document group listing its distinct pages (deduped)

#### Scenario: A citation with no inline marker is still reachable (never-drop)

- **GIVEN** a turn whose `citations` array has an entry with no matching `[N]` in the prose and no anchorable `answerSpan`
- **WHEN** the reply renders
- **THEN** that citation still appears in the grouped source list and routes to the viewer on click

### Requirement: Citation chips SHALL survive a refresh

Assistant turns SHALL carry their citations after a page refresh just as they did at first
render. The hydrate path (`GET /api/chat-sessions/:id/messages`, RT-01) SHALL parse the
persisted `citations_json` per row and project it through the API helper into
`PersistedChatMessage.citations`, which then feeds `LiveTurn.citations`. No citation data
SHALL be dropped between insert and rehydrate. The rehydrated turn SHALL re-render in the
footnote model (inline markers + grouped source list), not as a flat chip row.

#### Scenario: Refresh re-renders the footnote model

- **GIVEN** the user sent a chat turn that produced two citations
- **WHEN** the user refreshes the browser
- **THEN** the answer re-renders with its inline `[1]` `[2]` markers and the collapsed source list
- **AND** clicking either marker (or a source-list entry) still routes to the viewer

### Requirement: The chat answer SHALL render claim segments whose highlight precision matches the citation tier

The ChatColumn SHALL render each cited claim in an assistant answer with an inline `[N]`
footnote marker (`CiteChip variant="footnote"`), and that marker SHALL be the affordance for
the claim: on hover or click of the marker, the ChatColumn SHALL highlight the claim's source
region at the precision of its citation `tier`. An `exact`-tier claim SHALL drive a tight
(word-level) `pdf-viewer-highlight`; a `paraphrase`-tier claim SHALL drive a chunk-region
overlay rendered with a distinct, lower-confidence (translucent) visual; an `ambient`-tier
claim SHALL drive the marker / source affordance only, with no inline span highlight. The
`highlightCitation` dispatch SHALL remain the path for ambient sources, so the floor behavior
is unchanged when no tier resolves above ambient. (The `exact` tier may be dormant until the
middleware emits it — the render MUST handle all three tiers regardless.) There SHALL be ONE
claim-interaction model: the footnote marker IS the tiered claim's affordance, not a second
parallel mechanism.

SCOPE: this change wires the marker as the affordance and renders the `ambient` floor (the
existing `highlightCitation` path that ships today); the `exact` (word-level) and
`paraphrase` (chunk-region) viewer-overlay precisions are handled-but-dormant pending the
middleware emitting those tiers. No NEW word-level/chunk overlay rendering is built here
beyond what already exists — only the unified marker → tiered-dispatch wiring.

#### Scenario: Tier drives highlight precision via the claim's marker

- **GIVEN** an assistant answer whose claims carry citations tiered `exact`, `paraphrase`, and `ambient`
- **WHEN** the user hovers or clicks each claim's `[N]` marker in turn
- **THEN** the `exact` claim lights a tight word-level highlight on the cited page
- **AND** the `paraphrase` claim lights the chunk-region overlay in the translucent style
- **AND** the `ambient` claim drives only its marker / source affordance with no inline highlight

### Requirement: F5 InteractView SHALL light citation regions on the PDF in chip-keyed colors

The PdfViewerWidget SHALL paint one lit region per `[N]` footnote marker in the assistant
reply, color-matched to the marker itself, on any surface that shows an assistant answer
beside a viewer (Interact and steady-mode chat alike — not a single frame; the "F5" in this
requirement's name is legacy). Region colors MUST follow the canonical mapping:
`[1]` green (primary), `[2]–[3]` cyan, anomaly / low-confidence citations coral. The `[N]`
footnote markers carry these index-keyed colors, and the `SourceList` page-chips for the same
citation reuse the same color — so the marker, its source-list chip, and its lit region read
as one consistent unit. This is the SINGLE canonical lit-region color rule, shared with the
`litRegions[]`-derivation requirement below.

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user asks a question producing an answer with citations `[1]` (page 1), `[2]` (page 1), `[3]` (pages 1–2), `[4]` (page 3, coral)
- **WHEN** the answer bubble renders
- **THEN** the PDF viewer paints 4 lit regions
- **AND** region 1 is green, regions 2 and 3 are cyan, region 4 is coral
- **AND** clicking a marker scrolls the PDF to its region

### Requirement: F5 InteractView SHALL paint litRegions on the canvas PDF from the latest assistant citations

The viewer canvas SHALL mount a `PdfViewerWidget` whose `litRegions[]` prop is derived from
the citations on the latest assistant turn, on any surface that shows an assistant answer
beside a viewer (Interact and steady-mode chat alike — not a single frame; the "F5" in this
requirement's name is legacy). The widget SHALL paint one region per citation, color-keyed by
the SAME canonical mapping as the markers — `[1]` green (primary), `[2]–[3]` cyan, anomaly /
low-confidence coral — so a citation's marker, its `SourceList` chip, and its lit region share
one color. This SUPERSEDES the earlier first/middle/last positional coloring, removing the
prior conflict between this requirement and the chip-keyed-colors requirement (the anomaly →
coral semantic rule wins, matching the `CiteChip` `color` prop).

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user is on an answer-beside-viewer surface and the latest assistant turn has 4 citations, the 4th low-confidence
- **WHEN** the canvas renders
- **THEN** the `PdfViewerWidget` mounts with `litRegions` of length 4
- **AND** region `[1]` is green, `[2]`–`[3]` are cyan, and the low-confidence `[4]` is coral

#### Scenario: Empty / no citations renders no overlay

- **GIVEN** the latest assistant turn has zero citations
- **WHEN** the canvas renders
- **THEN** the `PdfViewerWidget` renders with an empty `litRegions[]`
- **AND** no `pdf-viewer-lit-region-*` elements appear

### Requirement: F5 InteractView SHALL open a citation side-panel on chip click

Citation markers SHALL be clickable on EVERY surface that renders assistant turns, extract
field rows, or report sections — app-wide, not any single frame (the "F5" in this
requirement's name is legacy; there is no frame-scoped fork). Clicking a marker SHALL switch
the viewer pane to the cited document (if not already active), navigate the viewer to the
cited page, and render a region highlight overlay scoped to the cited bbox. There is no
separate side-panel widget — the existing viewer pane in `OnboardingShell` / `SteadyShell`
IS the destination.

#### Scenario: Click a citation marker from any surface

- **GIVEN** an assistant turn carrying a citation `{documentId: D, page: 7, bbox: {...}}`
- **WHEN** the user clicks its `[N]` marker
- **THEN** the viewer pane shows document `D`
- **AND** the page image renders page 7
- **AND** a highlight overlay covers the cited region (best-effort if bbox is absent → page-level highlight only)
- **AND** the `cite.peeked` telemetry event still fires with the same payload

#### Scenario: Click a citation marker while viewer already shows the doc

- **GIVEN** the viewer already shows document `D` on page 3
- **WHEN** the user clicks a marker pointing at `D` page 7
- **THEN** the same `doc-viewer` step is mutated in place (no new viewer-history entry)
- **AND** the page jumps to 7 with the bbox overlay

## ADDED Requirements

### Requirement: Citation rendering SHALL use shared inline-marker + source-list components on every surface

The inline-marker (`CiteChip` `variant="footnote"`) and the grouped `SourceList` SHALL be
the citation presentation on EVERY surface that renders citations app-wide — chat answers,
extract field rows (the Extract widget wherever it mounts, onboarding and authenticated
alike), and report sections — with no surface-specific or frame-specific fork. Citation
numbering SHALL be local to each rendering unit (per answer / per field row / per section),
matching how `citations[]` is already scoped to that unit. Surfaces whose unit carries a
single citation SHALL render the inline marker plus a one-line source without collapse
chrome.

#### Scenario: Extract field row renders the shared citation components

- **GIVEN** an extract field row whose value carries one citation
- **WHEN** the row renders on any surface that mounts the Extract widget
- **THEN** it uses the same inline `CiteChip` footnote variant as chat (no Extract-specific chip)
- **AND** clicking it routes to the cited region exactly as the chat marker does

#### Scenario: Report section renders the shared citation components

- **GIVEN** a report section whose prose carries multiple citations
- **WHEN** the section renders
- **THEN** it uses the same inline markers + grouped `SourceList` as chat (no report-specific fork)
