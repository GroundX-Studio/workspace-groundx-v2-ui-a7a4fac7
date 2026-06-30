# Spec Delta — ui-views

## ADDED Requirements

### Requirement: Extract-field source highlight SHALL resolve geometry from X-Ray

The middleware extract path SHALL resolve each field's source geometry from the document's
X-Ray before serving it to F3/F4, because `document_getextract` returns field values only and
carries no page or bounding box. For each field the resolver SHALL normalize the value (strip
currency, commas, and formatting), match it against the X-Ray `chunks[].text` /
`suggestedText` using the field label as a secondary signal, lift the matched chunk's
`boundingBoxes`, and normalize them by the page's `width`/`height` into a 0-1 `{x,y,w,h}` bbox
plus the page number. The enriched field SHALL carry `citations: [{ documentId, page, bbox }]`;
when no chunk matches, the field SHALL ship with empty citations and the F4 source highlight
degrades to none. Resolution MUST be best-effort and reuse the per-document X-Ray cache from
WF-03; a resolver error MUST NOT fail the extract response. An OPTIONAL word-level precision
pass MAY first match the value against atoms in the `-118-map.json` OCR map for a tighter box,
but it MUST fall back to the chunk-envelope on any miss or schema change (the MAP is an
unsupported intermediate; X-Ray is the production-stable source).

#### Scenario: Field value resolves to a source region

- **GIVEN** an extracted field `amount_due = 7613.2` and an X-Ray chunk containing `"$7,613.20"`
  whose box is `(170,220)-(1530,300)` on a 1700×2200 page
- **WHEN** the extract path serves the field to F4
- **THEN** the field carries `citations: [{ documentId, page: <chunk page>, bbox: {...0-1...} }]`
- **AND** clicking the field card highlights that region on the PDF.

#### Scenario: Unmatched field ships without geometry

- **GIVEN** an extracted field whose normalized value matches no X-Ray chunk
- **WHEN** the extract path serves the field
- **THEN** the field carries empty `citations`
- **AND** the extract response still succeeds (no thrown error)
- **AND** the F4 source highlight is absent for that field.
