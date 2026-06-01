# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: Citation geometry SHALL resolve to word-level atom boxes when available

The citation geometry pipeline SHALL resolve a cited verbatim span to a **word-level `bbox`** using
the document's `-118-map.json` word atoms, falling back to the X-Ray chunk box and then to none. The
resolved tight box SHALL populate `Citation.bbox`, so the WF-06b `exact` tier lights a word-level
highlight. Resolution SHALL be verbatim-only (no paraphrase inference).

#### Scenario: A verbatim citation gets a tight box

- **GIVEN** an answer citing a verbatim span present in the document
- **WHEN** citation geometry resolves
- **THEN** `Citation.bbox` is the word-level union from `-118-map` (tighter than the chunk box)
- **AND** when the word map is unavailable it falls back to the X-Ray chunk box, then to no box.
