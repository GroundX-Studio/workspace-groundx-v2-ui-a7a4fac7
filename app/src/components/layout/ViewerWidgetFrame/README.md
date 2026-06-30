# ViewerWidgetFrame

## What It Does

`ViewerWidgetFrame` is the host-owned shell for content in the viewer pane. It
owns top-level viewer chrome: close/back action, header metadata, loading/status
band, body padding mode, active/inert state, and stable test attributes.

Viewer widgets render product content inside the frame body. They should not own
top-level close/back/header chrome unless their README declares a tested
`hostless-exception`.

## Props

- `widgetId: string` - stable widget identity for `data-viewer-widget-id`.
- `active?: boolean` - foreground frame state. Inactive frames are hidden from
  assistive tech and do not expose close/back actions.
- `chromePolicy: ViewerChromePolicy` - `framed`, `edge-to-edge`, or
  `hostless-exception`.
- `contentMode: ViewerContentMode` - `centered-panel`, `padded-scroll`,
  `edge-to-edge`, or `embed`.
- `title: string`, `eyebrow?: string`, `subtitle?: string` - frame-owned header
  metadata.
- `closeAction?: ViewerFrameAction` - host navigation action rendered as the
  stable `viewer-frame-close` handle.
- `loading?: { label: string } | null`, `status?: ReactNode` - frame status
  band above the body.
- `children: ReactNode` - viewer widget content.

## Scope

The frame is layout chrome, not a document-scoped widget. Production widget scope
still flows through `ScopedCanvas` into the content widget.

## Locked Affordances

The frame does not apply role locks. Availability and role-specific content
locks stay at the mount site or inside the content widget contract.

## Events

Frame actions call the callbacks supplied in their action descriptors. The frame
does not mutate chat, viewer history, auth, or routing state itself.

## How To Mount

```tsx
<ViewerWidgetFrame
  widgetId="pdf-viewer"
  active
  chromePolicy="edge-to-edge"
  contentMode="edge-to-edge"
  title="Document viewer"
>
  <PdfViewerWidget scope={scope} role={role} />
</ViewerWidgetFrame>
```

## LLM Tools

No LLM tools. This is host chrome; the content widget owns any tool surface.
