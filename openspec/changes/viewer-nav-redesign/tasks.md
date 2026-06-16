# Tasks — viewer-nav-redesign

Execution discipline (per `docs/agents/discipline.md` §9–11):

- **TDD** — each implementation task starts with a failing test.
- Each task is tagged **SEQUENTIAL** (causal chain).
- Each task ends with an **adversarial review gate** that MUST include a **reuse /
  duplication check** — before adding ANY mapping, helper, constant, type, hook,
  prop, slot, or test file, grep for an existing one and reuse it. A second copy
  of existing logic is a one-source violation even when the plan is internally
  consistent.
- Node 20: `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`; rebuild
  `@groundx/shared` if its `src` changed. From `scaffold/`. App tests:
  `npm --workspace app test`.

---

## Task 1 — Cornerstone failing test (ONBOARDING content) · SEQUENTIAL

**Files:** `app/src/components/layout/ScopedCanvas/ScopedCanvas.navcontent.test.tsx` (create)

- [ ] **Step 1: Write the failing test** for onboarding surfaces (TARGET per
  `viewer-nav-audit.md`). Eyebrow assertions check the VALUE (the eyebrow renders
  uppercase via CSS `text-transform`, so the DOM text is mixed-case):
  - `doc-viewer` Understand → eyebrow value `Understand`; while `scanning`, the
    frame's loading strip label = `Reading the document — mapping each table, paragraph, and figure on the page.`
  - `interact-chat` → eyebrow `Analyze`, title `Interact`
  - `integrate` → eyebrow `Integrate`, title `Connect`
  - `report` → eyebrow `Analyze`
  - sign-up overlay → eyebrow `UNLOCK THE FULL WORKSPACE`
  (Steady + document-name assertions land in Task 5.)
- [ ] **Step 2: Run; verify it FAILS** for the right reason (today shows
  `Document viewer`/`Integrate`/`Save your work`).
- [ ] **Step 3: Commit.**

**Adversarial review gate:** Fails for the right reason; asserts eyebrow VALUES
(not CSS-uppercased literals); matches the audit; queries user-visible text.

---

## Task 2 — Map existing infrastructure + Visual/UX layout design (Chrome DevTools) · SEQUENTIAL

No production code. Outputs into `design.md` + `.review-artifacts/viewer-nav/`.

**(a) Infrastructure map — REUSE-first (re-verify before code):**

- [ ] Enumerate every shell mounting `<ScopedCanvas>` (`OnboardingShell`,
  `SteadyShell`, `ScopedConversationShell`) — confirm none missed.
- [ ] Confirm the nav's onboarding-vs-steady toggle is distinct from
  `chatExperienceRegistry` (different concern) — a minimal `experience` prop.
- [ ] Confirm `framePropsFromDescriptor` is unused (dead) → resolver replaces it.
- [ ] Confirm the document-name sources: scenario (`scenario.documents[].fileName`)
  for onboarding; `DocumentsContext` `selectedDocument`/`documents[]` for steady
  (no per-id cache — reuse loaded state, do NOT fetch per render).
- [ ] Confirm the frame's `loading`/`status` strip is the home for the processing
  line (not a new subtitle path). DECIDED 2026-06-16: the line and the existing
  F2 scanner (PdfViewer's dim veil + sweep) COEXIST — both show; scanner left as-is.
- [ ] Confirm `Label` eyebrow uppercases via CSS (values stored mixed-case).
- [ ] Confirm `VIEWER_STEP_KIND_TO_STEP_ID` lives in OnboardingShell (to move).
- [ ] Confirm the steady eyebrow stays EMPTY (per decision + `task_3c2aace6`); no
  scope-name resolution is built here.

**(b) Layout design via Chrome DevTools (app on 5173 + 3001):**

- [ ] Capture the CURRENT nav on every rendered surface across all THREE shells;
  measure header height, line stack, back-button gap.
- [ ] Document the four problems with measurements.
- [ ] Produce the target layout in `design.md` §5 — single-row when no subtitle;
  eyebrow inline kicker; back-button separation; the `loading`/`status` strip
  placement; responsive ≤760px + wide; chrome tokens; annotated before/after.

**Adversarial review gate:** Infra map names all 3 shells + the dead helper + the
loading slot + the doc-name sources + the eyebrow CSS behavior, and the design
REUSES them. Layout addresses all four problems with measured targets, buildable
from existing primitives + tokens.

---

## Task 3 — Shared journey catalog + consolidate kind→step map + guard · SEQUENTIAL

**Files:** Create `journeyCatalog.ts` + `journeyCatalog.test.ts`; **extend** the
existing `app/src/test/recurrence-drift-guards.test.ts` (drift-guard home — do NOT
create a new guard file); Modify `OnboardingShell.tsx` (labels, `analyzeSubsteps()`,
**delete** local `VIEWER_STEP_KIND_TO_STEP_ID`).

- [ ] **Step 1: Failing tests.**
  - `journeyCatalog.test.ts`: catalog per `design.md` §3 incl.
    `VIEWER_STEP_TO_JOURNEY["interact-chat"] === { step:"analyze", substep:"interact" }`.
  - In `recurrence-drift-guards.test.ts`, ADD a guard: the step labels AND the
    kind→step map exist ONLY in `journeyCatalog.ts` (grep app source; fail on a
    second literal copy). Initially fails (OnboardingShell still holds copies).
- [ ] **Step 2: Run; verify FAIL.**
- [ ] **Step 3: Implement** catalog + `VIEWER_STEP_TO_JOURNEY`; refactor
  OnboardingShell labels + `analyzeSubsteps()`; delete the local map; point
  `currentStep` at the catalog map.
- [ ] **Step 4: Run; verify PASS;** `StepStrip.test.tsx` + OnboardingShell green.
- [ ] **Step 5: Commit.**

**Adversarial review gate:** Guard green AND meaningful (re-add a copy → red). No
second label table or kind→step map. Reuses `StepId`/`AnalyzeSubstep`.

---

## Task 4 — Nav context + resolver; DELETE the dead merge helper · SEQUENTIAL

**Files:** Create `viewerNavContext.ts`, `resolveViewerNav.ts`,
`resolveViewerNav.test.ts`; Modify `viewerFrameDescriptor.ts` (**delete**
`framePropsFromDescriptor`).

- [ ] **Step 1:** Confirm `framePropsFromDescriptor` is referenced nowhere; write
  the failing `resolveViewerNav.test.ts` per `design.md` §2: onboarding arm
  (eyebrow value from catalog, substep/doc-name title); **steady arm → NO eyebrow**,
  title = documentName for doc-viewer else `defaults.title`; overlay → defaults
  passthrough; fallback + chrome/contentMode-from-defaults.
- [ ] **Step 2: Run; verify FAIL.**
- [ ] **Step 3: Implement** the union + pure resolver (`switch` `never` default);
  **delete** `framePropsFromDescriptor`.
- [ ] **Step 4: Run; verify PASS;** full suite green (nothing used the dead helper).
- [ ] **Step 5: Commit.**

**Adversarial review gate:** Resolver pure (no React/DOM/fetch/host import).
Exhaustive. Steady arm yields no eyebrow. No journey strings duplicated from the
catalog. Dead helper gone.

---

## Task 5 — Document name + wire ALL THREE shells + processing line + content · SEQUENTIAL

**Files:** Create `useDocumentName.ts` + test; Modify `ScopedCanvas.tsx` (+test),
`OnboardingShell.tsx`, `ScopedConversationShell.tsx`, `SteadyShell.tsx`, the four
canvas `*.tools.ts` (Extract/Integrate/SmartReportRender/SmartReportBuilder),
`viewerOverlayFrameDescriptors.ts`. Extend the cornerstone with steady + doc-name.

- [ ] **Step 1: Failing tests.**
  - `useDocumentName.test.ts`: resolves from the scenario in onboarding and from
    `DocumentsContext` `selectedDocument`/`documents[]` in steady (placeholder
    `"Document"`); does NOT call `getDocument` per render.
  - Extend cornerstone: steady `extract-workbench` (via `ScopedConversationShell`)
    → **NO journey eyebrow** (empty); doc-viewer title = resolved document name
    (not "Document viewer"); Understand `scanning` → frame `loading` label set.
- [ ] **Step 2: Run; verify FAIL.**
- [ ] **Step 3: Implement.** Add `useDocumentName` (reuse scenario / DocumentsContext
  state). Add `experience: "onboarding" | "steady"` to `ScopedCanvasProps`; build
  the ctx; pass `loading={{label: INGEST_LIVE_LABEL}}` when the onboarding
  doc-viewer step is `scanning`; render via the resolver. Pass `experience` from
  ALL THREE shells (`"onboarding"` / `"steady"` / `"steady"`). Route overlays via
  the resolver. **Remove the now-unused journey-word `eyebrow`** from the four
  canvas `*.tools.ts`; set Integrate title `Connect`. Update the sign-up overlay
  descriptor (`UNLOCK THE FULL WORKSPACE` / `Create your account`).
- [ ] **Step 4: Run.** Full cornerstone PASSES. Whole app suite green.
- [ ] **Step 5: Commit.**

**Adversarial review gate:** Cornerstone green for the right reason. ALL THREE
shells pass `experience` (grep proves none missed). Steady shows NO journey word.
Processing line uses the EXISTING `loading` slot (grep proves no new subtitle
path). `useDocumentName` reads existing state (no per-render fetch). The removed
canvas eyebrows are truly unused (resolver overrides/empties them). Overlays keep
back button + (book-call) loading/status.

---

## Task 6 — ViewerWidgetFrame layout redesign · SEQUENTIAL

**Files:** Modify `ViewerWidgetFrame.tsx`; extend `ViewerWidgetFrame.test.tsx`.

- [ ] **Step 1: Failing test** per `design.md` §5: single row when no subtitle;
  eyebrow+title share a row; back-button separator/gap when `closeAction` set; the
  `loading`/`status` strip still renders below the header; spacing via tokens.
- [ ] **Step 2: Run; verify FAIL.**
- [ ] **Step 3: Implement** compact layout + back-button separation; chrome tokens
  + existing primitives only.
- [ ] **Step 4: Run; verify PASS;** `no-hardcoded-styles` green; cornerstone green.
- [ ] **Step 5: Commit.**

**Adversarial review gate:** Measured vs Task 2 targets. `no-hardcoded-styles`
green, NO new exemption. Frame stays presentational. Subtitle-absent single-row;
present ≤2 rows. The loading/status strip still works.

---

## Task 7 — Remove GateValueProp · SEQUENTIAL

**Files:** Delete `components/viewer-widgets/GateValueProp/` (4 files); Modify
`test/viewer-widget-shell-contract.test.ts:232` + `test/recurrence-drift-guards.test.ts:93`.

- [ ] **Step 1:** `grep -rn "GateValueProp" app/src | grep -v GateValueProp/` → only the 2 guards.
- [ ] **Step 2:** Delete the folder; remove both guard references (no legacy note).
- [ ] **Step 3: Run** full app suite; green.
- [ ] **Step 4: Commit.**

**Adversarial review gate:** `grep -rn GateValueProp app/src` returns nothing. No stub/dangling ref. Suite green.

---

## Task 8 — Comprehensive Chrome DevTools verification (post-impl) · SEQUENTIAL

**Files:** `.review-artifacts/viewer-nav/after/`.

- [ ] **Step 1:** Walk every rendered surface across all THREE shells (onboarding
  Understand [+ scanning loading strip] / Interact / Extract / Report / Builder /
  Integrate; sign-up + book-call overlays; a `/workspaces` + `/projects` surface
  [eyebrow EMPTY]; a `/c/` bare surface). Screenshot each.
- [ ] **Step 2:** Verify content matches the TARGET tables (steady eyebrow empty;
  resolved document names) and layout matches `design.md` §5.
- [ ] **Step 3:** Responsive ≤760px + wide; no tall wrap/overflow. Before/after.
- [ ] **Step 4:** File any defect as a follow-up task (no silent pass).

**Adversarial review gate:** Every surface + all three shells verified;
screenshots attached; four problems gone; steady eyebrow empty; doc names resolve;
responsive holds.

---

## Task 9 — FINAL whole-plan adversarial review + closure · SEQUENTIAL

- [ ] **Step 1: Whole-plan adversarial review** vs plan AND real code: falsify
  each claim; no dormant/no-op plumbing; **reuse audit** — one catalog for
  labels+mapping; resolver is the sole merge path (dead helper deleted); processing
  line uses the existing `loading` slot; doc name reuses existing state; all 3
  shells wired; guard lives in `recurrence-drift-guards.test.ts`. Confirm the two
  deferred items are the ONLY ones and both tracked: citation-peek
  (`task_023d7546`) and the steady-eyebrow name (`task_3c2aace6`).
- [ ] **Step 2: Validate** `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json`.
- [ ] **Step 3: Suites green** — shared build, `npm --workspace app test`, `npm --workspace middleware test`.
- [ ] **Step 4: Durable spec** reflects shipped behavior; archive on ship.
- [ ] **Step 5:** Remove inline `TODO(viewer-nav-redesign)`; `viewer-nav-audit.md` matches shipped strings.

**Gate (final):** All pass. Any earlier gate that fails re-inspection reopens.
The change does not close until this review passes end-to-end.
