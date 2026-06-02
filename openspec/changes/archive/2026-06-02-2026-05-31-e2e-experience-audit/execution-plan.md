# Execution plan — fix ALL e2e-audit defects (2026-06-01)

Closes the five live-audit defects (DL-1..DL-5). **Sequential, WIP=1, checkpoint between
each** (per the standing cadence). Every task: **failing test first → minimal fix →
live re-verify on the real surface → per-task adversarial review (Discipline §10) → flip
the defect-log row to `reverified`.** Two P1s have their own OpenSpec changes; the three
small ones are handled in this audit change's §4 fix loop (each still gets a regression
test). Pre-flight every task: node v20 on PATH, harness up on REAL GroundX, baseline
`npm test` + drift guards + `npm run build` green.

Order is by priority then dependency. DL-5 first because it unblocks the LIVE end-to-end
re-verification of DL-1 (chat answer → citation → source mount needs a working canvas).

---

## Task 1 — DL-5 (P1): steady shell canvas mounts the production widgets
**Change:** `2026-06-01-steady-canvas-mount` (authored + validated). **Unblocks:** live
2.4 (chat→source), 2.10 (chat-path round-trip), 2.12 (steady widget parity).

1. **Failing test:** shell-integration test on `ScopedConversationShell` — dispatch
   `highlightCitation` (or click a rendered `CiteChip`) → assert `pdf-viewer-widget`
   mounts in `scoped-shell-canvas-pane`. Confirm RED against the stub canvas.
2. **Fix:** replace the empty `<Box>` canvasPane with `<ScopedCanvas step={activeStep}
   scope={scope} role={role} />`, reading the active viewer step from the same
   ChatStore/orchestrator source `OnboardingShell` uses; keep the idle state + testid.
3. **Live re-verify (/workspaces):** cite-chip click + "Show source" + Extract/Report
   pick-view each mount the production widget on real data (measured non-zero dims).
4. **Adversarial review:** revert → test RED; onboarding canvas (F2/F3/F5) still mounts;
   no direct viewer-widget import (registry ban holds); no fork/dormant plumbing; guards
   + build green. → flip DL-5 `reverified`.

## Task 2 — DL-1 (P1): document-scoped chat RAG returns 0 snippets
**Change:** `2026-06-01-projects-rbac-scope-filter` (authored). **Lead:** the SAME query
works at BUCKET scope, fails at single-DOC scope → the bug is in the document-narrowed
search request/filter, not generation.

1. **Reproduce + failing test:** offline ground-truth test — "amount due" over
   `documents:[c3bfff49]` MUST return ≥1 usable snippet; confirm RED.
2. **Root-cause:** diff the search request body (filter / scope / relevance floor)
   bucket-scope vs doc-scope; confirm whether the low-floor retry only fires on
   `rawResults.length === 0` and whether the doc filter suppresses the extract-indexed
   chunks.
3. **Fix:** the minimal correct repair (e.g. low-floor retry condition, or doc-scope
   filter), preferring the composable `groundedAnswerOverScope` seam; no fork.
4. **Re-verify:** offline regression suite green; LIVE onboarding chat answers "amount
   due" with a citation; with Task 1 done, verify the full chat→citation→source mount
   end-to-end.
5. **Adversarial review:** revert → suite RED; bucket-scope path unbroken; no PII-log
   regression (query logging stays per the debug decision); guards + build green. → flip
   DL-1 `reverified`.

## Task 3 — DL-3 (P2): mobile layout did not switch to compact
**In:** this audit change §4. **First action is VERIFY** (suspected `preview_resize`
artifact — desktop worked only after an explicit width set).

1. **Verify:** LOAD the onboarding page at a mobile width (not resize into it) and
   measure `appshell-compact-topbar` present + nav/view toggles. If compact triggers →
   it was a harness artifact: document + close DL-3 as not-a-defect (no code change).
2. **Only if real:** failing test (render at narrow width asserts compact), fix the
   `useMediaQuery` breakpoint, re-verify, review. → flip DL-3.

## Task 4 — DL-2 (P3): React Router v7 future-flag console warnings
**In:** this audit change §4. Trivial.

1. **Failing/guard test:** assert the router is created with the future flags (or assert
   no `v7_` warning on mount).
2. **Fix:** add `future: { v7_startTransition: true, v7_relativeSplatPath: true }` (and
   any other warned flags) to the router config.
3. **Verify:** live console sweep clean. Review: no behavior change to routing. → flip
   DL-2.

## Task 5 — DL-4 (P3): pinned draft not reachable from the Report render
**In:** this audit change §4. **Needs a small design decision first.**

- **Open decision (default proposed):** keep `Pin→template = NO auto` (no auto-open of
  the builder), BUT the Report render's no-content state SHALL surface a reachable entry
  to an existing draft (e.g. a subtle "1 draft started — open builder" affordance / chip)
  so a pinned draft isn't orphaned without an LLM tool-call. Alternative: leave as-is and
  treat the chat "Pinned to a new report draft" line as the only entry (status quo).
- Once decided: failing test (render with a draft present shows the entry / mounts the
  builder on click) → minimal implement → live verify the pin→draft→builder path →
  review. → flip DL-4.

---

## Closeout (after all five `reverified`)
- e2e-audit §5 closeout gate: every blocked surface (2.4/2.10/2.12) re-driven live and
  measured-correct; defect log has zero `open` rows; `npm test` + guards + build green;
  `openspec validate --strict` on all touched changes.
- Archive `2026-06-01-steady-canvas-mount`, `2026-06-01-projects-rbac-scope-filter`, then
  the e2e-audit change — in that order. Publish to dev at the end (or per checkpoints).
