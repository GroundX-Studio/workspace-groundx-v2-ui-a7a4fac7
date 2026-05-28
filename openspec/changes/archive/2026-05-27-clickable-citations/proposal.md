# Clickable citations → auto-jump to viewer

## Why

The wireframes promise that every grounded chat answer ends with `[N]`
citation chips that, when clicked, surface the source page in the
document viewer with the cited region highlighted. The current build
ships none of this end-to-end:

- The middleware returns `citations: Citation[]` on every RAG/hybrid
  reply (already correct).
- `CiteChip` exists and dispatches a `highlightCitation` canvas intent,
  BUT
- `ChatColumn` (the F2 + steady chat surface) renders bubbles with the
  answer text only — `result.reply.citations` is never read, never
  threaded through `LiveTurn`, never rendered as chips. Citations are
  visually invisible everywhere except F5's legacy `InteractView`.
- `CanvasOrchestratorContext` has no handler for `highlightCitation`,
  so even the F5 chips dispatch an intent that nobody listens to. The
  inline Popover in `CiteChip` exists as a "pre-UI-04 fallback" — but
  UI-04 never landed; the popover is the de facto experience.
- `PdfViewerWidget` accepts only an `initialPage` (uncontrolled); it
  cannot be told "jump to page 7" after mount, and has no bbox/region
  highlight overlay.
- `listChatMessages` (RT-01 hydrate) returns `PersistedChatMessage`
  rows that drop `citations_json` — so even if ChatColumn were fixed,
  every refresh would lose every chip on the persisted thread.

Net result: the user just observed a chat answer ("I don't have any
snippets…") with no source affordance at all, even after the chat
pipeline returns snippets correctly. The "wired but disconnected"
gap pattern Rule 9 was written to catch.

## What changes

End-to-end wiring of clickable citations from middleware reply → chat
bubble → viewer page jump + region highlight, persisted across
refreshes.

- **EXTEND** `PersistedChatMessage` + `GET /api/chat-sessions/:id/messages`
  to carry `citations: Citation[]` parsed from `citations_json`. RT-01
  hydration restores chips on refresh.
- **EXTEND** `LiveTurn` (in `ChatColumn`) with a `citations` field;
  thread it through `sendChatMessage`'s reply mapping, the RT-01
  hydrate path, and the agent-message projection.
- **RENDER** `<CiteChip>` rows under every assistant `BotBubble` in
  `F2ConversationFlow` AND `SteadyConversationFlow` — matching what
  `InteractView` already does. Use the same `CiteChip` component;
  no new chip variant.
- **ADD** a canvas-side handler for `highlightCitation` on
  `CanvasOrchestratorContext` that (a) opens / switches the viewer
  to a `doc-viewer` step for `documentId`, (b) sets the viewer's
  active page to the cited page, (c) optionally records a bbox
  highlight overlay scoped to the active step.
- **MODIFY** `PdfViewerWidget` to accept a controlled `targetPage`
  prop AND an optional `highlightBbox` overlay rendered on top of the
  active page image. Internal `activePage` state still drives thumb
  clicks but yields to `targetPage` whenever it changes.
- **REPLACE** `CiteChip`'s pre-UI-04 Popover fallback with the
  viewer-jump default. Keep a small ephemeral hover tooltip showing
  page + snippet preview for accessibility, but click → viewer is
  now the primary action across F2/F5/Steady/ExtractView.
- **WIRE** ExtractView's field-row CiteChips into the same handler so
  schema-row citations also jump the viewer (parity, not new feature).

## Out of scope

- A separate "side panel" component distinct from the existing
  viewer pane. The viewer pane *is* the panel — `OnboardingShell` and
  `SteadyShell` already split the canvas into a chat column + a
  viewer pane. Citation click reuses that real estate.
- Multi-document carousel inside the viewer. The viewer switches
  whole-document on citation click; if the chat references two
  documents, the user gets the doc the chip's `documentId` points to.
  Multi-doc browse is a future change.
- Server-rendered `[N]` markers inline in the answer text. Today the
  LLM emits citations as a structured side-channel; chips render
  beneath the bubble (matching InteractView). Inline `[N]` insertion
  is a future polish change.
- Bbox detection / region cropping when the upstream snippet lacks a
  bbox. We render the page-level highlight (full page tinted/scrolled
  to) as the floor; bbox overlay is best-effort.

## Affected

- Capability specs: `chat-routing`, `ui-views`, `ui-runtime`, `data-tier`.
- Scaffold:
  - `app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx` — render
    citations in BOTH F2ConversationFlow and SteadyConversationFlow;
    extend LiveTurn with citations field; thread through hydrate path
  - `app/src/api/chatSessions.ts` — extend `PersistedChatMessage` with
    citations + parse `citations_json`
  - `app/src/components/brand/CiteChip/CiteChip.tsx` — flip default
    behavior to viewer-jump; keep ephemeral hover tooltip for a11y
  - `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx`
    — handle `highlightCitation`: push/swap viewer step + active page
    + highlight overlay
  - `app/src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tsx` —
    accept controlled `targetPage` + `highlightBbox` props
  - `middleware/src/app.ts` — `GET /api/chat-sessions/:id/messages`
    parses + returns `citations_json` per row
  - Tests: `ChatColumn.test.tsx`, `CanvasOrchestratorContext.test.tsx`,
    `PdfViewerWidget.test.tsx`, `apiRouteContract.test.ts`, plus a
    new end-to-end test that asserts the full chat-click→viewer-jump
    chain in the steady shell.
