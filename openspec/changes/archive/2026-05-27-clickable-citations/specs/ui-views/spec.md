# Spec Delta — ui-views

## MODIFIED Requirements

### Requirement: F5 InteractView SHALL open a citation side-panel on chip click

Citation chips SHALL be clickable on EVERY chat surface that renders
assistant turns (F2 onboarding chat, F5 InteractView, steady-mode
chat, AND F3/F3a/F4 ExtractView field rows) — not just F5. Clicking
a chip SHALL switch the viewer pane to the cited document (if not
already active), navigate the viewer to the cited page, and render
a region highlight overlay scoped to the cited bbox. There is no
separate side-panel widget — the existing viewer pane in
`OnboardingShell` / `SteadyShell` IS the destination.

#### Scenario: Click a citation chip from chat (any surface)

- **GIVEN** an assistant turn carrying a citation `{documentId: D, page: 7, bbox: {...}}`
- **WHEN** the user clicks the `[1]` chip
- **THEN** the viewer pane shows document `D`
- **AND** the page image renders page 7
- **AND** a highlight overlay covers the cited region (best-effort if bbox is absent → page-level highlight only)
- **AND** the `cite.peeked` telemetry event still fires with the same payload

#### Scenario: Click a citation chip while viewer already shows the doc

- **GIVEN** the viewer already shows document `D` on page 3
- **WHEN** the user clicks a chip pointing at `D` page 7
- **THEN** the same `doc-viewer` step is mutated in place (no new viewer-history entry)
- **AND** the page jumps to 7 with the bbox overlay

## ADDED Requirements

### Requirement: ChatColumn SHALL render citation chips beneath every assistant bubble

`ChatColumn` SHALL render a row of `<CiteChip>` components beneath
each assistant `BotBubble` whose backing `LiveTurn` carries a
non-empty `citations` array, on BOTH the `F2ConversationFlow`
(onboarding) and `SteadyConversationFlow` (steady-mode) branches.
The chip indices SHALL be 1-based and match the order returned by
the chat router. The same `CiteChip` component is used on every
surface (no per-surface fork).

#### Scenario: Assistant reply with two citations

- **GIVEN** a steady-mode chat send returns `{ answer: "...", citations: [c1, c2] }`
- **WHEN** the reply renders
- **THEN** the bubble has two chips labeled `[1]` and `[2]`
- **AND** each chip exposes `data-citation-doc` + `data-citation-page` for downstream wiring

### Requirement: Citation chips SHALL survive a refresh

Assistant turns SHALL carry their citation chips after a page refresh
just as they did at first render. The hydrate path (`GET
/api/chat-sessions/:id/messages`, RT-01) SHALL parse the persisted
`citations_json` per row and project it through the API helper into
`PersistedChatMessage.citations`, which then feeds `LiveTurn.citations`
in `ChatColumn`. No citation data SHALL be dropped between insert
and rehydrate.

#### Scenario: Refresh re-renders chips

- **GIVEN** the user sent a chat turn that produced two citations
- **WHEN** the user refreshes the browser
- **THEN** the same two `[1]` `[2]` chips render beneath the bot bubble
- **AND** clicking either still routes to the viewer
