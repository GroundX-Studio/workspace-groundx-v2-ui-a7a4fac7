# Tasks — DBG-01 debug overlay + shell cleanups

## A. Debug overlay

- [x] **Failing test:** `DebugOverlay.test.tsx` — with `?debug=true` the overlay
      renders a fixed bottom bar with a "Reset" button; without the param it
      renders `null`.
- [x] Build `DebugOverlay.tsx` — `?debug=true` gate (URLSearchParams, like
      `NavDebugOverlay`), `position: fixed; bottom: 0; left/right: 0`, high
      z-index, debug-distinct styling (NOT brand tokens — intentionally
      off-palette so it reads as a dev tool). `data-testid="debug-overlay"`.
- [x] Mount once at the app root next to `NavDebugOverlay`; returns null when
      the param is absent.
- [x] **Failing test:** `resetExperience.test.ts` — the helper clears the known
      localStorage keys (`appshell.chatWidth.v2` + ChatStore/onboarding/demo
      caches), clears the per-scenario sessionStorage thinking-stream keys, and
      calls the sign-out + navigate path. (Mock storage + a navigate spy.)
- [x] Build `lib/resetExperience.ts`:
      1. call the existing sign-out (clears auth session).
      2. enumerate + remove app-owned `localStorage` keys.
      3. clear `sessionStorage` thinking-stream replay keys.
      4. clear client-readable cookies (csrf); if the anon session cookie is
         httpOnly, add/extend a middleware endpoint to clear it (see middleware
         task) so the next request mints a fresh anon id.
      5. `window.location.assign("/onboarding")` (hard nav → full remount,
         fresh contexts).
- [x] **Failing test:** `DebugOverlay.test.tsx` — clicking Reset invokes
      `resetExperience` (spy).
- [x] Wire the Reset button → `resetExperience`.

## A2. Middleware (only if anon cookie is httpOnly)

- [x] Confirm whether the anon session cookie is httpOnly (inspect
      `middleware` session config). If client JS can't clear it:
- [x] **Failing test:** route test — `POST /api/auth/reset` (or extend logout)
      expires the anon session + csrf cookies (Set-Cookie max-age=0).
- [x] Implement the endpoint; `resetExperience` calls it before navigating.

## B. Chat scrollbar cleanup

- [x] **Failing test:** `ChatColumn.test.tsx` — the scroll container has
      `scrollbar-gutter: stable` (assert via style/computed or a `data-` marker).
- [x] Add `scrollbarGutter: "stable"` + a small right padding to both chat
      scroll containers (onboarding `:400`, steady `:1016`). Keep the existing
      `overflow: auto`.

## C. PDF reachability / canvas robustness

- [x] **Failing test:** `AppShell.test.tsx` — crossing compact→desktop resets
      focus mode to `split` (canvas not left collapsed). Assert the canvas pane
      width is non-trivial (> chat width floor) after the transition.
- [x] Verify/extend the `lastCompactRef` effect in `AppShell.tsx` so the
      desktop direction resets to `split`; ensure `split` is the desktop default.
- [x] Compact "View canvas" reveals a usable PDF — covered by
      `AppShell.test.tsx` ("resets focus mode when the viewport crosses the
      compact boundary", asserts both panes present after the cross) PLUS the
      live Chrome DevTools validation below (jsdom can't measure px width, so
      the "non-zero width" half is verified in the real browser, not a unit
      test). No separate OnboardingShell test added — would be a redundant,
      width-blind duplicate.
- [x] No extra guard needed: the existing `lastCompactRef` effect already
      resets focus mode to `split` on compact→desktop, so the canvas can't be
      left collapsed. Verified live (canvas 894px on clean desktop load).

## D. Agent guidance (verification tooling)

- [x] Add a "UI verification tooling" rule to `docs/agents/` (new §4b in
      `discipline.md`, or `docs/agents/testing.md`): when the `chrome-devtools`
      MCP is attached, prefer it for UI inspection/debugging (DOM measurement,
      network response bodies, console, a11y snapshot, perf). It does NOT
      replace `Claude_Preview` for (1) starting dev servers via
      `.claude/launch.json` or (2) screenshots (the reliable fallback). Cite the
      "measure, don't eyeball" lesson (the 24px-collapsed-canvas diagnosis).
- [x] Cross-link the rule from `getting-started.md` (the preview/verify loop)
      so a first-day agent sees it.
- [x] Add a "debug reset stays exhaustive" rule to `docs/agents/` (near the
      chat-session-model + discipline docs): the debug reset MUST clear ALL
      session-scoped state, and any change that adds a new session key / context
      / cookie / cache / server session record MUST extend `resetExperience` +
      its test in the same change. Point readers at `lib/resetExperience.ts` as
      the canonical session-state inventory.
- [x] Cross-reference that rule from `docs/agents/chat-session-model.md` (the
      doc that enumerates session state) so adding state and updating reset are
      seen together.
- [x] (Memory already updated out-of-band 2026-05-28:
      `feedback_ui_verification_tooling.md` + `feedback_debug_reset_exhaustive.md`
      + MEMORY.md index — no repo task, noted here for traceability.)

## Closure

- [x] All app + middleware tests green.
- [x] Drift guards green (`no-hardcoded-styles.test.ts` — note the DebugOverlay
      is intentionally off-palette; add it to the documented allowlist with a
      one-line rationale rather than forcing brand tokens onto a dev-only tool).
- [x] OpenSpec `validate --all --strict` passes.
- [x] Browser validation via **Chrome DevTools MCP** when attached (per the
      verification-tooling rule): `preview_start` boots the servers, then drive
      `/onboarding?debug=true` via `chrome-devtools` —
      `evaluate_script` confirms the bottom bar is in the DOM with a Reset
      control; after clicking Reset, measure that localStorage/sessionStorage
      keys are gone, cookies expired, and the URL is `/onboarding` on F1 (no
      replayed thinking-stream). Also measure the canvas-pane width after a
      compact→desktop cross (proves the C fix). Fall back to `Claude_Preview`
      for server-start + screenshots if `chrome-devtools` is unavailable.
- [x] Archive the change.
