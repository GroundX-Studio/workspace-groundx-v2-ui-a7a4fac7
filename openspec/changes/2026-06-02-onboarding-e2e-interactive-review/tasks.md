# Tasks — onboarding E2E interactive review

Sequential. Each surface task uses the **shared inspection protocol** (below) and
ends with an **adversarial review gate** before the next task starts. Findings are
NOT fixed here — they're captured (repro + evidence) and filed as GitHub Issues in
T9. A finding is only logged after the gate confirms it's a REAL defect (not
live-data / LLM variance / environment), with evidence.

**Shared inspection protocol (every surface):**
1. `take_snapshot` → enumerate EVERY interactive node (button/link/input/tab/chip).
2. `click`/`hover`/`fill` each one. After each interaction:
   - `list_console_messages` → no NEW error/warning.
   - `list_network_requests` → no unexpected 4xx/5xx/failed/hung request.
   - `evaluate_script` → DOM checks: no horizontal overflow
     (`scrollWidth-clientWidth<=1`), no zero-size/clipped/overlapping interactive
     elements, sane computed styles.
   - screenshot → eyeball for visual defects (alignment, spacing, contrast,
     truncation, broken images, z-index).
3. Record candidate findings with: surface, viewport, exact repro, evidence
   (screenshot + console/network excerpt), `bug` vs `visual`, severity guess.

## T0 — Environment + element inventory (SEQUENTIAL)

- [ ] Port hygiene (`:3001`/`:5173` free; stop stray Claude_Preview).
      `preview_start` frontend + middleware; confirm `/api/healthz` + the app load.
- [ ] Attach Chrome DevTools MCP; `navigate_page` `/onboarding`; confirm a CLEAN
      console/network baseline (record any boot-time noise to subtract later).
- [ ] Decide the screenshot mechanism: try Chrome DevTools `take_screenshot`;
      if it times out, lock `Claude_Preview` `preview_screenshot` as the tool.
- [ ] Build the **surface × element inventory** (snapshot-driven) cross-checked
      against the router (`routerPaths`) + the step-strip frames (F1–F7) +
      compact-mode controls — the checklist every later task covers against.
- **Gate:** servers healthy; baseline captured; screenshot tool chosen; inventory
  complete (no surface/route/control missing vs router + frames + compact set).

## T1 — F1 Ingest picker (SEQUENTIAL)

- [ ] Sweep every F1 control (desktop): sample card + capability badges (hover),
      `byo-pdf`/`byo-url`/`byo-folder` tiles, connector logos, headings/copy, nav
      rail entries (Workspaces/Projects disabled, Docs, Settings, Book-a-call,
      Back-home), step-strip pills + locked-state titles/tooltips.
- **Gate:** every F1 element exercised vs inventory; each candidate finding
  reproduced + evidenced + classified; false positives (data/LLM) discarded.

## T2 — F2 Understand (SEQUENTIAL)

- [ ] Pick the sample → inspect the thinking-stream bubbles, the PDF reading
      scanner (overlay + sweeping beam), page thumbnails, the F1→F2 zoom, and the
      auto-advance to F3. Watch console/network during the live xray/extract load;
      check for jank / layout shift / stuck animation.
- **Gate:** as above; confirm scanner + auto-advance behave; timing issues are
  real (not just slow live data).

## T3 — F3 Extract workbench (SEQUENTIAL)

- [ ] Sweep: every `field-row-*` (click → provenance panel "page N" citations),
      citation chips, category tabs, topbar (`back`/`rerun`/`save`[disabled-anon]/
      `export`[locked]), `extract-unlock-banner`, pinned-samples row (add/remove/
      category), pick-a-view pills, any render-mode toggle. Verify live extract
      data actually renders (rows + values + chips).
- **Gate:** every control exercised; provenance peek shows real citations;
      findings real + evidenced.

## T4 — F4 / F4a Report (SEQUENTIAL)

- [ ] Report pill → render surface (sections, cite chips, export) → builder
      (proposal cards, pin, save[gated], render toggle). Trigger a live report
      render; inspect sections + citations + visual.
- **Gate:** controls exercised; live render completes or its failure is a real
      bug (not transient); findings evidenced.

## T5 — F5 Interact (SEQUENTIAL)

- [ ] Chat input + send a real question (live LLM); suggested seeds/actions; cite
      chips → click → PDF lit-region jump; long-answer scroll; any error/empty
      state. Run 2–3 prompts to separate LLM variance from real defects.
- **Gate:** controls exercised; cite-jump works; LLM-variance explicitly excluded
      from findings.

## T6 — F6 Gate + BYO entry (SEQUENTIAL)

- [ ] Open the gate BOTH ways: anon `extract-unlock-banner` AND `byo-pdf` →
      `/onboarding/signup`. Sweep: `gate-rail-email` + `send-magic-link`
      (→ committed → continue where present), `sso`, `book-call`, `keep-exploring`
      dismiss; the "Why GroundX" value-prop canvas. Visual + console/network.
- **Gate:** both entry paths + every gate control exercised; findings evidenced.

## T7 — F7 Integrate (SEQUENTIAL)

- [ ] Inspect the F7 surface (known stub): what renders, any controls, console.
      Confirm + cross-reference Issue #4 (don't file a duplicate; note any NEW
      defect beyond "it's a stub").
- **Gate:** confirmed; no duplicate of #4; any net-new defect captured.

## T8 — Cross-cutting + responsive (SEQUENTIAL)

- [ ] Step-strip state machine across frames (click pills; locked/active/reachable
      states). Nav-rail interactions. **Responsive:** re-sweep the key surfaces at
      tablet (820) + mobile (390) — compact topbar, nav drawer (open/backdrop/
      close), view-swap pill (chat↔canvas), and **zero horizontal overflow** at
      each viewport. Reduced-motion (`emulate`). Back-out/dismiss paths (LC5).
      Debug-overlay reset (DBG-01) clears state.
- **Gate:** every viewport + cross-cutting control exercised; overflow checked at
      all three sizes; findings evidenced.

## T9 — Synthesize + file findings (SEQUENTIAL)

- [ ] Dedupe + severity-rank all findings; reproduce each once more; capture final
      evidence. Create review labels (`visual`, `area:onboarding`,
      `severity:high|med|low` — confirm naming first). File one GitHub Issue per
      confirmed finding (`bug`|`visual` + area + severity + repro + screenshot).
- [ ] `testing-suite` spec delta applied; `openspec validate --strict`.
- [ ] Final report: coverage table (surface × viewport, all ✓) + the filed-issue
      list with numbers.
- **Gate:** adversarial completeness review — EVERY surface in the T0 inventory
      was covered at every viewport (no silent skip); EVERY filed issue is real +
      reproducible + evidenced + correctly labeled; no duplicate of an existing
      open issue (#1–#6); LLM/data variance excluded. Then commit + archive.

---

## Execution results (pass 1 — 2026-06-02, anonymous, Chrome DevTools MCP)

- **T0–T8 executed; T9 filed findings as GitHub Issues.** Chrome DevTools MCP
  worked for ALL inspection (navigate/snapshot/click/evaluate/console/network/
  screenshot/resize); no screenshot fallback needed. Server launch via
  Claude_Preview `preview_start` + `preview_logs` (by design, not a CDT failure).
  Servers: frontend on IPv6 `localhost:5173` (NOT `127.0.0.1`), middleware 3001.
- **Findings filed:** #7 (P1 chat 502 — RBAC+scope `projectId` filter composes to
  an invalid GroundX query; bug/severity:high/area:conversation), #8 (anon session
  bootstrap 401+404 on load; bug/severity:low/area:conversation), #9 (F2 reading
  beat too brief / canvas-chat desync; visual/severity:low/area:onboarding).
- **Reviewed clean:** F1 picker (desktop+compact), F2, F3 Extract (+provenance,
  citations, disabled topbar), F4 Report (graceful empty state), F6 Gate (open via
  unlock banner, magic-link rail + value prop, dismiss/restore), responsive at
  820 + ~500 (compact mode, no overflow).
- **NOT covered this pass (honest gaps):** F5 Interact answer + cite-jump
  (BLOCKED by #7 — re-review after fix); F7 Integrate (gated stub, issue #4);
  nav-rail Docs/Book-a-call/Back-home clicks, step-strip full state machine,
  debug-reset (DBG-01); true 390px mobile (resize_page clamps to ~500 window-min).
  A pass-2 should cover these once #7 is fixed.
- Evidence (screenshots) in `.review-artifacts/` (gitignored). Decision per user:
  **"keep reviewing, fix later"** — findings filed, not fixed in this effort.
