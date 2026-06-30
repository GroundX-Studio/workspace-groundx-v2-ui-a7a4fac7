# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: Chat citations SHALL carry page + normalized bbox resolved from X-Ray or the search result

The chat router SHALL populate each `reply.citations[*]` with the correct `page` and a normalized
`bbox` (0-1 page-relative `{x,y,w,h}`). When the search result already carries geometry
(`boundingBoxes` + `pages`), the router SHALL read it directly: page from
`boundingBoxes[0].pageNumber` (falling back to `pages[0].number`), and bbox from the union of the
result's pixel `boundingBoxes` **on the cited page** (grouped by `pageNumber`, never unioned across
pages) normalized by that page's `width`/`height`. When the result carries no `boundingBoxes`, the
router SHALL resolve geometry from the document's X-Ray by matching the citation snippet against
`chunks[].text`, taking the page from the
matched chunk's `pageNumbers[0]` and normalizing the chunk's cited-page `boundingBoxes`; the X-Ray
SHALL be fetched at most once per document (cached). The router SHALL NOT read a top-level
`pageNumber` field — the deployed API does not return one, so doing so silently defaults every
citation to page 1. On no match the citation SHALL ship geometry-less. Resolution MUST be
best-effort: a resolver error MUST NOT fail the chat turn.

#### Scenario: Geometry read directly off a result that carries it

- **GIVEN** a RAG reply whose search result carries `boundingBoxes`
  `(362,593)-(1601,2031)` with `pageNumber: 2` and a `pages` entry `{number:2, width:1700, height:2200}`
- **WHEN** the chat router assembles the reply
- **THEN** the citation carries `page: 2`
- **AND** `bbox` is approximately `{x:0.213, y:0.270, w:0.729, h:0.654}` (px ÷ page dims)
- **AND** no X-Ray fetch is needed for that citation.

#### Scenario: A result lacking geometry resolves via X-Ray, once per document

- **GIVEN** a reply with two citations from one document whose search results carry no `boundingBoxes`
- **WHEN** geometry is resolved for both
- **THEN** the document's X-Ray is fetched at most once (cached)
- **AND** each citation whose snippet matches an X-Ray chunk carries the chunk's normalized geometry.

#### Scenario: Unresolvable citation ships geometry-less without failing

- **GIVEN** a citation whose result has no `boundingBoxes` and matches no X-Ray chunk
- **WHEN** the chat router assembles the reply
- **THEN** the citation is returned with no `bbox`
- **AND** the chat turn still succeeds (no thrown error).
