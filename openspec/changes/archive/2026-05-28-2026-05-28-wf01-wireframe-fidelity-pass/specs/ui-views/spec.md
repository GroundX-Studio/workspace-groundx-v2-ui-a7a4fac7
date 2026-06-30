# Spec Delta — ui-views

## ADDED Requirements

### Requirement: F1 IngestView SHALL render full-bleed without app chrome

The F1 IngestView SHALL be rendered with no sidebar nav AND no chat
pane. The AppShell MUST expose a `chrome="bare"` mode that
`OnboardingShell` activates when `session.currentFrame === "f1"`.
The IngestView occupies the full viewport width minus standard page
gutters; sidebar + chat slide back in during the F1→F2 transition
animation per `openspec/wireframes/source/spec-nav-v2.jsx`.

#### Scenario: F1 hides sidebar and chat

- **GIVEN** the user is on `/onboarding` (no scenario picked) and the
  current frame is `f1`
- **WHEN** the OnboardingShell renders
- **THEN** no element with `aria-label="Primary navigation"` is in the document
- **AND** no element with `aria-label="Chat pane"` is in the document
- **AND** the IngestView fills the viewport.

#### Scenario: F1→F2 transition restores chrome

- **GIVEN** the user clicks a sample tile on F1
- **WHEN** the frame transitions to `f2`
- **THEN** the sidebar slides in from the left over ~200ms
- **AND** the chat pane slides in beside it over ~200ms (starting ~100ms after the sidebar)
- **AND** the canvas compresses to accommodate both panes.

### Requirement: F1 SHALL render every sample scenario surfaced by the middleware

The F1 IngestView SHALL render one sample tile per scenario surfaced by `/api/scenarios`, in a responsive grid (up to 3 columns on desktop). The first scenario (by `order`) MUST carry a `★ start here` recommended badge. Each tile MUST display the `chapters.{extract,interact,report}` availability as filled (live) or hollow (grayed) capability badges. (Adding Loan + Solar scenarios is a content task — author the JSON spec + ingest the PDFs to bucket 28454 — tracked separately. The UI contract here ensures the picker scales gracefully from 1 → N tiles.)

#### Scenario: One scenario in the registry renders one tile

- **GIVEN** the `/api/scenarios` response includes only the utility scenario
- **WHEN** the user navigates to `/onboarding`
- **THEN** exactly one sample tile renders
- **AND** the Utility tile carries a "★ start here" badge.

#### Scenario: Three scenarios in the registry render three tiles

- **GIVEN** the `/api/scenarios` response includes utility, loan, and solar manifests
- **WHEN** the user navigates to `/onboarding`
- **THEN** three sample tiles render in a grid
- **AND** the Utility tile (lowest `order`) carries a "★ start here" badge
- **AND** each tile's capability badges match its `chapters` flags.

### Requirement: F2 UnderstandView SHALL render the PDF viewer during live parse

While `session.currentFrame === "f2"`, the canvas SHALL render the
`PdfViewerWidget` (centered, max-width ~560px, aspect 8.5/11) with the
scan-line animation overlaid, and the thinking-stream notes MUST render
in the chat column — NOT in the canvas. The step strip SHALL remain on
`Understand` (active green) for the entire F2 phase; it advances to
`Extract` only when the chat emits the `Done. … Ready to analyze.`
bubble.

#### Scenario: F2 canvas shows PDF + scan, chat shows thinking notes

- **GIVEN** the user has just clicked the Utility sample tile
- **WHEN** the F2 frame settles
- **THEN** the canvas contains a `PdfViewerWidget` element
- **AND** a scan-line animation is running over the PDF
- **AND** the thinking notes (`parsing layout · page 1` …) render inside the chat column, not the canvas
- **AND** the step strip's active step is `Understand` (not `Extract`).

#### Scenario: Step strip advances on Done bubble

- **GIVEN** the F2 thinking stream is playing
- **WHEN** the chat emits the `Done. Ready to analyze.` bubble
- **THEN** the step strip transitions from `Understand` (active) to `Extract` (active)
- **AND** `Understand` becomes ✓ done-traversed.

### Requirement: F3 ExtractView SHALL place the PDF viewer on the left and fields on the right

The F3 ExtractView canvas SHALL use a two-pane grid `1.2fr 1fr` with
the `PdfViewerWidget` in the LEFT pane and the extracted-fields panel
in the RIGHT pane. The field panel MUST render a category-tabs row,
field cards with the canonical anatomy (uppercase snake_case key,
bold-navy value, coral citation chip), and a sign-in unlock banner
pinned below the panes.

#### Scenario: F3 layout has PDF left, fields right

- **GIVEN** the user is on F3 (`/onboarding/:bucketId/:scenarioId` with extract-workbench step)
- **WHEN** the ExtractView renders
- **THEN** a `PdfViewerWidget` is in the left pane (`grid-template-columns: 1.2fr 1fr`, left column)
- **AND** the extracted-fields panel is in the right pane.

#### Scenario: F3 renders category tabs

- **GIVEN** the active schema has multiple categories (e.g. `statement` and `meters`)
- **WHEN** the ExtractView renders
- **THEN** a tabs row renders one tab per category with `{name} · {fieldCount}`
- **AND** clicking a tab switches the visible field list to that category.

#### Scenario: Field card carries canonical anatomy

- **GIVEN** a field with key `account_number`, value `1023456`, citation page 1
- **WHEN** its card renders in F3
- **THEN** the card shows the key as monospace `account_number` (not Title-case)
- **AND** the value `1023456` in bold navy
- **AND** a coral citation chip `[1] p.1` (not the cyan default).

#### Scenario: Topbar controls do not overlap

- **GIVEN** the F3a edit-schema topbar is rendered
- **WHEN** the layout settles
- **THEN** the `← back`, schema name, version chip, `export ▾`, `↻ rerun`, and `💾 Save` controls all have non-overlapping bounding rectangles
- **AND** all controls are individually focusable.

### Requirement: F4 SHALL render a Field provenance panel on field-card click

When a user clicks a field card in F3, the right pane SHALL swap from
the extracted-fields list to a `FieldProvenancePanel` containing
sections FIELD / SOURCE / WHY MATCHED / CONFIDENCE / NEIGHBORS. A
breadcrumb row `← all fields › {category} · #{n} › {fieldKey}` SHALL
appear above the panes with `▴ collapse` and `↗ open full doc` ghost
controls. The selected field's source region MUST be highlighted on
the PDF with a floating `match · {confidence}%` label.

#### Scenario: Click field → provenance panel + breadcrumb

- **GIVEN** the user is on F3 with the extracted-fields panel visible
- **WHEN** they click the `account_number` field card
- **THEN** the right pane swaps to a `FieldProvenancePanel` with the five named sections
- **AND** a breadcrumb appears: `← all fields › statement · account_number`
- **AND** the PDF viewer highlights the source region in green with a `match · 98%` floating label.

#### Scenario: ▴ collapse returns to F3

- **GIVEN** F4 is open
- **WHEN** the user clicks `▴ collapse`
- **THEN** the right pane reverts to the extracted-fields list
- **AND** the breadcrumb disappears
- **AND** the PDF region highlight clears.

### Requirement: F5 InteractView SHALL light citation regions on the PDF in chip-keyed colors

The F5 PdfViewerWidget SHALL paint one lit region per `[N]` CiteChip in the assistant reply, color-matched to the chip itself. Region colors MUST
follow the canonical mapping: `[1]` green (primary), `[2]–[3]` cyan,
anomaly / low-confidence citations coral.

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user asks an F5 question producing an answer with citations `[1]` (page 1), `[2]` (page 1), `[3]` (pages 1–2), `[4]` (page 3, coral)
- **WHEN** the answer bubble renders
- **THEN** the PDF viewer paints 4 lit regions
- **AND** region 1 is green, regions 2 and 3 are cyan, region 4 is coral
- **AND** clicking a chip scrolls the PDF to its region.

## MODIFIED Requirements

### Requirement: F7 IntegrateView SHALL ship real connector cards + plugin downloads

The F7 IntegrateView SHALL render a 2-column grid: an **API tile**
(left) with a code snippet block + masked `YOUR API KEY` row + ghost
copy buttons for `curl` / `Python` / `TS`, and an **Agent Plugins
tile** (right) with 4 plugin rows (Claude · OpenAI · Gemini · Cursor)
each with a size and a download CTA. An on-prem footnote SHALL be
pinned below the grid. All locked items (API key, plugin downloads)
route to F6 via an unlock banner pinned above the grid.

The original "real connector cards + plugin downloads" requirement is
retained; this MODIFIED version adds the explicit 2-column layout +
unlock-banner + on-prem footnote contract that the wireframe pins.

#### Scenario: F7 renders both tiles

- **GIVEN** the user is on F7 (reachable via the step strip Integrate pill)
- **WHEN** the IntegrateView renders
- **THEN** an API tile is in the left column with `# utility bill, your bucket` code preamble
- **AND** an Agent Plugins tile is in the right column with 4 plugin rows
- **AND** an unlock banner is pinned above the grid
- **AND** the on-prem footnote (`⛏ Running on-prem or air-gapped?`) is pinned below the grid.
