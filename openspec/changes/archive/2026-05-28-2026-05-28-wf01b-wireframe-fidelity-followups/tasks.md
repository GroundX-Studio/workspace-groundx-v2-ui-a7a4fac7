# Tasks — WF-01b wireframe fidelity follow-ups

## A. F1 "↳ Sign up triggers F1→F2 transition" coral pill

- [ ] **Failing test:** `IngestView.test.tsx` — the BYO row renders a
      coral pill with the verbatim copy `↳ Sign up triggers F1→F2
      transition + loads F6 gate inline in chat`.
- [ ] Add the pill below the existing BYO label in `IngestView.tsx`.
      Coral eyebrow style (CORAL background, WHITE text or
      transparent w/ coral border).

## B. F5 InteractView canvas litRegions

- [ ] **Failing test:** `InteractView.test.tsx` — when the latest
      assistant turn has N citations, the canvas mounts a
      `PdfViewerWidget` with N entries in `litRegions[]`, each
      color-keyed (`[1]`→green, `[2-3]`→cyan, last→coral).
- [ ] Compute `litRegions` from the latest assistant turn's
      `citations[]`. Each citation maps to `{page, x, y, w, h,
      color}`; bbox comes from `citation.bbox` when present, else a
      sensible default position (e.g. centered banner at the top of
      the page).
- [ ] Replace the inline chat duplication in InteractView's canvas
      with the PDF viewer + litRegions. (The chat itself stays in
      the chat pane via ChatColumn.)

## C. F4 PDF region-highlight on field select

- [ ] **Failing test:** `ExtractView.test.tsx` — clicking
      `field-row-amount_due` causes the left-pane PdfViewerWidget to
      render with `targetPage={1}` and `highlightBbox` matching the
      field's first citation bbox.
- [ ] In `ExtractView.tsx`, derive `targetPage` + `highlightBbox`
      from `selectedField`'s first citation; pass to
      `PdfViewerWidget` props.
- [ ] When `selectedField` is null, pass `targetPage={undefined}` +
      `highlightBbox={null}` so the viewer falls back to its
      uncontrolled default.

## Closure

- [ ] All app + middleware tests green.
- [ ] Drift guards green (`widget-contract.test.ts`,
      `no-hardcoded-styles.test.ts`).
- [ ] OpenSpec `validate --all --strict` passes.
- [ ] Browser smoke: click sample → wait for F3 → click a field row
      → confirm left-pane viewer highlights the source region.
- [ ] Archive the change.
