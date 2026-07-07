# Loading / BreathingMark

**Slot:** `primitives` · **Status:** unified-loader (2026-07-07)

The ONE app-wide loading treatment (retires `LoadingDots`). Two composable
layers — two placements, two components, no mode flag:

- **`<BreathingMark size aria-label>`** — the pure visual: a calm, flat GREEN
  mark (brand primary — loading is a positive state, never alert-coral) whose
  core disc breathes (scale + opacity) inside a soft out-of-phase ring.
  `prefers-reduced-motion: reduce` → static mark. Use it BARE only when it
  accompanies already-visible content (e.g. the `ViewerWidgetFrame` status
  band, inline next to text).
- **`<Loading loading size message delay>{children}</Loading>`** — the
  boundary: renders the mark (centered, optional muted `message`) **in place
  of** its children while `loading`, else the children. Anti-flash: the mark
  only appears after `delay` ms (default 150) of continuous loading, so a
  fast region never flickers it.

Sizes: `sm` (chat/inline, 10px core) · `md` (panels, 18px) · `lg` (viewer
panes, 28px).

## Where it's used

- `PdfViewerWidget` — page area while the X-Ray/query is pending (`lg`).
- `Extract` — the workbench body while the live read resolves (`lg`).
- `SmartReportRender` — first-paint (`lg`).
- Gate chat panel/rail (`sm`, where not fed by `ThinkingStream`).
- `ViewerWidgetFrame` status band — bare `<BreathingMark size="sm">` beside
  the status text (alongside-content placement).

The chat thinking indicator is NOT this mark — `ThinkingStream` (live status/
reasoning lines, analyze-and-chat-ux §6) is the composing indicator there.

## LLM tools

None (`no-tool`) — a display primitive; it exposes no chat-invocable surface.

## Tests

`Loading.test.tsx` — mark renders at size with status role + reduced-motion
fallback; boundary renders children when idle, mark+message when loading;
anti-flash delay (resolves-within-window never shows the mark; past the
window shows it).
