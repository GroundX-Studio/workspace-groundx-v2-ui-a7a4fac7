# Tasks — standardized-viewer-control

One change (owner decision). Ordering: T2–T5 are the foundation; T6 is the large
frame-retirement migration (WORKFLOW over the 36 `advanceFrame` sites) and carries
the frame-coupled dependencies (LLM context, persisted snapshot, intent corpus);
T7–T9 build the affordance surface; T10–T12 lock the guarantees. Every task closes
only after its adversarial review gate passes against the plan AND the real code.

## T1 — Cornerstone failing test (user-visible) · SEQUENTIAL

- [ ] Full-shell test: from a NON-Extract view with the onboarding pick-a-view
      pills present, clicking "Meters" switches the canvas to Extract focused on
      Meters; clicking "Charges" while already on Extract re-focuses live (no
      remount). Assert it FAILS today.
- **Gate:** red for the documented reason; asserts user-visible canvas state.

## T2 — Shared contract + intent catalog (`@groundx/shared`) · SEQUENTIAL

- [ ] Add `showInteract` to `canvasIntentSchema`; add optional `focusedCategoryId`
      to `showExtract`; add optional `anchor` to the `suggestedActions` entry shape;
      add an optional `offerAs: { label, anchor? }` to the navigation tool input
      schemas. Remove `switchFrame`. Update the shared `intentCatalog`: drop the
      `switchFrame` entry, add `showInteract` with its `llm` coverage prompt, and
      mark offer-eligibility (intentBuilder + llm-emittable).
- **Gate:** `npx tsc --noEmit` clean across workspaces; `parseCanvasIntent`
      round-trips the new kinds; no `switchFrame` reference remains in shared.

## T3 — Frame-free journey-progress source · SEQUENTIAL

- [ ] `currentStep`, `completedSteps`, and `analyzeSubsteps` are ALL frame-derived
      today (`FRAME_TO_STEP[currentFrame]`, `completedFrames`→`FRAME_TO_STEP`,
      `analyzeSubsteps(currentFrame)`). Keep the strip's consumer shape
      (`JOURNEY_CATALOG`/`pillState`/`StepDescriptor`) but re-source it: the current
      stage already derives from the active step kind via the existing
      `VIEWER_STEP_TO_JOURNEY` map (`OnboardingShell.tsx:199–203`, frame is only a
      fallback) — REUSE it, drop the fallback; the reached-set from a small
      **persisted stage watermark** (T6b) incremented on dispatch only on a
      first-time reach. Only `completedSteps` + `analyzeSubsteps` are fully
      frame-derived. Preserve the `analyzeReached` rule (a citation jump must not
      re-lock a traversed bracket) and the existing jump-ahead regression test.
- **Gate:** the strip + gating read no frame value; the watermark increments only on
      a first reach; the jump-ahead regression test asserts the same user-visible
      gating and is green; the citation-jump-no-relock behavior is covered.

## T4 — On-step sub-position (ViewerStep + ScopedCanvas + Extract) · SEQUENTIAL

- [ ] Carry `focusedCategoryId` on the `extract-workbench` step; forward it (and
      `report.selectedSectionId`) from `ScopedCanvas` to the widget. Rewire Extract
      to read focus from props; delete `schemaOverlay.focusedCategoryId`, its
      `setFocusedCategory` callers, and the `?focus` reads. Add the
      mutate-active-step (in-place) action used by sub-position changes.
- **Gate:** Extract renders focus from the step prop; a focus change mutates the
      active step in place (history length unchanged) and re-focuses live; no
      `?focus` / `schemaOverlay.focusedCategoryId` / `setFocusedCategory` remains.

## T5 — Orchestrator: one outcome, payload honored, journey advance, side effects · SEQUENTIAL

- [ ] Remove the `routeThroughOnboarding` fork for the `show*` / `editTemplate`
      handlers; each pushes/mutates its step honoring the payload (fix `showExtract`
      hardcoded `"utility"`). Add the `showInteract` handler. Dispatch advances
      journey progress (T3). Re-home `advanceFrame`'s non-nav side effects
      (entity-deactivate, gate reset + sign-up overlay pop, understand-completed
      analytics) onto a **first-reach stage transition (onboarding only)** — fired
      only when the stage watermark INCREMENTS, NOT on the raw intent handler, so a
      re-dispatch to a stage already reached (category re-focus, an offered or
      step-strip jump) does not re-fire them.
- **Gate:** `showExtract` honors scope/schemaId/focusedCategoryId in both
      experiences; no hardcoded scenario id; the re-homed side effects fire only on a
      first-time stage reach and do NOT re-fire on a re-dispatch to a reached stage.

## T6 — Migrate the 36 `advanceFrame` call sites · WORKFLOW (gated per unit)

- [ ] Per production unit that calls `advanceFrame` (Extract, SmartReportBuilder,
      SmartReportRender, SignUpWidget, Integrate.tools, OnboardingShell + its URL
      effect, the pick-a-view pills), replace `advanceFrame(frame[, opts])` with the
      corresponding dispatched intent. After the last unit, delete `advanceFrame`,
      `currentFrame`, `frameToStepStandalone`, and `completedFrames`. Note: the
      shared widgets' `advanceFrame` is a no-op in steady today (`?? (() => undefined)`),
      so the dispatched replacement makes those navigations FUNCTIONAL in steady —
      add steady coverage for them (a positive behavior change, not silent).
- **Gate (PER UNIT):** the unit changes the canvas only via `dispatch`; its tests
      are green (incl. steady for shared widgets); cross-unit collision check on
      shared files; after the last unit no `advanceFrame` / `currentFrame` /
      `frameToStepStandalone` / `completedFrames` symbol remains.

## T6b — Frame-coupled cross-cutting migrations · SEQUENTIAL (each its own gate)

- [ ] **LLM context:** replace `lastFrame` + `completedFrames` in the chat-request
      entity snapshot with the journey stage + active step kind. **Gate:** the
      snapshot carries no frame value; the middleware request validation accepts it.
- [ ] **Persisted snapshot:** replace `lastFrame` with a persisted **active viewer
      step** (kind + payload) as the resume anchor, restored VERBATIM on hydrate (NOT
      a watermark — preserve the documented no-stale-resume rule); replace
      `completedFrames`/`completedFramesJson` with a small **stage watermark** used
      only for checkmarks. Update `parseChatStoreSnapshot`, the ChatStore
      serialize/parse + hydrate path, and EntitySessionStore. **Gate:** a returning
      user resumes on their last view verbatim; no `lastFrame`/`completedFramesJson`
      remains; the snapshot round-trips the active step + watermark.
- [ ] **Intent corpus + `intentCatalog`:** remove the `switchFrame` fixture (and its
      `suggest_intent` trigger) from `intentFixtures/fixtures.tsx`; add a
      `showInteract` fixture + its `intentCatalog` `llm` prompt. **Gate:** the replay
      + key-gated live-coverage suites are green; no `switchFrame` in the catalog.
- [ ] **`frame-advanced` viewer-event:** migrate `viewerEventActionSchema` + its
      `app.ts` validation + the `apiRouteContract` test to a stage/step action.
      **Gate:** no viewer-event action is `frame-advanced`; the contract test asserts
      the new action.

## T7 — `offerAs` disposition (middleware + app mirror) · SEQUENTIAL

- [ ] Add optional `offerAs: { label, anchor? }` to the navigation tools' input
      schemas, each with a `.describe(...)`; route a call carrying `offerAs` to a
      `suggestedActions` entry (validated intent via the tool's `intentBuilder` +
      label + optional anchor) instead of auto-dispatch; absence auto-dispatches per
      category. The `intentBuilder` MUST ignore `offerAs` (it never enters the
      intent). Gate offer-eligibility on `intentCatalog` (intentBuilder +
      llm-emittable). Add the interact navigation tool (emitting `showInteract`).
      Remove `suggest_intent` (a general any-frame navigator) and any `switchFrame`
      emission — first confirm every destination it served maps to a per-destination
      intent (f3→`showExtract`, f4→`showReport`, f5→`showInteract`, f7→`showIntegrate`;
      f1/f2 need none), so nothing is orphaned.
- **Gate:** `catalog-parity.test.ts` + `check-tool-quality` green with
      `ALLOWED_VERBS` UNCHANGED (no new verb) and `.describe()` on `offerAs`; the
      built intent contains no `offerAs`; an `offerAs` on a UI-only intent yields no
      suggested action; no `suggest_intent` in the catalog.

## T8 — Affordance rendering: extend `suggestedActions` (pill + inline) · SEQUENTIAL

- [ ] Render a `suggestedActions` entry as a pill (no `anchor`) via the existing
      chip rendering, or, with `anchor`, as inline clickable text via a remark plugin
      that **shares the `answerSpan` alignment helper extracted from
      `citationFootnotes.ts`** (do not duplicate it), first occurrence; fall back to a
      pill when the phrase is not found. Inline anchoring is navigation-only; mutate
      and UI-driven actions (e.g. "show all sources", client-built intent) render as
      pills. One list; click dispatches through the orchestrator with `source: "user"`.
      Failing-test-first per render path + the fallback.
- **Gate:** inline-wrap, missing-anchor-falls-back-to-pill, no-anchor-pill, and the
      citation+anchor coexistence in one Markdown render all tested; clicking
      dispatches through the orchestrator; no free-form-text intent built; the
      answerSpan helper is shared, not copied.

## T9 — Pick-a-view pills + auto-advance via the standard · SEQUENTIAL

- [ ] Make the onboarding pick-a-view pills (the existing `PickViewPill`) dispatch
      `showExtract` with `focusedCategoryId` directly through the orchestrator; keep
      per-category. Confirm the auto-advance-on-"Done" dispatches `showExtract`.
- **Gate:** the cornerstone (T1) is GREEN — works from another view + live re-focus;
      pills route through `dispatch`; no `?focus` carrier remains.

## T10 — Structural encapsulation + guard · SEQUENTIAL

- [ ] Confine the viewer-step mutators so they are reachable only from the
      orchestrator module (no re-export to component/view/experience modules). Add a
      guard test that fails if any production module outside the orchestrator
      references a step mutator, or if an `advanceFrame` / `currentFrame` /
      `switchFrame` / `completedFrames` symbol exists.
- **Gate:** the guard passes and genuinely fails on a planted violation (prove it).

## T11 — Drift guards + full verification · SEQUENTIAL

- [ ] `npm --workspace app test` + the middleware suite green (incl. the intent
      replay + key-gated live-coverage suites); `npx tsc --noEmit` clean (app +
      middleware + shared); no-hardcoded-styles + widget-contract + catalog-parity +
      check-tool-quality green; `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1
      validate standardized-viewer-control --strict --json` passes.
- **Gate:** all green; the real typecheck (`tsc --noEmit`, not the no-op script).

## T12 — Whole-plan adversarial review · SEQUENTIAL

- [ ] One hostile review against the plan AND the code: every `show*` produces one
      outcome; no frame vocabulary remains anywhere (incl. the LLM context + the
      persisted snapshot + the intent corpus); affordances are server-validated and
      share one `suggestedActions` list; the seam is the sole viewer-mutation path;
      the cornerstone + a Chrome DevTools spot-check pass on the live preview.
- **Gate:** review passes; any finding returns the relevant task to in-progress.

## Deferred (tracked, not in this change)

- Per-category pills as a general/steady pattern at arbitrary schema cardinality;
  outside onboarding, category navigation lives inside the Extract widget.
- Persisted-intent data migration is NOT required (pre-launch; `parseCanvasIntent`
  degrades unknown kinds to null).
