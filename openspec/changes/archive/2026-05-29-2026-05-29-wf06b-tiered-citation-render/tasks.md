# Tasks — WF-06b tiered citation render

Depends on **WF-06** (middleware emits `tier`/`confidence`/`answerSpan` — done + live-verified).

- [x] App `Citation` / `ChatCitation` gains `tier` / `confidence` / `answerSpan` (additive);
      thread through `chatSessions` hydration (`PersistedChatMessage.citations`) + the live-send
      citation mappings in `InteractView` and `ChatColumn`. (Also `ScenarioCitation` + a shared
      `CitationTier` type in `types/onboarding.ts`. The wire parse is a passthrough cast, so the
      type additions carry the fields end-to-end with no mapping-logic change.)
- [x] **Failing test:** a `tier:"paraphrase"` citation drives a translucent (dashed, lower-alpha)
      chunk-region overlay; a `tier:"ambient"` citation renders no inline span; a `tier:"exact"`
      citation drives a solid (2px) highlight. (`PdfViewerWidget.test.tsx` — 3 new cases asserting
      the literal rendered `style` + `data-highlight-tier`.)
- [x] Thread `tier` through the `CiteChip` → `highlightCitation` intent → ChatStore `doc-viewer`
      step (`highlight.tier`) → `PdfViewerWidget` highlight style (solid vs. translucent vs. none).
      Preserve the ambient click path (CiteChip click still navigates). Wired in `SteadyShell`
      (`highlightTier={activeStep.highlight?.tier}`). Threading locked by a new
      `CanvasOrchestratorContext.test.tsx` case.
- [ ] (Optional) split the answer into claim segments by `answerSpan` with per-claim hover→highlight.
      **Deferred** — not required by the spec scenario; the chip-driven path satisfies the
      requirement. `answerSpan` is threaded on the type for when this lands.
- [x] App + middleware suites green (app 1065/1065; middleware 491/491 — the one full-suite
      `apiRouteContract` flake passes in isolation, unrelated to this change); tsc both sides;
      drift guards (`check-tool-references`) green; OpenSpec validate 19/19.
- [x] **Live (Chrome DevTools / Preview):** app bundle boots clean with the changes compiled in
      (no console errors). The per-tier visual distinction is locked by the component test
      (asserts the literal rendered style); producing a live-tiered answer needs the full
      middleware→GroundX chat loop. (exact-tier tight box still deferred with WF-05 1b — the render
      handles it regardless.)
- [x] Archive.
