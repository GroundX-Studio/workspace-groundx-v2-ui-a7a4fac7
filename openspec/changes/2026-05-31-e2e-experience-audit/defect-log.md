# E2E audit — defect log (live-data run, 2026-06-01)

Audited the post-`retire-mock-mode` build against REAL GroundX (no MOCK_MODE). One row per finding:
`id · surface · measured actual · expected · severity · status`.

## Defects

### DL-1 · Interact / live chat RAG · P1 · OPEN
- **Measured:** asked "What is the total amount due on this bill?" in onboarding chat (scope =
  bucket 28454 / utility, doc c3bfff49). Live RAG returned **0 citation chips** and the answer:
  *"I can't determine the total amount due because no snippets were found for this bill. If you open
  or re-run extraction on utility-bill-april-2026.pdf, I can read the amount due from the bill text."*
  No client console error — the server RAG search returned no usable snippets.
- **Expected:** the demo sample's chat SHOULD answer "amount due" with a grounded citation (the
  WF-05b/WF-06 work targets exactly this line on this doc).
- **Likely cause (needs focused investigation, not assumed):** the utility sample is
  **extract-workflow-indexed**, so its searchable text is the extraction JSON and scores below
  GroundX's default relevance floor (see `project_groundx_search_geometry`). The chatRouter's
  zero-result low-floor retry (`RAG_FALLBACK_RELEVANCE`) is supposed to surface the JSON chunks — it
  either isn't firing, returns nothing usable, or the scope filter isn't matching. **Pre-existing**
  (the RAG path was always live; MOCK_MODE's canned chat answer was hiding it) — surfaced now that
  chat is always live. NOT attributable to the groundedAnswerOverScope migration (that's
  generation/verify; this is a search-results-empty issue upstream of it).
- **Fix candidates (decide in a focused change):** confirm/repair the low-floor retry actually
  surfaces the extract-JSON chunks for this doc; or route "amount due"-style questions through the
  extracted-field data (Extract already has `amount`/`balance_payable` values) rather than raw RAG
  search; or re-ingest the sample as plain-layout so search carries prose. → ticket as its own change.

### DL-2 · global · P3 · OPEN
- **Measured:** React Router **v7 future-flag warning** logged ~24× to the console
  (`v7_startTransition`). Harmless but noisy; pollutes the console sweep.
- **Expected:** clean console.
- **Fix:** set the `v7_startTransition` (+ related) future flags on the Router, or suppress. Trivial. → ticket.

## Passes (live, measured — no defect)
- **F1 Ingest:** sample + BYO tiles render; parsed-doc fetch 200 real data; pick → `/onboarding/28454/utility`.
- **F2 Understand/PDF:** page renders **958×1240** (24px-collapse cleared), 3 page thumbnails, no error.
- **F3 Extract:** workbench renders 3 category tabs (Statement·14 / Meters·16 / Charges·6) with real field
  rows + real values (e.g. addressee = "KWIK TRIP (1147)") + topbar export/rerun/save.
- **Report (no-template):** graceful `smart-report-empty` ("No report for this scope yet. Pin an answer or
  open the builder…") — not an error/fixture.

## Still to drive (live)
2.3 extract field add/edit/JSON-toggle + provenance-highlight-on-click · 2.5 report render WITH a template
+ section accept/reject + builder · 2.6 Integrate · 2.7 sign-up gate · 2.9 gates · 2.10 citation
round-trip click→viewer highlight · 2.11 auth (password toggle, claim/flip) · 2.12 steady-mode parity ·
2.13 debug reset · 2.14 responsive/mobile · 2.15 reduced-motion · 2.16 full console/network sweep.
