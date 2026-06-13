# PdfViewer

**Slot:** `viewer-widgets` · **Status:** shipped (canonical)

The production PDF viewer used by every surface that needs to show a
GroundX document.

## Viewer chrome

Policy: `edge-to-edge inside ViewerWidgetFrame`

Content mode: `edge-to-edge`

`ScopedCanvas` wraps PdfViewer in `ViewerWidgetFrame` with minimal
edge-to-edge chrome so document imagery keeps the full viewer area. The
widget owns document-local controls such as thumbnails, zoom, page state,
scan animation, and citation highlights.

## What it does

Reads a `scope: ContentScope`, resolves the target document from it
(single-doc → `documentIds[0]`), calls `DocumentsContext.getDocumentXray`
to fetch the parsed-document payload (which includes `documentPages[]`
with pre-rasterized `pageUrl` images), and renders the active page +
thumbnail strip below.

Pages are pre-rasterized server-side by GroundX, so the widget renders
plain `<img>` tags rather than running pdf.js on the client. That means
no `<canvas>` painting, no worker bundle, no per-DPI scaling problems —
just images that scale to the viewer pane via `object-fit: contain`.

## Props

```ts
interface PdfViewerWidgetProps {
  /**
   * The document set to view (ScopedViewerWidget contract). Single-doc —
   * the only shape rendered today — is
   * `{ type: "documents", documentIds: [id] }`; the widget fetches the
   * xray for `documentIds[0]` on mount. `bucket`/`group` scopes resolve
   * to no document and hold the neutral loading state.
   */
  scope: ContentScope;
  /**
   * Widget-contract authorization role (`anonymous` / `member`). Gates
   * editable affordances — none today; the viewer is read-only for both
   * roles. Surfaced via `data-role` on the root.
   */
  role: WidgetRole;
  /** 1-indexed initial page. Defaults to 1 (uncontrolled). */
  initialPage?: number;
  /**
   * Controlled page targeting. When set, the widget navigates to this
   * page on mount AND whenever the prop changes (overrides
   * `initialPage`). Thumb clicks still update internal state — a
   * subsequent `targetPage` change re-overrides. Set to `null` /
   * `undefined` for the uncontrolled default. Wired by shells that
   * read the active `doc-viewer` ViewerStep (citation-jump flow).
   */
  targetPage?: number | null;
  /**
   * Region highlight overlay. Coordinates are 0–1 page-relative
   * (top-left origin). Renders as an absolutely-positioned tinted
   * box atop the active page image. Set to `null` / `undefined` to
   * hide. Wired by shells from `ViewerStep.highlight.bbox` so a
   * `CiteChip` click surfaces the cited region.
   */
  highlightBbox?: { x: number; y: number; w: number; h: number } | null;
}
```

## Scope

PdfViewer is a **ScopedViewerWidget** (per the 2026-05-30 widget access
matrix, `docs/agents/widget-access-matrix.md` §1b): it takes a real
`scope: ContentScope`, NOT a raw `documentId`. The only scope shape it
renders today is the single-doc
`{ type: "documents", documentIds: [id] }`; `bucket`/`group` scopes
resolve to no document and hold the neutral loading state (a multi-doc
picker is future work). The active scope is sourced from the experience
scope / `ScopedCanvas` at the mount site.

## Locked affordances (read-only roles)

Available to BOTH `anonymous` + `member` with **no role-gated affordance
today** — the viewer is read-only for either role. The `role` prop
satisfies the widget contract and is forward-looking: future iterations
may lock annotation / highlight / save-citation controls behind a
mutating role (`widgetRoleCanEdit`). The `data-role` attribute on the
widget root surfaces the value for test introspection.

## Events

None today. The viewer is read-only — citation-jump flows in via
`targetPage` + `highlightBbox` props, sourced from the active
`doc-viewer` ViewerStep on the chat session.

## How to mount

```tsx
import { ScopedCanvas } from "@/components/layout/ScopedCanvas/ScopedCanvas";

const documentId = scenario.documents[0].documentId;

// Default document viewer.
<ScopedCanvas
  scope={{ type: "documents", documentIds: [documentId] }}
  step={{ kind: "doc-viewer", documentId }}
  role={role}
/>

// Controlled by a doc-viewer ViewerStep (citation-jump flow).
<ScopedCanvas
  scope={{ type: "documents", documentIds: [step.documentId] }}
  step={step}
  role={role}
/>
```

`ScopedCanvas` resolves the PDF viewer, wraps it in `ViewerWidgetFrame`, and
passes the active document scope plus any citation jump data. Direct widget
imports are reserved for unit tests or implementation-local composition.

## Replaces

`shared/components/PdfViewer.tsx` (deleted 2026-05-26 in ARCH-02) — the
scaffold-provided pdf.js renderer that took a `previewUrl` prop and
painted to canvas. Was unused after the SCEN-06 real-API rewire.

## LLM tools

`PdfViewerWidget.tools.ts` exposes two read-category tools (both
available to all roles; scoped to the
`doc-viewer` / `interact-chat` / `extract-workbench` ViewerSteps):

- `open_document(documentId, page?)` — produces a `highlightCitation`
  intent at the requested page (defaults to page 1). Use when the
  user references a document by name or you're about to cite one.
- `jump_to_page(documentId, page)` — produces a `jumpToPage` intent
  for the active viewer (no bbox highlight). Use when the user
  references a page number directly.

Round-trip: LLM emits a tool call → middleware validates
the Zod input + runs the `SERVER_TOOL_CATALOG` intentBuilder → resulting
`CanvasIntent` ships on `ChatReply.intents[]` → frontend orchestrator's built-in handler
routes to `ChatStore.gotoDocViewer` → viewer pane re-mounts with the
new page (and bbox, when present).

`jump_to_page`'s `jumpToPage` intent is a lighter-weight cousin of
`highlightCitation`, introduced in Phase 4 alongside this file. Both
land on the same `gotoDocViewer` sink; `jumpToPage` omits the bbox.

## Tests

`PdfViewerWidget.test.tsx`. Covers: mount-fetches-xray, loading state,
filename via aria-label, page-thumbnail click switches pages, error
state, widget-contract data attributes, controlled `targetPage` mount
+ re-render jumps, `highlightBbox` overlay positioning, thumb clicks
still work after a controlled-page mount.

`PdfViewerWidget.tools.test.ts`. Covers: tool catalog completeness
(both tools present), Zod schema accept/reject for valid + invalid
input, app/server metadata parity, plus the
Phase-5b quality-rule preconditions (every Zod field carries
`.describe()`; every description has a `Use when` clause and meets
the 40-char floor).
