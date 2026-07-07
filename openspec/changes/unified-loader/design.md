# Design — unified-loader

## Two loading states, one component

The confusion today is that "loading" is treated as one thing rendered several ways. Split it
into two states with a clear owner:

- **Blocking load — content is absent.** The widget has nothing to show yet (X-Ray not
  fetched, Calendly iframe not initialized, extraction schema not resolved). This is a
  full-pane state and gets the **shared centered loading component**: centered on both axes,
  a larger animation, the message beneath it, message configurable per caller.
- **Progressive / ambient status — content is present.** Something is updating over content
  the user can already see (the F2 reading sweep over a rendered page; a Calendly embed
  progressing after the iframe mounts). This stays in the **frame status band** — the existing
  `ViewerWidgetFrame` `loading`/`status` slot — precisely so it never floats over loaded
  content. This preserves the existing app-architecture Calendly scenario verbatim.

The shared component lives at `components/primitives/` (a primitive: no data, no scope, pure
presentation) with a README + sibling test per the locked widget contract. It is the **breathing
mark** (concept E), rendered in **green** (brand primary — calm/positive, never reads as an
alert the way coral could). The exact form and motion are a design task, not fully pinned in
prose: the brief is a *visually compelling* green mark (pulse of scale + opacity as the baseline;
a richer treatment is welcome if it stays calm and flat per the brand), refined against the
running app with a live visual-evaluation loop (chrome-devtools MCP — measure + screenshot at
both sizes) rather than guessed from source. It takes a `message` (optional — chat omits it) and
a `size` (`sm | md | lg`, or an equivalent scale), and nothing else — configuration up in the
caller, not tokens crossed in. `prefers-reduced-motion` drops the animation to a static mark.

## One animation everywhere

This is the single loading animation for the whole app, not just the viewer. It replaces and
**retires `LoadingDots`** at all five current sites:

| Site | Today | After |
| --- | --- | --- |
| Chat "thinking" (`chatPrimitives.tsx`) | `LoadingDots` inside a `BotBubble` — but **already replaced** by a live-fed `ThinkingStream` in `analyze-and-chat-ux` §6.3 (step 3) | no shared mark here — `ThinkingStream` is the composing indicator; this change only removes any residual `LoadingDots` usage |
| Gate chat panel / rail | `LoadingDots` | shared mark, `size="sm"` (where not fed by `ThinkingStream`) |
| Viewer blocking-load (Extract, PdfViewer, …) | bespoke / silent | shared mark, `size="lg"`, centered, message |
| Frame status band (F2 scan, Calendly progress) | `LoadingDots` + text | shared mark, `size="sm"`, inline with text |

Size is chosen by the caller so the mark fills the space it lives in — large and centered in the
open viewer pane, small inline in a chat bubble or the status strip. The drift guard asserts
`LoadingDots` is gone and every loading/thinking surface resolves to this one primitive.

Interplay with `analyze-and-chat-ux`: that change (§6.3, step 3) replaces the bare "…"
`LoadingDots`-in-`BotBubble` block in `chatPrimitives.tsx` with a live-fed `ThinkingStream`. So by
the time this change runs, the chat thinking area is **already** the `ThinkingStream` — there is no
bare-dots block left to swap a mark into, and the shared breathing mark does NOT appear in the
thinking-stream area (the stream's own status/reasoning lines are the composing indicator; a mark
beside them would be a redundant second loading visual). This change's chat work is limited to
removing any residual `LoadingDots` usage. **Execution order: `analyze-and-chat-ux` lands first**
(it restructures the chat thinking area + edits `app-architecture`), then this change retires the
remaining `LoadingDots` sites and swaps the shared mark into the settled structure — avoids two
changes colliding on the same chat files and spec. See
[`docs/agents/cross-plan-execution-order.md`](../../../docs/agents/cross-plan-execution-order.md)
(this is step 4, after `adopt-tanstack-query` step 1 and `analyze-and-chat-ux` step 3).

## Loading is a boundary around any element, not a widget property

The cleanest model (and the one that resolves the earlier confusion): loading is not a property
of "a widget" declared on a descriptor. It is a **composable `<Loading>` boundary** you wrap
around any UI region. You pass that region's own loading condition; while it's true the boundary
renders the shared mark sized to fill that region, otherwise it renders the children:

```
<Loading loading={isLoading} message="Reading the extraction…">
  {content}
</Loading>
```

It nests at any granularity — the whole extraction viewer, the fields table inside it (which can
show the mark while values load even after the shell has rendered), a chat bubble, a report
section. Each region owns its own "am I loading?"; the boundary just renders the shared mark. This
is why there is **no descriptor field and no ScopedViewerWidget coupling** — an earlier draft tied
loading to the widget base, but that was ceremony: any element that loads simply composes the
boundary. Size is automatic (the mark fills the wrapped box — large in a pane, small inline),
with an optional explicit size for inline cases.

**Two layers, not a mode flag.** "In place of" vs "alongside content" is NOT a prop on one
component — it is which of two composable layers you use:

- `<BreathingMark size/>` — the pure animation (the one loading visual).
- `<Loading loading>{children}</Loading>` — a boundary that renders `<BreathingMark>` *in place of*
  its children while loading, else the children. Built from the mark.

**In place of** (viewer pane, fields table) → use the `<Loading>` boundary. While loading, the
mark stands where the element will be — it is NOT drawn inside the element's chrome — and is
*replaced by* the element when ready. (Chat is NOT one of these cases: `analyze-and-chat-ux` §6.3
already replaced the old `LoadingDots`-in-`BotBubble` thinking block with a `ThinkingStream`, which
owns the composing indicator — this change adds no mark there; see "One animation everywhere".)

**Alongside existing content** (the frame status band: mark + "Loading…" text over an
already-visible surface, progressive status) → drop the bare `<BreathingMark>` next to the text.
It is not replacing anything, so it does not use the boundary.

There is still exactly one loading animation (the mark); the boundary is a convenience for the
common replace case. The drift guard targets the mark, so both layers stay consistent.

**Anti-flash appearance delay.** The boundary takes an optional delay (~150ms default) before the
mark appears, so a region that resolves within the window never flashes it. A region that never
loads simply renders its content.

### Adversarial review: why NOT a `useScopedResource` base hook

A shared `useScopedResource(scope, loader) → {loading, error, data}` hook was considered as the
mechanism and **rejected**:

- *Already done?* No. Only `useScopeAdapter` exists (a scope-change *trigger*, no state). Load
  state is hand-rolled in exactly two widgets (`PdfViewerWidget`, `Extract`); `SmartReportRender`
  has its own richer lifecycle (`firstPaintState` + per-section streaming + re-render); `Integrate`
  loads nothing.
- *Composable across the set?* No — it models **1 of 4** widgets cleanly. PdfViewer loads one
  resource (X-Ray). Extract loads three sequentially (schema → values → geometry) via a 4-call
  dependent chain. SmartReport streams sections. A single `{loading,error,data}` shape only fits
  PdfViewer.
- *Verdict.* Forcing the hook is an unearned abstraction (violates "earn every axis / do no harm").
  The universal, composable contract is the **`<Loading>` boundary + drift guard**; each region
  keeps its own orchestration and just wraps its content.

### The frame body flex bug

`ViewerWidgetFrame`'s body is `display:flex` with no `flexDirection`, so it defaults to `row`.
For `edge-to-edge`/`embed` modes (`alignItems:stretch`) a single child is stretched to full
height, and a child that centers its own content then floats mid-pane. Set the body to
`flexDirection: column` (the widgets already assume a column: Extract/PdfViewer set
`flexDirection: column; height: 100%`). This is the direct cause of issue (1); the shared
component adoption is the consistency fix (2).

## Test strategy (TDD)

- Frame: a widget in `edge-to-edge`/`embed` mode renders its content from the top of a column,
  not stretched/centered mid-pane (regression for issue 1).
- Shared loader: renders the configured message; centered; size-adaptive; reduced-motion static;
  one component reused by all surfaces (widget-contract + no-hardcoded-styles green).
- Anti-flash: a load resolving within the delay window never shows the mark.
- Drift guard: `LoadingDots` deleted; every enumerated loading/thinking surface renders the shared
  primitive.
- Visual: chrome-devtools MCP pass on the running app — measure + screenshot the green mark at both
  sizes, light + dark.
