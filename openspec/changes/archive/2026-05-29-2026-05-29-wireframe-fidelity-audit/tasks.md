# Tasks — wireframe-fidelity remediation (P1 → P2 → P3 first)

Owner-directed order: **P1 sign-up → P2 F1→F2 transition → P3 interact citations**, then the
remaining audit items (screen-adjacent ones first). TDD discipline: failing user-visible test
before implementation. Honor the WIP cap (≤3 in flight). A priority may split into its own
change if it grows — this file is the planning surface.

---

## ⭐ P1 — F6 Sign-up / Gate as a delayed chat moment

### P1.a — Gate appears in chat as a staggered AI message
- [x] Composing beat reused: `GateChatPanel` shows a `TypingIndicator` then fades the rail in
      (`COMPOSING_DELAY_MS`, persisted "composed-once" flag, reduced-motion fallback).
- [x] **Polish (2026-05-29):** the rail is now a SEQUENCE of three chat bubbles revealed one at a
      time, with a **"…" typing-indicator bubble between messages** (LoadingDots) on an irregular
      cadence — live timeline verified: bubble1 → typing → doors → typing → bubble3 (≈0.5s / 1.3s /
      1.95s / 2.85s). `prefers-reduced-motion` renders all at once with no typing beat.
- [x] **Animate-once (2026-05-29):** the sequence plays ONCE per visitor (persisted flag
      `groundx-onboarding.gate-sequence-played`, marked at sequence start) — later visits render
      instantly. Cleared by `resetExperience` (prefix match) so a debug reset replays it; reset
      test extended to assert the key is cleared. Live-verified: first run animates + typing,
      second run all bubbles by ~238ms with no typing.
- [x] **Bubble style (2026-05-29):** gate bubbles now match `ChatColumn`'s `BotBubble` — white,
      thin border, `BORDER_RADIUS_2X`, left-aligned — so the sign-up reads as the same chat surface
      as every other screen (dropped the bespoke avatar/eyebrow + squared tail).

### P1.b — Three doors: magic-link · SSO · book-a-call ✅
- [x] **Test:** `GateChatRail.test.tsx` — renders the magic-link email field + "Send magic link"
      + SSO door; SSO → `commitGate("sso")`; send-with-email → `commitGate("register")`;
      empty email → no commit (4 new cases, green).
- [x] Magic-link wired (owner decision: **demo magic-link / commit-only**) — "Send magic link"
      captures the email and commits via the existing `register` method (no passwordless backend;
      documented in a code comment). SSO → `commitGate("sso")`; book-a-call unchanged.
- [x] **Polish:** taller Send-magic-link button (`py: 1.5`); SSO given a pill outline so all three
      doors read as distinct buttons; doors split across bubbles.

### P1.c — Viewer shows the GroundX value prop (styled) ✅
- [x] **Test:** `GateValueProp.test.tsx` — canvas renders the pitch (eyebrow + headline + points),
      no account form; honors `mode`.
- [x] Built `viewer-widgets/GateValueProp` (README + no-llm.md + mode prop, tokens only). On-brand
      copy echoing F1/F7. `OnboardingShell` mounts it in the canvas when the sign-up surface is
      active, in place of the old `SignUpWidget` form.
- [x] **Polish (2026-05-29):** redesigned from a flat bullet list into a hero — green accent rule,
      eyebrow pill, display headline, lead, four icon-badged feature rows (title + body), free-tier
      footer. Safe-centered (margin-auto + scroll) so the tall card never clips.

### P1.d — Nav = Understand on the gate screen ✅
- [x] **Test:** `OnboardingShell.test.tsx` — while the gate is open the Understand pill is
      `aria-current="step"`.
- [x] `currentStep` forced to "understand" while `gate.status === "open"`; the Analyze sub-pills
      show no active sub-step during the gate (no double-active).

### P1 closure ✅
- [x] App suite 1080 green; tsc clean; drift guards (no-hardcoded-styles, tool-references,
      tool-quality, widget-contract) green; OpenSpec validate 19/19.
- [x] Live Chrome re-verified: three doors in chat, value-prop in canvas, single active nav pill
      (Understand), no console errors.
- [x] Archive (2026-05-29) — P1/P2/P3/P4/P5 verified done in code (workflow `wireframe-fidelity-verify`: 35/40 confirmed, 0 seam-only); P3.c markdown shipped; remaining items are deferred (word-level → `wf05b`) or out-of-scope (steady-mode, F7, WF-10). Closure gate green: validate 22/22, app 1088, middleware 494, drift guards.

---

## ⭐ P2 — F1 → F2 → F3 transition (staggered reasoning, nav Understand→Extract) ✅ ALREADY BUILT

> **Verified working (2026-05-29) — no code change needed.** The audit's "lands on Interact /
> all-at-once" observation was *persisted state* (entity `lastFrame=f5` + the ThinkingStream
> sessionStorage replay guard already set). On a FRESH visit (post-reset) the flow is correct.
> Live DOM timeline (fresh): `frame=f2 (Understand), nav=Understand, PDF in canvas, notes
> streaming` → notes complete → `frame=f3 (Extract), extract workbench in canvas`.

- [x] **P2.a** Sample-pick lands on Understand: `pickScenario` resolves a new sample to `f2`
      (`OnboardingSessionContext`). Verified frame=f2 + nav on Understand on fresh open.
- [x] **P2.b** Thinking-stream staggers: `ThinkingStream` reveals notes one at a time on a
      randomized 1.5–2.8s cadence + 1.2s done-delay, and persists once-per-tab (sessionStorage).
- [x] **P2.c** Nav holds Understand during the stream, then auto-advances: `ChatColumn` mounts
      `ThinkingStream` with `onDone → advanceFrame("f3")` (ChatColumn.tsx:1071). Verified f2→f3.
- [x] **P2.d** Extract workbench renders in the viewer on F3 (PDF + Statement/Meters/Charges).
      The F2 canvas shows the PDF during the live parse (the F-2 "blank" was only the
      navigate-back-to-Understand-step case, not the live flow).
- [x] **F2 scan animation fixed (2026-05-29):** the F2 frame→step mapping seeds a doc-viewer step
      with a PLACEHOLDER id (`scenario:<id>`, OnboardingSessionContext:34); `UnderstandView`'s
      stepDocViewer branch passed it to the viewer → `isResolvedDocumentId` rejected the colon →
      X-Ray gated → blank canvas, no scan for the whole Understand beat. Fix: UnderstandView now
      fires the stepDocViewer branch ONLY for a resolved id; a placeholder falls through to the
      scenario doc + scan. Live-verified: real PDF + scan-line sweep during Understand.
- [ ] (Optional follow-up) F1 step-strip "Understand · Available after sign-in" mislabel (F-5). Low priority.

---

## ⭐ P3 — A message that triggers citations in the Interact PDF viewer

> **Recommended trigger message: "What is the total amount due on this bill?"** (cites Amount
> Due / Total Amount Due $7,613.20 on pp.1–2 — prominent, easy to verify). Fallback: "What is
> the largest charge on this bill?".

### P3.a — Citation chip lights the canvas PDF
- [x] **Failing test:** sending the trigger message produces an assistant turn whose citations
      light region(s) on the canvas PDF (lit-region / highlight present for the cited page). *(verified done 2026-05-29)*
- [ ] Ensure the chip → `highlightCitation` → PDF highlight path resolves real geometry for the
      extract-indexed Utility doc (X-Ray join per `project_groundx_search_geometry`), not just a
      fallback band.

### P3.b — Canvas is doc-only (folds in F-1)
- [x] **Failing test:** `InteractView.test.tsx` — the canvas renders the `PdfViewerWidget` only;
      no second chat input, no assistant turns, no Save in the canvas (shell `ChatColumn` is the
      single chat surface, per `no-onboarding-duplicates`). *(verified done 2026-05-29)*
- [ ] Refactor `InteractView` to a thin doc-viewer wrapper; remove its self-owned turns/input/Save.

### P3.c — Chat returns answers (no more "no snippets") ✅ FIXED 2026-05-29
- [x] **Root cause:** the Utility doc is extract-workflow-indexed — its searchable text is
      extraction JSON, which scores NEGATIVE (~-11 to -30) against natural-language queries. The
      chatRouter searched with GroundX's default relevance floor (10), filtering every chunk out
      → `resultCount: 0` → the LLM honestly said "no snippets." (Confirmed via direct GroundX
      search: count 0 at default, count 2 at relevance -100.)
- [x] **Fix:** `chatRouter.searchGroundX` now retries once with a low relevance floor
      (`RAG_FALLBACK_RELEVANCE`, env-overridable, default -100) when the first pass returns 0
      results. Normal prose docs clear the default floor and pay no second round-trip.
- [x] Tests: chatRouter 79/79 (added zero-result-retry + no-retry-when-results cases). Live-
      verified: "what is the total amount" → `resultCount: 2`, answer "The total amount due is
      **$7,613.20**" + 1 citation.
- [x] **Follow-up (cosmetic) [F-3 readability] (a) — DONE 2026-05-29:** assistant bubbles now render
      **full markdown** (CommonMark + GFM: bold, italic, code, lists, tables, headings, links) via a
      new XSS-safe, token-styled `primitives/Markdown` (react-markdown + remark-gfm), wired into both
      `*-chat-live-assistant` bubbles. 10 primitive tests + a ChatColumn wiring test (`**x**`→`<strong>`,
      no literal `**`). Full suite 1087 green.
- [ ] **Follow-up (b) [grounding prompt] — moved out:** the answer sometimes quotes raw JSON
      (`"balance_payable":7613.2`). This is a grounding-prompt phrasing fix (chat-routing), NOT a
      render concern — tracked for the chat-routing/grounding work, not this UI change.

### P5 (new) — Citation chip + answer-source footer polish ✅ DONE 2026-05-29
- [x] Owner flagged the `[1]` chip + "Show source" button looking weird/disconnected (floating on
      separate rows). Fixes: `CiteChip` → soft tinted/bordered pill (was a loud solid chip);
      `SuggestedActionChips` → refined chip + softer hover/consistent height; `ChatColumn` merges
      citations + actions into ONE cohesive footer row under the bubble (both render sites).
- [x] App 1073/1073, tsc clean, drift + tool guards green. Live-verified: `[1]  Show source` sit
      together on one tidy, polished row.

### P3.b — Canvas is doc-only / Interact matches wires (folds in F-1) ✅ DONE 2026-05-29
- [x] Refactored `InteractView` to a PDF-only canvas: removed the duplicate chat (turns + input +
      Send). Kept the Save→gate affordance (`advance-to-f6`) in the header. Canvas litRegions
      trail the shared `ChatColumn` thread's latest assistant citations (read via
      `listChatMessages`, re-read on `session.updatedAt`).
- [x] Rewrote `InteractView.test.tsx` (5 tests): canvas renders PDF + NO chat input/Send/turns;
      litRegions derive from the persisted thread's latest assistant citations; Save opens the
      gate. (The send/error-copy coverage lives in `ChatColumn.test`.)
- [x] Live-verified: left rail = the only chat (works — "what is the total amount" → $7,613.20 +
      citation); canvas = doc viewer with a green lit region; no "weird chat input" in the canvas.

### P3.a — Citation lights the canvas PDF ✅ DONE 2026-05-29
- [x] The canvas auto-trails the latest assistant turn's citations → lit region on the cited page
      (verified: green region on page 2 for the total-amount answer). Real bbox resolves via the
      chatRouter X-Ray join when search results are bare.
- [x] **Citation click + "Show source" fixed (2026-05-29):** (1) clicking `[1]` now switches the
      canvas to the cited page with a highlight (was rendering the placeholder doc → nothing —
      fixed by the UnderstandView resolution above). (2) **"Show source" was a NO-OP** —
      `suggestedActionToIntent` didn't map the `show-source` key, so it dispatched nothing. Fix:
      `handleSuggestedAction` now special-cases `show-source` → `highlightCitation` for the turn's
      first citation (same as clicking `[1]`). Live-verified both light the cited region.
- [ ] **Known limitation (deferred WF-05):** the highlight is CHUNK-level (right region near the
      value), not pixel-precise on the exact figure — exact-word boxes need the `-118-map` atom
      resolver (WF-05 1b). The render already handles `exact` tier when that lands.

### P4 (new) — Extract field inspect card matches the wireframe (Flow_Peek) — NEXT
- [x] The owner flagged: clicking a field in the Extract schema viewer produces a card that
      doesn't match the wires. Redesign the field-provenance/inspect card to match `Flow_Peek`
      (source snippet + extracted value + why-matched + confidence). *(verified done 2026-05-29 — value hero + cyan source pill + confidence pill + neighbor chips)*

### P5 — Visual polish (owner-directed, 2026-05-29)
- [x] **Citation footer** — `[1]` chip softened to a tinted pill, `SuggestedActionChips` refined,
      citations + actions merged into one cohesive footer row.
- [x] **Understand scanner** — replaced the (a) faint 3px line then (b) "fat beam" with a scanner
      REVEAL: a faint veil over the un-read region + a thin bright glowing line sweeping down that
      "reveals" the doc. Obvious, uses overlay opacity, no heavy band. Live-verified on F2.
- [x] **Floating panels (nav/chat look)** — chose option 2. v1 looked beige because the desk was
      WARM_OFFWHITE (#f8f7f2), only ~10 levels off the cards' white → no contrast (caught by
      measuring computed bg). **v2 fix:** desk → cool-gray (`alpha(NAVY, 0.08)`), nav transparent
      (blends into desk), **chat card WARM + canvas card WHITE** (so the white assistant bubbles
      keep contrast and the two cards stay distinct), stronger card shadow. Now reads as elevated
      floating cards on a gray desk. **Option 1 (navy sidebar) remains the documented backup.**
- [x] **Scan v4 (owner-directed)** — subtle full-page opacity overlay (`pdf-viewer-scan-overlay`)
      + the original single thin beam, sweeping top→bottom and back (CSS `alternate`). v1 line/v2
      fat-beam/v3 veil all rejected.
- [x] **Navy desk + full-bleed PDF (owner-directed)** — desk recolored to NAVY; canvas card
      borderless. **REVERTED the navy** (owner: "blue doesn't work") → back to cool-gray desk +
      dark nav. KEPT: borderless canvas card.
- [x] **PDF actually fills the card (owner: "you basically did nothing")** — the gray border +
      spacing was NOT the canvas card; it was (a) the page IMAGE's own 1px border in
      `PdfViewerWidget` and (b) `ExtractView`'s `extract-doc-pane` 1px border + 32px grid padding —
      none of which the earlier canvas-card change touched (verified via `getComputedStyle`).
      Removed the image border, the doc-pane border, and cut the grid padding to ~16px.
- [x] **3-dot menu inline with category tabs** — `FieldsPanelMenu` was a block ABOVE the tabs,
      offsetting them down. Now it's a fragment placed in the tabs row, floating right (verified
      same-row via getBoundingClientRect).
- [x] **Disabled state lightened** — step-strip disabled text `alpha(NAVY,0.5)→0.34`, border
      `0.25→0.14` (owner: "gray disabled too dark").
- [x] **Scanner verified present** — it renders only on F2 (the "reading" beat); confirmed visible
      via DOM + screenshot. "Disappeared" was the Extract screen, where parsing is already done.
- [x] **Extract field rows readable** — value was crowding the wrapping description. Fix: wider
      column gutter + top-align, description clamped to 2 lines + muted, value moved into a
      distinct tinted chip on the right. (Owner: "values too close to descriptions.")

## Backlog — word-level citation geometry (the "exact tier")  ← (answers "where is this tracked?")
- [ ] **Not yet a standalone change.** Today citation highlights are CHUNK-level (the right region
      near the value, from the X-Ray join), not pixel-precise on the exact figure. Exact-word boxes
      need the GroundX `…-118-map.json` atom resolver (referenced in the archived `wf05-extract-
      field-geometry` + `wf06b-tiered-citation-render` changes and the `project_groundx_search_
      geometry` memory). The app already renders the `exact` tier when the middleware emits it —
      so this is purely a middleware geometry-resolution task. Promote to its own OpenSpec change
      when prioritized.

---

## Remaining audit items (after P1–P3)

All major onboarding findings folded into P1–P3 above. Lower-priority / out-of-scope:

- [ ] Steady-mode fidelity audit — separate pass (wireframes in the `groundx-wireframes` checkout).
- [ ] F7 Integrate live re-verify (auth-gated; source-read only so far).
- [ ] WF-10 Loan/Solar content — tracked separately, blocked on source assets.
