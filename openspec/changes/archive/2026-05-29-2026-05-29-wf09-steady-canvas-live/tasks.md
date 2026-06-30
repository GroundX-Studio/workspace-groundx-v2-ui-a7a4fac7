# Tasks — WF-09 Steady-mode canvas live

**Finding (2026-05-29): the "entire steady canvas is mock" premise was STALE** (same as WF-08's
rewire-gap doc). The steady canvas already mounts live production widgets — no code change needed;
this is a verification + closure.

- [x] Depends on WF-08 — done (production widgets are live-fed).
- [x] **Already satisfied + tested:** `SteadyShell.test.tsx` asserts that on an active doc-viewer
      step (citation click), the canvas mounts the live `PdfViewerWidget` with `data-mode="steady"`
      (fed by `getDocumentXray`) and `steady-shell-canvas-placeholder` is **absent** (lines 175–233);
      placeholder present only when genuinely empty (line 215). 5/5 green.
- [x] **Steady chat is live:** `ChatColumn mode="steady"` → `SteadyConversationFlow`, which uses
      `liveTurns` + `listChatMessages` (RT-01 hydration) + `sendChatMessage` + citation projection —
      the same live path as onboarding. No scripted/mock seed.
- [x] Empty-state ("Pick a document to view") retained for the genuinely-empty case only — it is a
      legit empty state, NOT mock data.
- [x] App **1057/1057** + middleware **476/476**; tsc 0 both sides; drift green; OpenSpec validate.
- [x] Live coverage: the citation→live-PdfViewer(mode=steady) behavior is covered by the SteadyShell
      component test (reaching steady mode in-browser needs an authed session; the user-visible
      behavior is asserted at the component level).
- [x] Archive.

## Not in WF-09 scope (genuine future feature, not a deferral)
Defaulting the canvas to an "active session document" on load (without a citation click) needs a
steady **document picker** + a `"document"` `EntityKind` (today `EntityKind = "sample"` only, no
live `upsertEntityAndActivate` callers). That's a new steady-mode feature — explicitly out of
WF-09's scope ("new steady-mode features beyond mounting the live widgets"). The spec requirement
("when a document is active → live viewer") is met by the citation-driven path.
