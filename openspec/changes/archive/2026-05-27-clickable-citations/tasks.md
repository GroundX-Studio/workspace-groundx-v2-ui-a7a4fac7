# Tasks — clickable-citations

Five phases. Each phase ends at green vitest + tsc; phases CAN be
archived independently. Per `scaffold/docs/agents/discipline.md` Rule
9, each phase opens with a failing user-visible test before any
implementation step.

## Phase 1 — Hydrate path carries citations (data-tier)

- [x] **Failing test (Rule 9 closure gate)**: `apiRouteContract.test.ts`
      round-trips citations: POST a chat message that produces a
      citation → `GET /api/chat-sessions/:id/messages` returns the
      same citations array on the assistant turn.
- [x] Extend `PersistedChatMessage` (server response + client type) with
      `citations: Citation[]`.
- [x] Server route parses `citations_json` per row and returns it
      under `citations`. Null `citations_json` maps to `[]`.
- [x] Update `listChatMessages` client to expose the field; no caller
      consumes it yet (Phase 2 picks it up).
- [x] Dead-column / dead-endpoint pass: `citations_json` is now READ
      end-to-end (was only WRITTEN by the chatHandler insert).

## Phase 2 — ChatColumn renders citation chips

- [x] **Failing test**: `ChatColumn.test.tsx` — after a steady-mode
      send returns `{ answer: "...", citations: [c1, c2] }`, the
      assistant bubble has two `[1]` `[2]` chips with the right
      `data-citation-doc` / `data-citation-page`.
- [x] **Failing test**: same for `F2ConversationFlow` (onboarding mode).
- [x] **Failing test**: RT-01 hydrate — listChatMessages returns
      assistant rows with citations → liveTurns carry them →
      chips render on refresh.
- [x] Extend `LiveTurn` with `citations?: Citation[]`.
- [x] Thread `result.reply.citations` into the new turn in both
      F2ConversationFlow and SteadyConversationFlow send handlers.
- [x] Thread citations through both hydrate effects (RT-01) and the
      agent-message projection effect.
- [x] Render `<CiteChip>` row beneath each assistant `BotBubble` —
      identical structure to InteractView's existing pattern.

## Phase 3 — Canvas orchestrator handles `highlightCitation`

- [x] **Failing test**: `CanvasOrchestratorContext.test.tsx` —
      dispatching `{ kind: "highlightCitation", documentId, page,
      bbox }` from any source produces a state transition that
      (a) sets the viewer's current step to a `doc-viewer` for
      that documentId, (b) records the page + bbox as a highlight
      annotation on the active step.
- [x] Reducer handles `highlightCitation`: if current step is already
      a `doc-viewer` for the same `documentId`, mutate the
      step's highlight slot; otherwise push a new doc-viewer step.
- [x] Define `ViewerStepHighlight = { page: number; bbox?: BBox; sourceCitationIndex?: number }`
      and thread onto the existing `doc-viewer` step union variant.
- [x] Persist viewer-state changes via the existing `patchChatSession`
      writer (master-viewer-session Phase 1 plumbing already exists).
- [x] Cross-check: `highlightCitation` now has exactly one handler;
      `CiteChip`'s dispatch is no longer silent.

## Phase 4 — PdfViewerWidget controlled targeting + highlight overlay

- [x] **Failing test**: `PdfViewerWidget.test.tsx` —
      `<PdfViewerWidget documentId="X" targetPage={7} />` mounts with
      `activePage === 7`; changing `targetPage` from `7` to `3`
      remounts the page image at page 3.
- [x] **Failing test**: `<PdfViewerWidget ... highlightBbox={{x,y,w,h}} />`
      renders a `data-testid="pdf-viewer-highlight"` overlay
      positioned proportionally over the active page image.
- [x] Add `targetPage?: number` and `highlightBbox?: BBox | null`
      props. `targetPage` overrides `initialPage` and follows changes
      via effect (debounce one tick).
- [x] Render a positioned absolute overlay `<Box>` inside the page
      image container when `highlightBbox != null`. Coordinates are
      bbox-percent-of-page; the overlay translates them to overlay
      `left/top/width/height` percentages.
- [x] Read `highlightBbox` from the active `ViewerStep.highlight` so
      shells that mount the widget don't need extra prop drilling.

## Phase 5 — CiteChip default flips to viewer-jump (and ExtractView parity)

- [x] **Failing test**: end-to-end in the steady shell — fire a chat
      message that returns one citation; click the chip; assert
      (a) the viewer pane shows the cited documentId, (b) the
      `pdf-viewer-page-image` is at the cited page, (c) the
      `pdf-viewer-highlight` overlay is visible.
- [x] Replace `CiteChip`'s Popover-as-primary with viewer-jump-as-primary.
      Keep a small native `title=` tooltip with page + snippet for
      hover-based accessibility; the popover is removed.
- [x] Verify `ExtractView` field-row CiteChips trigger the same jump
      (no code change — they already share the component; this is a
      coverage-only verification test in `ExtractView.test.tsx`).
- [x] Remove the now-dead "pre-UI-04 fallback" comments in CiteChip
      and the dead `setPeekOpen` state slot.

## Closure (per Rule 9)

- [x] **All four spec deltas merged into durable specs** via
      `npx @fission-ai/openspec@1.3.1 archive` once shipped.
- [x] `npx @fission-ai/openspec@1.3.1 validate --all --strict --json` passes.
- [x] Middleware + app vitest suites green.
- [x] Manual verification screenshot/clip in the PR description showing
      the click→jump→highlight flow in steady mode AND onboarding F5.
