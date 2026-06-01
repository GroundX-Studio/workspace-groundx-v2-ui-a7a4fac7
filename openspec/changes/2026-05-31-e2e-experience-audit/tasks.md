# Tasks — full end-to-end experience audit + remediation (2026-05-31)

Exploratory audit-then-fix. Order: **(1) inventory → (2) per-surface audit passes → (3)
defect log → (4) fix loop → (5) sign-off.** Honor the WIP cap (≤3 in flight). Each confirmed
defect SHOULD get a regression test before its fix. Adversarial review gate after every task.

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

## 3 — Defect log

- [ ] Author `defect-log.md` in this change dir. One row per defect:
      `id · surface · control · measured actual · expected · severity · status`. Severity
      P1 (broken / data-wrong / blocks path) · P2 (visible wrong) · P3 (polish). Status:
      `open → test-written → fixed → reverified` or `triaged-ticketed`.
- [ ] Every audit pass in §2 feeds this log; a pass is not "done" until its controls are all
      either `pass` (with measured value) or a logged defect row.

## 4 — Fix loop (per defect)

- [ ] For each P1/P2 defect, in severity order, WIP ≤3: write a **failing** regression test
      that reproduces the measured wrong behavior (view test / widget test / round-trip;
      browser-measured where a unit test can't reach it).
- [ ] Implement the minimal fix; honor the drift guards (no hardcoded styles), the widget
      contract, and the composable-over-forked principle.
- [ ] Re-verify live with a fresh measured pass on the actual surface (not just the unit test);
      flip the defect-log row to `reverified` with the new measured value.
- [ ] Adversarial review the fix against the plan AND the real code before marking done.
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
- [ ] Archive the change.
