# Tasks — full end-to-end experience audit + remediation (2026-05-31)

> **STATUS (2026-06-01) — IN PROGRESS, live testing continues (do NOT archive until all §2 surfaces are driven).**
> Harness up + re-run against REAL GroundX (MOCK_MODE removed). Foundational surfaces PASSED live with
> measured evidence (`audit-progress.md` + `defect-log.md`): F1 Ingest, F2 Understand/PDF (24px-collapse
> CLEARED — 958×1240), F3 Extract (real fields/values), Report no-template state.
> **Defects are ticketed to fix LATER (so the audit isn't blocked), but the TESTING is finished HERE:**
> DL-1 (P1, live chat RAG returns 0 snippets/no citations for an answerable query) → deep-dive ticket
> `2026-06-01-rag-retrieval-correctness`. DL-2 (P3, React Router v7 console warnings) → `defect-log.md`,
> ticketed if not fixed inline.
> **STILL TO DRIVE LIVE (this change is NOT done until these are tested):** 2.3-deep (extract field
> add/edit, JSON-toggle, provenance highlight) · 2.5 report-with-template + section accept/reject + builder ·
> 2.6 Integrate · 2.7 sign-up gate · 2.9 gates · 2.10 citation round-trip · 2.11 auth (password toggle,
> claim/flip) · 2.12 steady-mode parity · 2.13 debug reset · 2.14 responsive/mobile · 2.15 reduced-motion ·
> 2.16 console/network sweep.

> TDD: failing test first, then implement, then adversarial review before marking done.
> **Adversarial review gate after EVERY task (Discipline §10)** — a task is not `[x]` until
> an adversarial review of its output against the plan AND the real code passes, run before
> marking done and before the next task. Tailored for this AUDIT change: each per-surface
> audit pass (§2) gets a review that the pass actually exercised every control with MEASURED
> evidence (a pass that only screenshotted is NOT done), and each per-defect fix (§4) gets a
> review that the regression test genuinely fails without the fix and the fix broke no sibling
> interaction.

Exploratory audit-then-fix. Order: **(1) inventory → (2) per-surface audit passes → (3)
defect log → (4) fix loop → (5) sign-off.** Honor the WIP cap (≤3 in flight). Each confirmed
defect SHOULD get a regression test before its fix.

**Tooling (every audit pass below):** start servers with `Claude_Preview preview_start`
(reads `.claude/launch.json`); screenshots via `preview_screenshot`; drive + inspect with the
`chrome-devtools` MCP (`evaluate_script` for DOM measurement, network bodies, console, a11y
snapshot). **MEASURE, don't eyeball** — every "expected effect" verdict cites a measured value
(rendered px / visibility / attribute / scroll / network body / console / a11y node), not a
screenshot glance.

---

## 1 — Interaction inventory (scope of record)

- [ ] Read `app/src/views/` (Onboarding, Steady, Scoped, Auth, Home) and
      `app/src/components/{chat-widgets,viewer-widgets,primitives,layout,brand}/` to enumerate
      every interactive control and navigation path.
- [ ] Author `interaction-inventory.md` in this change dir: one row per control with
      `surface · control · how-to-drive · expected effect · what-to-measure`. Group by surface
      (the audit-pass list below). This file is the audit's scope-of-record — every row must be
      exercised before sign-off.
- [ ] Confirm the inventory covers each surface in §2; cross-check against the wireframe spec
      so no path (e.g. a back-out / dismissal route) is missed.
- [ ] **Adversarial review:** re-walk `views/` + `components/` against the inventory and try to
      find ONE interactive control or nav path the inventory omits (hover/long-press, disabled
      states, keyboard-only paths, back-out/dismissal routes). If found, the inventory is not
      done — add the row. Confirm every row names a *measurable* `what-to-measure` (not "looks
      right").

## 2 — Per-surface audit passes (drive controls + capture measured evidence)

Each pass: bring up the surface live, drive every control on it, record measured actual vs
expected in the defect log (§3) — `pass` rows note the measured value too, so the evidence is
auditable. Attach a `preview_screenshot` as corroboration.

- [ ] **2.1 Onboarding F1 — Ingest / sample picker.** Sample cards render; pick a sample →
      measure that the flow advances to Understand (nav state + canvas mount), not a jump past
      it. BYO Upload/Connect/Email tiles present. Full-bleed (no app chrome).
- [ ] **2.2 Onboarding F2 — Understand / PdfViewer.** Measure the PDF canvas has real
      non-collapsed dimensions (assert rendered width AND height > 0 via `evaluate_script` — the
      24px-collapse trap). Thinking-stream streams staggered, then auto-advances to Extract.
- [ ] **2.3 Onboarding F3 — Extract widget + schema builder.** Fields render with values;
      field add / edit; JSON-render toggle flips output; field-card click → provenance / source
      region highlights (measured box on PDF). Schema-builder rerun path.
- [ ] **2.4 Onboarding F5 — Interact / chat.** Send a message; thinking stream; assistant
      bubble + citation chips render; suggested-action chips drive their action; doc-only canvas
      (no duplicate chat surface). Readable citation snippets (never raw extract-JSON).
- [ ] **2.5 Onboarding — Report render + builder.** SmartReport renders sections; section
      accept / reject mutate state (measured); builder (f4a) edits template; pin→report path.
- [ ] **2.6 Onboarding F7 — Integrate.** Connector cards render; connector controls;
      plugin-download states.
- [ ] **2.7 Onboarding F6 — Sign-up gate.** Gate reveals as a staggered chat moment; three
      doors (magic-link email + send, SSO, book-a-call); value-prop canvas (not a form);
      commit / dismiss; book-a-call card.
- [ ] **2.8 Chat surface (cross-cutting).** Input enter / send / disabled states; thinking
      stream; propose-schema-field card accept / reject; booking-status card.
- [ ] **2.9 Gates.** Open (Save / Export / metered ceiling triggers); commit each method;
      dismiss / back-out; the gate overlay; nav state while gated.
- [ ] **2.10 Citation round-trip.** Chip click → viewer mounts the right doc/page → measured
      highlight lands on real geometry (assert highlight element exists + has non-zero box at
      the expected page); survives refresh.
- [ ] **2.11 Auth.** Login; register; password show / hide toggle (measure input `type` flip);
      reset-password; claim / anon→authed flip (session re-key, state preserved).
- [ ] **2.12 Steady mode.** Workspaces / projects nav; the same production widgets
      (PdfViewer · Extract · SmartReport · Integrate) on real data — exercise the same controls
      as onboarding and confirm parity (mode prop = steady).
- [ ] **2.13 Debug overlay reset.** Trigger reset → measure ALL session state cleared
      (localStorage, sessionStorage, cookies, in-memory contexts, server session row);
      forward-binding check against `lib/resetExperience.ts` + its test.
- [ ] **2.14 Responsive breakpoints.** Re-run the golden path at desktop AND mobile viewports
      (`preview_resize` / DevTools); measure layout doesn't break (no overflow, controls
      reachable).
- [ ] **2.15 Reduced-motion.** With `prefers-reduced-motion: reduce`, confirm staggered reveals
      degrade to crossfade / instant and no animation blocks interaction.
- [ ] **2.16 Console + network sweep.** Across every pass, capture console errors and failing
      network responses; any uncaught error or non-2xx on a happy path is a defect row.
- [ ] **Adversarial review (run PER PASS, 2.1–2.16, before that pass is `[x]`):** for the pass
      just finished, falsify the verdict against the inventory rows for that surface AND the
      real component code — confirm EVERY control on the surface was actually driven and that
      each verdict cites a measured value (rendered px / visibility / attribute / scroll /
      network body / console / a11y node), not a screenshot glance. A pass that only
      screenshotted, or skipped a control (incl. disabled/back-out/error states), is NOT done →
      reopen it. No control silently dropped because it was "obviously fine."

## 3 — Defect log

- [ ] Author `defect-log.md` in this change dir. One row per defect:
      `id · surface · control · measured actual · expected · severity · status`. Severity
      P1 (broken / data-wrong / blocks path) · P2 (visible wrong) · P3 (polish). Status:
      `open → test-written → fixed → reverified` or `triaged-ticketed`.
- [ ] Every audit pass in §2 feeds this log; a pass is not "done" until its controls are all
      either `pass` (with measured value) or a logged defect row.
- [ ] **Adversarial review:** reconcile the defect log against every §2 pass's measured output —
      confirm no measured-wrong observation was quietly dropped, every row's `measured actual`
      is a real captured value (not paraphrase), and severity is defensible (a path-blocking or
      data-wrong finding is not filed P3). Confirm the log accounts for EVERY inventory row.

## 4 — Fix loop (per defect)

- [ ] For each P1/P2 defect, in severity order, WIP ≤3: write a **failing** regression test
      that reproduces the measured wrong behavior (view test / widget test / round-trip;
      browser-measured where a unit test can't reach it).
- [ ] Implement the minimal fix; honor the drift guards (no hardcoded styles), the widget
      contract, and the composable-over-forked principle.
- [ ] Re-verify live with a fresh measured pass on the actual surface (not just the unit test);
      flip the defect-log row to `reverified` with the new measured value.
- [ ] **Adversarial review (per defect, before marking the row done):** review the fix against
      the plan AND the real code. Concretely: (a) revert the fix and confirm the regression test
      genuinely FAILS without it (a test that passes on the unfixed code proves nothing — it is
      not a regression test); (b) confirm the fix did not break a sibling interaction on the
      same surface — re-drive the adjacent controls and the nearest shared widget consumer (e.g.
      the steady-mode mount of the same widget) and confirm they still measure correct; (c)
      confirm the fix honors the drift guards / widget contract / composable-over-forked rule
      and adds no dormant or spec-only plumbing.
- [ ] Any defect out of scope to fix here → triage: open an OpenSpec change ticket or
      `spawn_task`, set the row to `triaged-ticketed` with the ticket reference. No stale /
      dormant code left behind.

## 5 — Closeout

- [ ] Every interaction-inventory row exercised with measured evidence (no unexercised path).
- [ ] Defect log has NO `open` rows — every defect is `reverified` or `triaged-ticketed`.
- [ ] Visual + functional bar met: the golden path + steady path render correctly at both
      viewports with measured-correct controls; corroborating screenshots attached.
- [ ] `npm test` (app + middleware suites) green; drift guards green; `npm run build` green.
- [ ] `openspec validate 2026-05-31-e2e-experience-audit --strict` passes.
- [ ] **Adversarial review (final gate, before archive):** confirm every §2 pass and every §4
      fix carries its own passed review (no pass marked done on screenshots alone, no fix marked
      done without the revert-the-fix red check). Re-confirm the defect log has zero `open` rows
      and every `triaged-ticketed` row names a real ticket / spawned task. Only then archive.
- [ ] Archive the change.
