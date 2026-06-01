# Steady-shell canvas mounts the production viewer widgets (ScopedCanvas wiring)

## Why

The live e2e audit (`2026-05-31-e2e-experience-audit`, DL-5, P1) found that the
authenticated **steady** experience can never display a viewer widget. The steady
shell renders, the live LLM chat works (real grounded answers + citation chips at
the workspace/bucket scope), but the canvas is a **stub**: clicking a citation chip
(which dispatches `highlightCitation` to the `CanvasOrchestrator`), the "Show source"
suggested action, or a pick-view pill all leave `scoped-shell-canvas-pane` with **zero
children** — no `PdfViewer`, `Extract`, `SmartReport`, or `Integrate` ever mounts.

Root cause (code-confirmed): `app/src/views/Scoped/ScopedConversationShell.tsx`
hardcodes its `canvasPane` as an empty `<Box data-testid="scoped-shell-canvas-pane" />`.
It does **not** render `<ScopedCanvas>` — the component whose own docstring declares it
"the SOLE viewer-widget mount path in **both** shells" and which `OnboardingShell` mounts
(OnboardingShell.tsx:524). The steady shell was left with the stub; nothing the
orchestrator pushes is ever read.

This breaks:
- **`ui-views`** — the existing requirement that a citation chip click "still routes to
  the viewer" (steady branch) and steady-mode canvas rendering.
- **`feedback_no_onboarding_duplicates`** — the authed experience MUST use the SAME
  production widgets (PdfViewer · Extract · SmartReport · Integrate), mounted via the
  shared `ScopedCanvas` path, not a fork or a stub.

Unit tests passed because `ScopedCanvas` and the orchestrator's `highlightCitation`
handler are each tested in isolation; the gap is purely the steady shell never WIRING
`ScopedCanvas` into its canvas slot — an integration seam only a shell-level test catches.

## What Changes

- `ScopedConversationShell` renders `<ScopedCanvas>` in its canvas slot, fed by the
  active `ViewerStep` (from `ChatStore`/`CanvasOrchestrator`) + the shell's `scope` +
  `role`, mirroring `OnboardingShell`'s step→scope→role wiring, including the idle/empty
  state ScopedCanvas already provides (replacing the literal empty `<Box>`).
- A **failing-first** shell-level integration test asserting that, in the steady shell,
  a citation-chip dispatch (or a `highlightCitation` orchestrator push) mounts
  `pdf-viewer-widget` inside `scoped-shell-canvas-pane` — i.e. the canvas is no longer a
  stub.
- No new widget, no fork: this is wiring the existing shared mount path into the steady
  shell. (Earns no new axis — it removes a divergence.)

## Impact

- Affected specs: `ui-views` (steady-shell canvas mount).
- Affected code: `app/src/views/Scoped/ScopedConversationShell.tsx` (+ its test).
- Unblocks audit surfaces 2.4 (chat citation→source mount, steady), 2.10 (chat-path
  citation round-trip), and 2.12 (steady-mode widget parity). NOTE: the steady chat
  itself already works; the doc-scope onboarding RAG zero-result issue is a SEPARATE
  ticket (`2026-06-01-rag-retrieval-correctness`, DL-1).
