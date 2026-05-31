# Integrate

**Slot:** `viewer-widgets` · **Frame:** `f7` · **Status:** Phase 3b
(2026-05-30-onboarding-shell-shared-view)

## What it does

The production **Integrate** surface — the "ship it" connectors view packaged
as a **ScopedViewerWidget** (PdfViewer · Extract · SmartReport · Integrate). It
renders three columns:

- API snippets (cURL / Python / TypeScript) — switchable tabs.
- Agent integrations (Claude / OpenAI / Gemini / Cursor) — connector/plugin
  cards, each with a DOWNLOAD button that is intentionally
  **disabled-future (UI-02)**.
- A next-steps card (Manage API keys / Read the docs / Connect to your
  workflow).

This is the SAME widget the authenticated experience uses (per
`feedback_no_onboarding_duplicates`); `views/Onboarding/IntegrateView.tsx` is
now a thin wrapper that mounts it. The connector/plugin cards + API snippets +
next-steps guts were lifted verbatim from `IntegrateView` — NOT reimplemented.

## Props

```ts
interface IntegrateProps {
  /** REQUIRED content scope (ScopedViewerWidget). The connectors list is
      scope-independent today (the same four cards render for any scope), but
      the contract requires it and the show_integrate tool threads the
      transition-surface scope through. */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member); surfaced via data-role.
      The surface is available to both roles. */
  role: WidgetRole;
}
```

Both `role` and `scope` are REQUIRED by the widget contract. No raw
`documentId` / `bucketId` / `projectId` prop — they collapse into `scope`.

## Scope

`scope: ContentScope` is accepted for contract conformance. The connectors list
is scope-independent today — the four agent-plugin cards + the API snippets
render identically for any scope. The scope threads through the
`show_integrate` canvas-dispatch tool so the LLM can carry the
transition-surface scope when it moves the canvas here.

## Locked affordances

- **Connector downloads** are **disabled-future (UI-02)**: each
  `plugin-<id>-download` control is `aria-disabled="true"`, `tabIndex={-1}`,
  and carries the honest title *"Plugin downloads ship with the agent
  integration pipeline (UI-02)."* This is a labeled, non-interactive
  affordance — NOT faked. The download pipeline is tracked separately under
  UI-02. The SURFACE (the cards) is the real content this widget makes
  reachable; the download action staying disabled is the deferral.

## Events

- **API snippet tab switch** — `Tabs` toggles the rendered snippet between
  cURL / Python / TypeScript (local UI state, no dispatch).
- **Connector download click** — no-op by design (disabled-future, UI-02). The
  control surfaces the not-yet state rather than firing a silent no-op.

## How to mount

```tsx
// Via <ScopedCanvas> ONLY — the sole mount path. Do NOT import the component
// directly (the ESLint no-restricted-imports ban routes it through the registry).
<ScopedCanvas
  step={{ kind: "integrate" }}
  scope={{ type: "documents", documentIds: [docId] }}
  role={role}
/>
```

`<ScopedCanvas>` resolves `integrate` → this widget through the production
registry (`scopedViewerWidgetRegistryProduction.ts`).

## LLM tools

`Integrate.tools.ts` declares `show_integrate({ scope })` — the canvas-dispatch
tool for the surface. `show_` is the canonical canvas-dispatch verb for every
ScopedViewerWidget (allowlisted in `check-tool-quality`). The handler returns a
`showIntegrate` `CanvasIntent`; the orchestrator's built-in handler routes it
to `advanceFrame("f7")` — the SAME canvas move the Integrate step-strip pill
performs. Mirrored on the middleware `SERVER_TOOL_CATALOG`.

## Tests

`Integrate.test.tsx` covers the role + scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`); `data-role` reflects the
   prop.
2. Renders the connector/plugin cards (Claude / OpenAI / Gemini / Cursor).
3. The connector download buttons stay honestly disabled-future (UI-02) —
   `aria-disabled` + the UI-02 title — not faked.
4. The cards render the same regardless of role (scope-independent today).
