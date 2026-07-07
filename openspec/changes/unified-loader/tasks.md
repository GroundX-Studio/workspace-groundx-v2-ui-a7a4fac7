# Tasks — unified-loader

One workstream: the single shared loading animation everywhere + the frame flex fix. TDD
(failing test first), adversarial-review gate after each task, suite green at every step.
Sequenced AFTER `analyze-and-chat-ux` (it restructures the chat thinking area); this change swaps
the shared mark into the settled structure.

## 1. Shared loading animation, app-wide

- [ ] 1.1 `ViewerWidgetFrame` body `flexDirection: column` (TDD) — failing test: a widget
      mounted in `edge-to-edge`/`embed` mode renders content anchored to the top of a column,
      not stretched full-height nor centered mid-pane. Fix the body sx. Confirms the direct
      cause of the floating Extract loader.
- [ ] 1.2 Two composable layers under `components/primitives/` (TDD):
      (a) `<BreathingMark size/>` — the pure green animation (concept E, calm/flat/on-brand pulse;
      `prefers-reduced-motion` → static); the one loading visual.
      (b) `<Loading loading>{children}</Loading>` — a boundary that renders `<BreathingMark>` *in
      place of* its children while loading, else the children; optional `size`/`message`/`delay`.
      NOT a `mode` flag — "in place of" = the boundary, "alongside content" = the bare mark.
      README + sibling test + tool-binding (`no-tool`). widget-contract + no-hardcoded-styles green.
- [ ] 1.2a Visual design pass (chrome-devtools MCP) — render the primitive in the running app
      and iterate the form/motion at both the large (viewer) and small (chat) sizes; measure +
      screenshot to confirm it reads as compelling and calm, is centered, and animates smoothly
      in light + dark. Not a source-only guess — evaluate live.
- [ ] 1.3 Anti-flash delay in the boundary (TDD) — an optional appearance delay (~150ms default)
      so a region that resolves within the window never shows the mark. Test: resolves before the
      delay → mark never rendered; resolves after → mark shown. (NO descriptor field, NO
      `useScopedResource` hook — see design.md; regions wrap their own content.)
- [ ] 1.4 Wrap `PdfViewerWidget.tsx` (TDD) — replace the silent empty box
      ([PdfViewerWidget.tsx:719]) by wrapping the page area in `<Loading loading={isPending}>`.
      Source loading/error from the **TanStack Query state** the sibling change
      `adopt-tanstack-query` §1.5 leaves in place (`isPending`/`isError`) — that change lands
      first and DELETES the widget's `loadSeqRef`, so do NOT reference or "keep" `loadSeqRef`.
      Preserve `data-loading` + `aria-label`.
- [ ] 1.5 Wrap `Extract.tsx` (TDD) — replace the `!schema` body loader ([Extract.tsx:645]) with the
      boundary; source the boundary's `loading`/`error` from Extract's TanStack Query state
      (`isPending`/`isError` of its dependent-read chain, per `adopt-tanstack-query` §1.5 — its
      `loadSeqRef` is gone by this point). Keep Extract's own query orchestration + the
      `skipsExtract` copy branch. Optionally wrap the fields table so it can show the mark while
      values load after the shell renders. Test: loading renders the boundary mark, not stretched
      mid-pane.
- [ ] 1.6 Wrap `SmartReportRender` (first-paint state); confirm `Integrate` (no load) renders no
      mark (TDD).
- [ ] 1.7 Wrap `BookCallView.tsx` + `SignUpWidget.tsx` (TDD) — the boundary for the blocking
      pre-embed state; keep the frame **status band** for progressive status once the embed is
      present and for `error`. Verify the existing Calendly status-band scenario still holds.
- [ ] 1.8 Retire `LoadingDots` at the chat + gate + status-band sites (TDD). By this point
      `analyze-and-chat-ux` §6.3 has ALREADY replaced the bare `showThinking` →
      `BotBubble`+`LoadingDots` block in `app/src/conversation/chatPrimitives.tsx` with a live-fed
      `ThinkingStream` for in-flight turns — so that block no longer exists. Operate on the
      post-step-3 structure:
      - **Chat thinking (`chatPrimitives.tsx`):** the shared breathing mark does NOT appear in the
        thinking-stream area. `ThinkingStream` (status/reasoning lines) is the composing indicator
        for in-flight turns; adding a mark beside it would be a second, redundant loading visual.
        The only residual `LoadingDots` usage in this file (if any survives §6.3) is swapped to the
        shared mark or removed; the `ThinkingStream` render is left intact.
      - **Gate chat (`GateChatPanel.tsx`/`GateChatRail.tsx`):** replace any `LoadingDots` with the
        shared mark, `size="sm"`, where these surfaces are not fed by `ThinkingStream`.
      - **`ViewerWidgetFrame` status band:** render the bare `<BreathingMark>` (small) inline next
        to its text — it accompanies already-visible content, so it uses the mark directly, NOT the
        boundary.
      Delete `components/primitives/LoadingDots/`. Preserve the existing `aria-label`s.
- [ ] 1.9 Universality drift guard (TDD) — a test asserting every ENUMERATED loading/thinking
      surface (viewer widgets, chat, status band) uses the shared boundary and that `LoadingDots`
      no longer exists (mirrors `widget-contract.test.ts`). Delete the ad-hoc loader treatments +
      any now-dead styles.

## 2. Verification

- [ ] 2.1 Live preview verification (chrome-devtools MCP) — confirm the shared green mark appears
      on genuine first loads for Extract, PdfViewer, and Calendly (large) and in the chat thinking
      indicator (small); screenshot both sizes in light + dark as closure evidence.
- [ ] 2.2 Full suite + typecheck green; `OPENSPEC_TELEMETRY=0 openspec validate --all --strict`;
      adversarial review vs. this proposal AND the real code (not the seam).
