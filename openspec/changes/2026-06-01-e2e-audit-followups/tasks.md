# Tasks — E2E audit follow-ups (2026-06-01)

> Continuation of `2026-05-31-e2e-experience-audit` (now closing out). This ticket carries the
> surfaces not yet driven live + the DL-2 console-warning fix. **DL-1 (chat-RAG) is NOT here —
> it is the change `2026-06-01-rag-retrieval-correctness`.**
>
> **Adversarial review gate after EVERY task (Discipline §10) — tailored for an audit.**
> A task is NOT `[x]` until an adversarial review of its output, run against the plan AND the
> real running app, passes — before marking done and before the next task. The audit-specific
> gate per task:
> - **Each per-surface pass (§2.x):** the review must confirm the pass exercised every control
>   named in the task and cited a **MEASURED value** for each verdict (rendered px / visibility
>   / DOM attribute / scroll position / network response body / console state / a11y node) — a
>   pass that only attached a screenshot is NOT done; falsify each "it worked" claim against the
>   live DOM. Confirm every found defect became a defect-log row (or was triaged to a ticket),
>   and re-run the console+network observation to confirm no happy-path uncaught error / non-2xx
>   was missed.
> - **The DL-2 fix (§3):** the review must confirm the console-clean assertion genuinely FAILS
>   without the fix (the ~24× `v7_startTransition` warning is present), PASSES after, and the
>   Router change broke no navigation behavior (re-drive one route transition live).
> - **Cross-change collision check:** confirm no edit overlaps `2026-06-01-rag-retrieval-correctness`
>   on a shared file; if a defect found here is RAG-retrieval-shaped, triage it to that change,
>   do not fix it here.
>
> **Tooling (every pass):** start servers with `Claude_Preview preview_start` (reads
> `.claude/launch.json`, REAL GroundX); screenshots via `preview_screenshot`; drive + inspect
> with the `chrome-devtools` MCP (`evaluate_script` for DOM measurement, network bodies,
> console, a11y snapshot). **MEASURE, don't eyeball.**

Order: **per-surface measured passes (§2) → DL-2 fix (§3) → closeout (§4).** Honor the WIP cap
(≤3 in flight). Each confirmed defect → a defect-log row → fix (failing-test-first where a
unit/widget test can reach it; browser-measured where it can't) OR triage to its own ticket.

---

## 2 — Remaining measured live passes (one task per surface)

### 2.3-deep — Extract field add/edit + JSON-toggle + provenance highlight
- [ ] Drive the live Extract widget on the utility sample (bucket 28454 / c3bfff49). **Add** a
      field and **edit** an existing field; measure that the new/edited field row is present in
      the DOM and (if persisted) reflected in the next `getextract`/save network body.
- [ ] Flip the **JSON-render toggle**; measure that the output FORMAT actually changes (the
      rendered output node switches between card view and JSON text — assert the before/after
      DOM/text, not a screenshot).
- [ ] Click a **field card**; measure the provenance / source-region **highlight box on the
      PDF** (a real, non-zero highlight rect over the correct page/region, read from the DOM).
- [ ] **Adversarial review (audit gate above).**

### 2.5 — Report render WITH a template + accept/reject + builder + pin→report
- [ ] Create a real user template (via the f4a builder or pin→template existing-or-new UX —
      `Pin→template = NO auto`), then drive the **SmartReport render** with that template;
      measure that sections render with real generated answers (not the empty state).
- [ ] Exercise section **accept** and **reject**; measure the state change (the section's
      accepted/rejected status in the DOM and/or the persisted report network body) — a
      MEASURED state change, not a visual guess.
- [ ] Drive the **f4a builder** (add/edit/remove a section/question) and the **pin→report**
      path; measure the resulting template/report state.
- [ ] **Adversarial review (audit gate above).**

### 2.6 — Integrate (connectors + plugin-download states)
- [ ] Drive the live Integrate widget; measure that **connector cards/controls** render and
      respond (DOM presence + any state toggle), and exercise the **plugin-download states**
      (measure the state transition in the DOM, not a screenshot).
- [ ] **Adversarial review (audit gate above).**

### 2.7 — Sign-up gate (three doors + value-prop canvas + commit/dismiss)
- [ ] Open the sign-up gate; measure the **staggered reveal** (elements appear in order — assert
      via measured opacity/transform or a11y/DOM appearance, see also §2.15).
- [ ] Exercise all **three doors**: magic-link (email field + send), SSO, book-a-call; measure
      each door's control state (input present, send fires a request, the book-a-call card opens).
- [ ] Measure the **value-prop canvas** content renders, and exercise **commit** and **dismiss**
      / back-out (measure the resulting view/route state).
- [ ] **Adversarial review (audit gate above).**

### 2.9 — Gates (open / commit each method / dismiss / overlay / nav-while-gated)
- [ ] Open a gate via **Save**, **Export**, and the **metered ceiling**; measure that each
      trigger opens the gate (DOM/overlay present).
- [ ] **Commit** each gate method and **dismiss / back-out**; measure the gate overlay's
      presence/absence and the post-action state.
- [ ] Exercise **nav-while-gated**; measure whether navigation is blocked/allowed as specified
      (measured route/overlay state).
- [ ] **Adversarial review (audit gate above).**

### 2.10 — Citation round-trip (chip → viewer → measured highlight; survives refresh)
- [ ] Click a **citation chip**; measure that the viewer **mounts the right doc/page** (the
      mounted doc id + page index read from the DOM/state) and renders a **MEASURED highlight
      box on real geometry** (non-zero rect over the cited region).
- [ ] **Refresh** the page and re-measure that the citation/highlight survives (still present
      with the same measured box).
- [ ] **Adversarial review (audit gate above).** Note: if the failure is RAG-retrieval-shaped
      (no citation produced upstream), triage to `2026-06-01-rag-retrieval-correctness`, do not
      fix here.

### 2.11 — Auth (login / register / password show-hide / reset / claim flip)
- [ ] Drive **login** and **register**; measure success/failure state from the network body +
      resulting authed view.
- [ ] Toggle **password show/hide**; measure the input **`type` attribute flips**
      (`password` ↔ `text`) — the load-bearing measured proof, not a screenshot.
- [ ] Exercise password **reset**.
- [ ] Drive the **claim / anon→authed flip**; measure that anon state is **preserved** across
      the flip (the same chat session / entities present after re-key — measured from
      DOM/network, cross-checked against the chat-session model).
- [ ] **Adversarial review (audit gate above).**

### 2.12 — Steady-mode parity (workspaces/projects nav, same widgets, mode=steady)
- [ ] Enter steady mode; drive **workspaces / projects navigation**; measure that the **same
      production widgets** mount on **real data** (assert the widget DOM + a real-data network
      body, not a fixture) and that the **`mode` prop is `steady`** (measured via the DOM/state
      the mode flag drives — e.g. a locked-vs-unlocked control differs from onboarding).
- [ ] **Adversarial review (audit gate above).**

### 2.13 — Debug-overlay reset (ALL session state cleared; forward-binding)
- [ ] Establish session state (chat session, entities, cookies), then trigger the debug-overlay
      **Reset**; measure that **localStorage, sessionStorage, cookies, in-memory contexts, and
      the server session row** are ALL cleared (read each store after reset — empty/absent).
- [ ] **Forward-binding check:** diff the live cleared-state set against `lib/resetExperience.ts`
      — if any session-scoped store the app now writes is NOT cleared by `resetExperience.ts`,
      that is a defect (per the locked debug-reset-exhaustive rule); log it and fix
      failing-test-first in `resetExperience.ts` + its test, or triage.
- [ ] **Adversarial review (audit gate above).**

### 2.14 — Responsive (golden path at desktop AND mobile)
- [ ] Drive the golden path at a **desktop** viewport and a **mobile** viewport; measure no
      **overflow** (scrollWidth ≤ clientWidth where it must not scroll) and **no unreachable
      controls** (each golden-path control is present and within the viewport bounds — measured
      rects).
- [ ] **Adversarial review (audit gate above).**

### 2.15 — Reduced-motion (staggered reveals degrade)
- [ ] With `prefers-reduced-motion: reduce` emulated, drive a staggered-reveal surface (e.g. the
      sign-up gate); measure that the reveal degrades to **crossfade / instant** (no long
      transform/translate animation — assert via measured computed transition/animation or
      final-state-immediate appearance).
- [ ] **Adversarial review (audit gate above).**

### 2.16 — Full console + network sweep on the happy path
- [ ] Re-drive the full golden path while observing the console and network; record every
      message and request. **Any uncaught error or non-2xx response on a happy path is a defect
      row** (note F-2's cold-start anon `POST /api/chat-sessions` 401→retry-200 already observed
      by the parent audit — confirm it self-heals or log it).
- [ ] **Adversarial review (audit gate above).**

---

## 3 — DL-2 fix · React Router v7 future-flag warning (P3)

- [ ] **Failing-first:** add a console-clean assertion (a test that drives the app / mounts the
      Router and asserts the console has **no** `v7_startTransition` future-flag warning). Confirm
      it FAILS today (the warning logs ~24×).
- [ ] **Fix:** set the `v7_startTransition` future flag (and the other v7 future flags as
      appropriate) on the Router config, or suppress — clean console. Make the assertion PASS.
- [ ] **Re-verify live:** re-drive one route transition with the `chrome-devtools` console open;
      measure the `v7_startTransition` warning count is now **0** and navigation still works.
- [ ] **Adversarial review:** confirm the assertion genuinely fails without the fix and passes
      with it; confirm the Router change broke no navigation behavior (measured route transition).

---

## 4 — Closeout

- [ ] Consolidate every found defect into the defect log (`defect-log.md` in this change dir):
      one row per defect — `id · surface · measured actual · expected · severity · status`.
      Each row is `reverified` (fixed + re-measured live), `triaged-ticketed` (deferred with a
      referenced ticket — e.g. RAG defects → `2026-06-01-rag-retrieval-correctness`), or it
      BLOCKS closeout. No `open` row at sign-off.
- [ ] Run the gate: `npm run test` (app + middleware), `npm run build`, the drift guards
      (no-hardcoded-styles, widget-contract); all green.
- [ ] `openspec validate 2026-06-01-e2e-audit-followups --strict` passes.
- [ ] Sign-off: every §2 surface exercised with MEASURED evidence; DL-2 fixed + console-clean;
      defect log has no open row; no dormant/stale code left behind. Archive.
