# PdfViewer

**Slot:** `viewer-widgets` · **Status:** shipped (canonical)

The production PDF viewer used by every surface that needs to show a
GroundX document.

## What it does

Reads a `documentId`, calls `DocumentsContext.getDocumentXray` to fetch
the parsed-document payload (which includes `documentPages[]` with
pre-rasterized `pageUrl` images), and renders the active page +
thumbnail strip below.

Pages are pre-rasterized server-side by GroundX, so the widget renders
plain `<img>` tags rather than running pdf.js on the client. That means
no `<canvas>` painting, no worker bundle, no per-DPI scaling problems —
just images that scale to the viewer pane via `object-fit: contain`.

## Props

```ts
interface PdfViewerWidgetProps {
  /** GroundX document UUID. The widget fetches its xray on mount. */
  documentId: string;
  /** Locked-affordance gate (widget contract). */
  mode: "onboarding" | "steady";
  /** 1-indexed initial page. Defaults to 1. */
  initialPage?: number;
}
```

## Locked affordances under `mode="onboarding"`

Currently identical to `mode="steady"`. Future iterations will lock
annotation / highlight / save-citation controls behind `mode="steady"`.
The `data-mode` attribute on the widget root surfaces the value for
test introspection.

## Events

None today. Future: `onCitationClick(page, bbox)` for steady-mode
source-viewer integration.

## How to mount

```tsx
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";

<PdfViewerWidget documentId={scenario.documents[0].documentId} mode="onboarding" />
```

The host wraps the widget in a viewer pane Box (`height: 100%` + flex)
and lets the widget fill it. The widget surfaces loading + error
states inline — the host doesn't render a loading skeleton.

## Replaces

`shared/components/PdfViewer.tsx` (deleted 2026-05-26 in ARCH-02) — the
scaffold-provided pdf.js renderer that took a `previewUrl` prop and
painted to canvas. Was unused after the SCEN-06 real-API rewire.

## Tests

`PdfViewerWidget.test.tsx`. Covers: mount-fetches-xray, loading state,
filename via aria-label, page-thumbnail click switches pages, error
state, widget-contract data attributes.
