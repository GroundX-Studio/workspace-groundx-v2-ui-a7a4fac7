# Tasks — WF-06b tiered citation render

Depends on **WF-06** (middleware emits `tier`/`confidence`/`answerSpan` — done + live-verified).

- [ ] App `Citation` / `ChatCitation` gains `tier` / `confidence` / `answerSpan` (additive);
      thread through `chatSessions` hydration (`PersistedChatMessage.citations`) + the live-send
      citation mappings in `InteractView` and `ChatColumn`.
- [ ] **Failing test:** a `tier:"paraphrase"` citation drives a translucent chunk-region overlay;
      a `tier:"ambient"` citation renders a chip only (no auto inline span); a `tier:"exact"`
      citation drives a solid (word-level) highlight.
- [ ] Thread `tier` through the `CiteChip` → `highlightCitation` intent → ChatStore `doc-viewer`
      step → `PdfViewerWidget` highlight style (solid vs. translucent). Preserve the ambient click
      path (CiteChip click still highlights).
- [ ] (Optional) split the answer into claim segments by `answerSpan` with per-claim hover→highlight.
- [ ] App + middleware suites green; tsc; drift guards; OpenSpec validate.
- [ ] **Live (Chrome DevTools):** a verified claim lights the chunk region (paraphrase) in the
      translucent style; an ambient answer shows source chips with no inline span. (exact-tier tight
      box deferred with WF-05 1b.)
- [ ] Archive.
