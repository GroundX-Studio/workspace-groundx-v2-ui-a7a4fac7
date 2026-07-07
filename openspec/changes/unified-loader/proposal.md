## Why

Live review of the onboarding Analyze surfaces (2026-07-06) found two loading defects, both
rooted in structure rather than styling (the third defect — refetch churn on tab-switch — is a
data-layer concern owned by the sibling change `adopt-tanstack-query`):

1. **The Extract loader floats at the vertical middle of the canvas.** "Reading the
   extraction…" renders as frame **children** ([Extract.tsx:645]) in an `edge-to-edge` frame
   body that is `display:flex` with the **default `row` direction** + `alignItems:stretch`
   ([ViewerWidgetFrame.tsx:276]). The loader box therefore stretches to full height and its
   own `alignItems:center` parks the dots mid-pane. Nobody chose that position — it is a
   stretched-row side effect, and it "looks really weird."
2. **Loading is inconsistent across surfaces — several different treatments.** Extract shows big
   centered body dots; `PdfViewerWidget` shows a **silent empty box** with no text
   ([PdfViewerWidget.tsx:719]); the frame status band shows a thin strip (BookCall / F2 scan);
   the chat "thinking" bubble shows coral dots ([chatPrimitives.tsx:294]). Calendly's own spinner
   is suppressed (`.calendly-spinner{display:none}`, [BookCallView.tsx:307]), so its body is
   blank white with only a faint strip — reads as "no loading at all."

## What Changes

**One loading animation, app-wide.** There is a single loading animation everywhere the app
shows a loading/thinking state — the **"breathing mark"** (a green rounded mark that pulses
scale + opacity). It is a shared **primitive** under `components/primitives/`, centered on both
axes with the message **beneath** it, and it is **size-adaptive**: large in the viewer (centered
in the open pane), small inline in chat and in the frame status band — sized to fit the space it
lives in. It replaces every current loading treatment and **retires `LoadingDots`** (the coral
dots): the chat "thinking"/composing indicator ([chatPrimitives.tsx:294], the two gate-chat
panels), the viewer blocking states, and the frame status-band dots all render this one
component.

**Loading is a composable boundary around any UI element — not a widget property.** The primitive
is a `<Loading>` boundary: wrap any region's content in it, pass that region's own `loading` flag,
and it shows the green mark (sized to fill that region) until the content is ready, then renders
the children. It nests at any granularity — the whole extraction viewer, a table inside it, a
chat bubble, a report section — because each region owns its own loading condition. There is NO
widget-descriptor field and NO ScopedViewerWidget coupling: any element that loads composes the
boundary. (We also do NOT add a shared load-state hook (`useScopedResource`) — an adversarial
review found it fits only 1 of the 4 widgets cleanly; see design.md.) `prefers-reduced-motion`
drops it to a static mark; an optional ~150ms appearance delay means instant loads never flash it;
a region that never loads simply renders its content.

`scope:none` overlay widgets (`BookCallView`, `SignUpWidget`) and the chat surfaces use the same
boundary. A drift guard asserts no surface renders a bespoke loader (and `LoadingDots` is gone),
so the animation stays universal. The frame **status band** still exists for *progressive/ambient*
status over already-rendered content (the F2 reading sweep; a Calendly embed progressing over a
partial surface), but renders the shared mark (small) rather than bespoke dots. The ad-hoc loader
treatments are deleted, and the `ViewerWidgetFrame` body's default flex direction is fixed so a
widget's content is never accidentally stretched mid-pane.

In scope: the shared `<Loading>` boundary; its adoption across viewer widgets, overlay widgets,
the chat surfaces, and the frame status band; retiring `LoadingDots`; the frame body
flex-direction fix. Out of scope: server-state caching (sibling change `adopt-tanstack-query`, which
feeds each region's `isPending` into the `<Loading>` boundary);
changing any widget's data-loading logic (each region keeps deciding its own loading condition).

## Capabilities

### Modified Capabilities

- `ui-views`: the viewer's blocking-load state SHALL be the single shared "breathing mark"
  loading component (large, centered) across `PdfViewerWidget` / Extract / `BookCallView` (no
  floating mid-pane loader, no silent blank body).
- `conversation-flow`: the chat "thinking"/composing indicator SHALL render the single shared
  loading component (small), not a bespoke dots primitive; `LoadingDots` SHALL be retired.
- `app-architecture`: the app SHALL have exactly one loading animation (the green "breathing
  mark") exposed as a composable `<Loading>` boundary usable around any UI element at any
  granularity; each region owns its own loading condition, the mark fills the region it wraps
  (large in a pane, small inline), it is not tied to any widget descriptor, and no surface renders
  a bespoke loader (drift guard); the `ViewerWidgetFrame` body SHALL lay its child in a column so
  content is not stretched mid-pane.

## Impact

- **App**: a new shared `<Loading>` **boundary** under `components/primitives/` — the green
  breathing mark, `loading` + optional `size`/`message`/`delay` props, fills its container, static
  under reduced-motion (README + sibling test per the widget contract); wrap the loading region in
  `PdfViewerWidget.tsx` (drop the silent box), `Extract.tsx` (drop the body loader — and the fields
  table can wrap independently), `SmartReportRender`, `BookCallView.tsx`, `SignUpWidget.tsx`, the
  chat surfaces (`conversation/chatPrimitives.tsx`, `GateChatPanel.tsx`, `GateChatRail.tsx`), and
  the `ViewerWidgetFrame` status band; `ViewerWidgetFrame.tsx` body `flexDirection` fix; **delete
  `components/primitives/LoadingDots/`**. No `ScopedViewerWidgetDescriptor` change.
- **Contracts / guards**: widget-contract + no-hardcoded-styles guards for the new primitive; a
  **new drift guard** asserting every loading/thinking surface (viewer, chat, status band)
  renders the shared primitive and that `LoadingDots` no longer exists; a test that the frame
  body no longer stretches the loader mid-pane.
