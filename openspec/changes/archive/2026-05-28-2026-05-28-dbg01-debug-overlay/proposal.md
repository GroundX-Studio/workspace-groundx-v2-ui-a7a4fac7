# DBG-01: debug overlay + onboarding-shell cleanups

## Why

Three things surfaced while reviewing the live onboarding experience on 2026-05-28:

1. **No quick way to reset the demo.** Testing the first-run experience means
   manually clearing cookies + localStorage + signing out, every time. We want a
   one-click "back to a fresh, signed-out, first-time visitor" reset, gated behind a
   URL param so it never ships to real users by accident. Model it on the existing
   `NavDebugOverlay` (`?navdebug=1`).
2. **Chat scrollbar overlays the conversation.** The chat scroll container
   (`ChatColumn.tsx:400` and `:1016`) is `overflow: auto` with `scrollbar-gutter: auto`
   and no right padding, so the vertical scrollbar paints on top of the message bubbles.
3. **The PDF looks like it "doesn't render."** It actually renders fine on a clean
   desktop load (canvas 894px, page image + thumbnails + lit-region all present). It's
   invisible in two states: (a) compact/narrow viewport, where it's behind the
   "View canvas" toggle, and (b) a compact↔desktop breakpoint flap that can crush the
   canvas pane to ~24px. The fix is AppShell layout robustness + making the PDF
   reachable in compact, NOT a PdfViewer change.

## What changes

### A. Debug overlay (the headline feature)

- A new `DebugOverlay` component, gated on `?debug=true` (mirrors `NavDebugOverlay`'s
  `?navdebug=1` gate). Renders a **fixed floating bar pinned along the bottom** of the
  viewport, above all app chrome (high z-index), visually distinct (debug-yellow / mono
  font) so it's never mistaken for product UI.
- The bar's first control is a **Reset button** that returns the app to "an
  unauthenticated user looking at the onboarding for the first time":
  1. Sign out (clear the auth session via the existing sign-out path).
  2. Clear all app-owned **client** storage — `localStorage` (`appshell.chatWidth.v2`,
     ChatStore cache, onboarding-session cache, demo state) and the per-scenario
     `sessionStorage` thinking-stream replay keys.
  3. Clear the anon session + csrf cookies so the next request mints a **fresh anon id**
     (server treats it as a brand-new visitor).
  4. Hard-navigate to `/onboarding` (F1).
- The bar is **extensible** — Reset is the only control in this change, but the layout
  leaves room for future debug toggles (force-compact, mock-mode flag, frame jump). Out
  of scope here; just don't paint ourselves into a corner.
- Mounted once at the app root (next to `NavDebugOverlay`), returns `null` unless the
  param is present — zero cost in production.

### B. Chat scrollbar cleanup

- Give the chat scroll container `scrollbar-gutter: stable` + a small right padding so
  the scrollbar reserves its own gutter instead of overlaying the bubbles. Apply to both
  ChatColumn scroll containers (onboarding + steady variants).

### C. PDF reachability / canvas robustness

- **Compact:** ensure the "View canvas" toggle reliably reveals the PDF (it's the only
  way to see the canvas on narrow screens). Add a test that, in compact mode on F2/F3/F5,
  toggling to canvas mounts a non-zero-width canvas containing the PdfViewerWidget.
- **Breakpoint flap:** when AppShell transitions compact→desktop, reset the focus mode to
  `split` so the canvas can't be left collapsed to ~24px. (The existing
  `lastCompactRef` effect already resets mode on the boundary cross — verify it covers the
  desktop direction and that `split` is the desktop default; add a regression test.)

## Out of scope

- Any debug control beyond Reset (force-compact, frame jump, mock-mode toggle) — future.
- The matchMedia-vs-innerWidth discrepancy itself (a preview-environment quirk; the
  `NavDebugOverlay` already exists to diagnose it). We make the layout *robust* to it,
  not "fix" the environment.
- S-series, CF-04, CF-19, content seed — still deferred.

## Affected

- App: new `views/Onboarding/DebugOverlay.tsx` (or `components/layout/DebugOverlay/`),
  mounted in `App.tsx` / the root shell next to `NavDebugOverlay`; a small
  `lib/resetExperience.ts` storage+cookie+navigate helper;
  `components/chat-widgets/ChatColumn/ChatColumn.tsx` (scrollbar);
  `components/layout/AppShell/AppShell.tsx` (focus-mode reset on breakpoint cross).
- Middleware: a `/api/auth/reset` (or reuse logout) endpoint only if client-side cookie
  clearing is insufficient for the anon cookie (httpOnly) — TBD in tasks.
- Specs: `app-architecture` (debug overlay + reset), `ui-views` (scrollbar + PDF
  reachability).
