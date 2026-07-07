## ADDED Requirements

### Requirement: Analyze sub-pill toggles over one document SHALL NOT refetch or fail

Toggling the Analyze sub-pills (Interact ↔ Extract) over an unchanged document that LOADED SUCCESSFULLY SHALL read from the TanStack Query cache and SHALL NOT re-fetch that document's
data, SHALL NOT flash a loader on the second and later mounts, and SHALL NOT surface a "could not
load document" state produced by a needless refetch. The widgets MAY remain distinct components
that unmount and remount across the toggle; because every read (X-Ray, extract, workflow,
field-geometry) is keyed in the query cache, the remount is a cache hit for BOTH the PDF tab and
the Extract tab. This SHALL hold whether the toggle is issued directly or from behind a blocking
viewer overlay (the book-call / sign-in overlay), where the base canvas is mounted-but-inert. A
read whose FIRST load FAILED is NOT cached (TanStack Query caches data, not errors) and SHALL
re-run on the next mount — a genuine retry of a broken load, not a regression of the no-refetch
guarantee.

#### Scenario: Interact → Extract → Interact issues one fetch per key

- **GIVEN** an active document rendered in the Interact (doc-viewer) surface
- **WHEN** the user toggles to Extract and back to Interact
- **THEN** each read key is fetched at most once and the remounts are cache hits
- **AND** neither tab shows the COULD-NOT-LOAD state on the second mount.

#### Scenario: The Extract tab also stops reloading

- **GIVEN** the Extract tab, whose data includes the workflow and field-geometry reads
- **WHEN** the user returns to it after toggling away
- **THEN** its schema, values, and geometry come from the query cache with no refetch
- **AND** no loader flashes on the return.

#### Scenario: A first load that FAILED retries on toggle, it does not serve a stale error

- **GIVEN** a document whose first live read FAILED (the query is in an error state — `staleTime`
  caches successful data, NOT errors)
- **WHEN** the user toggles away and back, remounting the reader for the same key
- **THEN** the failed query re-runs the fetch on remount (a genuine retry of a broken load, the
  desired self-heal — this is distinct from the no-refetch guarantee, which covers SUCCEEDED reads)
- **AND** the reader shows its loading state during the retry, then the resolved data or the
  COULD-NOT-LOAD state per the outcome — never a cached error masquerading as fresh data.

#### Scenario: Toggling behind the calendly overlay does not break the underlay

- **GIVEN** the book-call overlay is open over an active document
- **WHEN** the user clicks an Analyze sub-pill behind the overlay and later closes it
- **THEN** the revealed viewer renders its content from the query cache
- **AND** no COULD-NOT-LOAD state is shown from a refetch triggered while the canvas was inert.
