# Proposal — standardized-viewer-control

> **STATUS: ready for review (revised after adversarial review).** All
> brainstorming questions are resolved; the adversarial-review findings are folded
> in (extend `suggestedActions` not a new field; disposition flag not a meta-tool;
> journey-progress consolidates existing step state; the silently-dropped
> dependencies are now explicit scope). Kept as **one change** by owner decision
> (decomposition was considered and declined).

## Steady-first orientation (locked 2026-06-17)

**The authenticated/steady experience is the product; onboarding is a thin overlay on
it** (the first 1–2 hours before sign-up — a tiny fraction of a customer's lifetime use).
Every surface this change touches is designed and solved for STEADY first; onboarding
layers journey-progress + the gate on top via the `mode` axis. Concretely: a
viewer-change mechanism that "works in onboarding" but is a NO-OP in steady is a
PRODUCTION BUG, not acceptable plumbing. The investigation (2026-06-17) found three such
bugs the frame retirement must FIX, not preserve:

- **`editSchema` is a no-op in steady → the Extract schema/template DESIGN surface is
  UNREACHABLE for authenticated users.** Both entries route to `advanceFrame("f3a")`
  (a literal no-op outside onboarding) and `isDesignSurface = currentFrame === "f3a"` is
  never true in steady. The owner's "problem in both places" — confirmed (R7).
- **`switchFrame` is a no-op in steady** — `suggest_intent` emits it, so a steady LLM
  can ask to move the canvas and nothing happens.
- **`showSample` is a no-op in steady** (acceptable — samples are onboarding-only — but
  must be made *explicitly* onboarding-scoped, not a silent dead intent).

Already steady-correct (the bar): `showExtract`/`showReport`/`editTemplate`/`showIntegrate`
push real steps; report render-vs-builder rides the step's `surface` field. The new work
brings the rest up to that bar in BOTH experiences (the `show*` no-fork, D6).

**Authenticated-experience shape (owner, 2026-06-17):** the authenticated experience is
the SAME chat (`ConversationFlow`) — **minus the onboarding nav and with no locked
buttons.** Grounding (verified 2026-06-17): the authenticated shells (`SteadyShell`,
`ScopedConversationShell`) already render the general `AppNav` (NOT the onboarding
`OnboardingNav` wrapper) and NO step strip — so "minus the onboarding nav" is largely
already true; the in-scope work is to VERIFY + guarantee no onboarding-locked affordance
(the gate-locked CTAs, the journey step strip) leaks into the authenticated experience,
and that authenticated users see no locked buttons.

**Deferred decision (owner-chosen, tracked):** whether the authenticated experience needs
a PERSISTENT viewer-destination switcher is DEFERRED — for now, steady navigation = chat
+ agent-offered affordances (this change's `offerAs`) + citation jumps, with no switcher.
This change still makes every destination dispatchable through the seam, so a switcher
later is a thin consumer. Per discipline §8 this deferred DECISION is filed as a GitHub
Issue (not a silent gap); it does NOT block hardening this change.

## Delivery mandate (locked 2026-06-17)

This change ships as a **hardened production implementation**. Non-negotiable:

- **No deferred decisions.** Every design question raised by review — R1–R7 in
  `design.md §0` — is RESOLVED in this plan before any code is written. The plan
  carries no "decide later."
- **No hacks / no dormant plumbing.** Every removed frame symbol has a real
  replacement reachable through the seam. No orphaned surfaces: the f3a schema-design
  surface and the f1/ingest return get real destinations (R7), not a deleted path.
- **No pending tasks that impact production.** T13 (durable-spec coverage) and T14
  (reference-doc sync) are PART OF this change, not follow-ups. The change is not
  "done" until full T11 verification + the T12 hostile review pass.
- **Out-of-scope ≠ deferred work.** The only out-of-scope items are genuinely separate
  FEATURES (not half-finished pieces of this one), each filed as a GitHub Issue per
  discipline §8.

## What

Make **changing the viewer one mechanism**, and give an LLM a first-class way to
**offer clickable viewer behavior**. Three threads:

1. **One seam.** Every trigger that changes the canvas — chat LLM tool, suggested
   chip, citation click, step-strip pill, the onboarding pick-a-view pills, the F1
   picker, and the auto-advance-on-"Done" — routes through the single
   `CanvasOrchestrator.dispatch(intent, source)` seam. Today roughly half bypass it
   (step-strip + pick-a-view pills call `advanceFrame` directly).

2. **Retire the f1–f7 frame machine.** Viewer **steps** become the only model of
   "what the canvas shows". `currentFrame`/`advanceFrame`/`frameToStepStandalone`,
   the `switchFrame` intent, and the persisted `completedFrames` are removed.
   Journey stage + gating moves to the **existing** step-based progress state
   (`currentStep` / `completedSteps` / `JOURNEY_CATALOG` / `pillState` /
   `analyzeSubsteps`), which is consolidated to drop its one residual `currentFrame`
   read — NOT a net-new concept.

3. **Agent-authored clickable viewer affordances.** A navigation tool call MAY be
   marked **offered** (a disposition) rather than performed; offered actions surface
   on the **existing** `suggestedActions` list (extended with an optional inline
   `anchor`), rendered as a follow-up **pill** or as a clickable **phrase inline**
   in the answer prose. This unifies today's mutate `tool:*` chips, the retired
   `suggest_intent`, and the inline `[N]` citation precedent into one list with two
   renders.

## Why

- The onboarding **pick-a-view buttons do nothing** — they bypass the seam and
  steer focus through a `?focus=` URL param Extract reads only once at mount. A
  symptom of the missing standard.
- A **frame** does double duty — "what's shown" (already covered by steps) AND
  "journey stage + gating" — which is why the journey vocabulary drifts and the
  orchestrator forks every `show*` on `routeThroughOnboarding`.
- An LLM has **no general way to offer clickable viewer behavior**: navigation
  auto-applies, only `mutate` surfaces as a chip, and only `[N]` citations are
  clickable inline.

## Scope

**In scope (decided)**

| # | Decision |
|---|---|
| D1 | Every viewer-change trigger routes through `dispatch(intent, source)`. The bypassing triggers (step-strip pills, onboarding pick-a-view pills) and the auto-advance-on-"Done" migrate to dispatch. |
| D2 | Retire the f1–f7 frame machine: remove `currentFrame`/`advanceFrame`/`frameToStepStandalone`, the `switchFrame` intent, and the persisted `completedFrames`. Steps are the only "what's shown" model. |
| D3 | Give the step strip a **frame-free source**. Today `currentStep`, `completedSteps`, and `analyzeSubsteps` are all DERIVED FROM FRAMES (`FRAME_TO_STEP[currentFrame]`, `completedFrames` mapped through `FRAME_TO_STEP`, `analyzeSubsteps(currentFrame)`). Keep the strip's CONSUMER shape (`JOURNEY_CATALOG` / `pillState` / `StepDescriptor`) but re-source it: the **current stage** already derives from the active viewer step kind via the existing `VIEWER_STEP_TO_JOURNEY` map (`OnboardingShell.tsx:199–203`, frame is only a fallback) — REUSE it and drop the fallback; the **reached-set** (the strip's checkmarks) comes from a small persisted **set of reached stages** (D13, NOT a monotonic watermark — `integrate` is reached out of order, so it is non-contiguous; see §0 R3), a stage added only when reached for the first time. The only fully frame-derived inputs to replace are `completedSteps` and `analyzeSubsteps`. Preserve the `analyzeReached` nuance (a citation click does not re-lock a traversed bracket) and the existing jump-ahead regression test. Journey progress exists only in onboarding (steady has no stages). |
| D4 | **Per-destination named intents**, each fully describing its destination: `showExtract` (scope, schemaId, focusedCategoryId?), `showReport` (templateId, scope), `editTemplate` (templateId, selectedSectionId?), `showIntegrate` (scope), `openDocument` (documentId, page?), and a NEW `showInteract` (scope). `switchFrame` removed. Side-effect intents unchanged. |
| D5 | **Sub-position lives on the active step** — `extract-workbench.focusedCategoryId`, `report.selectedSectionId`. `ScopedCanvas` forwards it; the canvas is a pure function of the step; sub-position changes mutate the active step in place. Extract reads focus from props; the parallel `schemaOverlay.focusedCategoryId` (and its `setFocusedCategory` callers) are removed. |
| D6 | Fix the `showExtract` handler payload bug — honor the intent `scope`/`schemaId`, no hardcoded `"utility"`. Stop forking the `show*` handlers on `routeThroughOnboarding` (one outcome; onboarding concerns layer on top). |
| D7 | **Offer via a disposition on the navigation tools**, NOT a new tool: a navigation tool call MAY carry an optional `offerAs: { label, anchor? }`; presence surfaces it as an OFFERED `suggestedActions` entry (server-validated intent) instead of auto-dispatching. Absence auto-dispatches per category. Mutate tools stay always-offered. No new tool, no new verb. Perform + offer both, mixable in a turn. |
| D8 | One affordance list: **extend the existing `suggestedActions`** with an optional `anchor` (inline-binding phrase). No new `affordances[]` field. A `suggestedActions` entry renders as a pill (no `anchor`) or as inline clickable text (phrase match, fallback to a pill). Inline anchoring is a navigation-offer feature (only `offerAs`-carrying navigation actions get an `anchor`); mutate actions and UI-driven actions (e.g. "show all sources", whose intent is built client-side) render as pills. The retired `suggest_intent` (a general any-frame navigator) is folded into `offerAs`; `switchFrame` is gone. Its destinations map 1:1 to per-destination intents (f3→`showExtract`, f4→`showReport`, f5→`showInteract`, f7→`showIntegrate`); f1 (picker) and f2 (the auto-shown doc) need no offered navigation. The removal task MUST confirm no `switchFrame`/`suggest_intent` destination is left unmapped. |
| D9 | Auto-advance to Extract on Understand "Done" **stays** (Option A) — but goes through `dispatch(showExtract …)`. |
| D10 | The onboarding pick-a-view pills **stay per-category** and **stay `PickViewPill`**, dispatching `showExtract` (with `focusedCategoryId`) directly through the orchestrator — they do not route through the affordance/suggestedActions renderer. |
| D11 | Update the intent replay corpus + the shared `intentCatalog` (`intentFixtures/`): remove `switchFrame` + its `suggest_intent` fixture, add `showInteract` (with its `llm` prompt), keep coverage green. |
| D12 | Re-home `advanceFrame`'s non-navigation side effects onto a **first-reach stage transition (onboarding only)** — fired only when a stage is ADDED to the reached-set (reached for the first time), NOT on every dispatch to a stage: entity-deactivate (old f1), gate reset + sign-up overlay pop (old f7), and `understand.completed` analytics. So re-focusing a category (re-dispatching `showExtract` while already on Analyze) or an LLM-offered/step-strip jump to a stage already reached must NOT re-fire them. **§0 R1/R2/R6 correct this:** `understand.completed` binds to the first `showExtract` (NOT the Analyze stage — f5 also reaches Analyze); the f1 entity-deactivate re-homes onto the explicit ingest dispatch (a backward move a set/watermark can't model); the first-reach decision is ref-computed. |
| D13 | Migrate persistence + the LLM-context snapshot off frames. **Replace `lastFrame` with a persisted active viewer step (kind + payload) as the resume anchor** — restored VERBATIM on hydrate (NOT a watermark; the code documents a stale-resume bug from conflating last-position with highest-reached). **Replace `completedFrames` with a small persisted set of reached stages** (NOT a monotonic watermark — §0 R3) used ONLY for the strip checkmarks, never for resume. The LLM-context snapshot sends the journey stage + active step kind instead of `lastFrame`/`completedFrames`. (Net: drop two frame-named persisted fields, add two frame-free ones; pre-launch, no data migration.) |
| D14 | Migrate the `frame-advanced` viewer-event: the `viewerEventActionSchema` enum (middleware + its `app.ts` validation + the `apiRouteContract` test) drops `frame-advanced` in favor of a stage/step action. The viewer_events telemetry vocabulary becomes frame-free. |
| D15 | Steady behavior change (positive): the shared production widgets call `advanceFrame = onboardingSession?.advanceFrame ?? (() => undefined)`, so their in-widget navigations are **no-ops in steady today**. Migrating them to `dispatch` makes them **functional in steady** (dispatch works in both trees). Confirm this is intended and add steady coverage so the now-live navigations are tested, not silently enabled. |

**Out of scope (tracked)**

- Per-category pills as a general/steady pattern at arbitrary schema cardinality;
  outside onboarding, category navigation lives inside the Extract widget.
- The `?focus=` URL navigation carrier (dropped; on-step focus + the dispatched
  intent are the source of truth).
- Persisted-intent data migration (none — pre-launch; `parseCanvasIntent` degrades
  unknown kinds to null).

**Spec surfaces touched:** `app-architecture` (seam encapsulation, no frames,
frame-free journey source, on-step sub-position, LLM-context migration),
`agent-tools` (the `offerAs` disposition + complete navigation intents + removals),
`conversation-flow` (extend `suggestedActions` with `anchor` + pill/inline render),
`chat-routing` (`offerAs` routing + `suggest_intent` removal), `ui-views` (frame
retirement, step strip + gating from the frame-free source, pick-a-view pills),
`observability` (the `frame-advanced` viewer-event action migrates to a stage/step
action — D14), `plugin-loader` (the tour's `advanceFrame` CanvasIntent → per-destination
intent), `onboarding-schema-editor` (drop `advanceFrame("f3")` / `currentFrame === "f3a"`
references). **`testing-suite` / `smart-report`** carry softer frame *vocabulary*
(frame testids, "frame f4/f4a") — assess in T13. (The original six-surface list missed
the last four; see T13. The durable requirements that carry the removed symbols must be
MODIFIED/REMOVED by header, which `openspec validate --strict` does NOT enforce.)

## Conformance to core architectural decisions

(`scaffold/docs/agents/principles.md`)

- **Principle 1 — composable, not forked.** The offer disposition is a *value on
  an axis* on the existing navigation tools (not a new tool/verb/field-family); the
  affordance is the *existing* `suggestedActions` with one added `anchor` (not a
  forked `affordances[]`); journey progress *consolidates* existing step state (not
  a new parallel store); the `show*` handlers stop forking on experience. **Axes
  earned:** the `suggestedActions` render axis has two real callers (mutate chips +
  offered navigation); on-step sub-position has two (Extract `focusedCategoryId` +
  Report `selectedSectionId`). The inline-`anchor` render is a variant of the
  existing chip renderer, not a new system; the pick-a-view pills deliberately
  reuse the existing `PickViewPill` rather than spawn a renderer with one caller.
- **Principle 5 — done = user-visible + round-trip.** Cornerstone is the
  user-visible dead-button fix. Deferred work is tracked; frames/`suggest_intent`
  are removed outright, not stubbed.
- **Principle 6 — one source of truth.** `CanvasIntent`, `ViewerStep`,
  `suggestedActions`, `ContentScope`, `Citation`, and the `intentCatalog` stay
  single-sourced in `@groundx/shared`; app `*.tools.ts` keep mirroring the
  middleware catalog. Intents remain server-validated, never free-form.
- **Principle 2 / 3 — TDD + adversarial review.** `tasks.md` starts with the
  failing user-visible test and tags each task SEQUENTIAL/WORKFLOW with its gate.

## Resolved decisions (from brainstorming + adversarial review)

| Topic | Decision |
|---|---|
| Offer vs perform (Q-a) | **Disposition** (`offerAs`) on the existing navigation tools — no new tool, no new verb. Perform + offer both, mixable; any action either way. `suggest_intent`/`switchFrame` removed. |
| Inline binding (Q-b) | **Extend `suggestedActions` with an optional `anchor`**; phrase match via the citation `answerSpan` alignment (first occurrence), remark-plugin rendered; **fallback to a pill** when not found. No `anchor` -> pill. `?focus=` dropped. |
| Enforcement (Q-c) | **Structural encapsulation** — viewer-step mutators reachable only from the orchestrator (audit: push/goto mutators already have zero external callers; `setFocusedCategory` is removed under D5). `advanceFrame` removal eliminates its 36 trigger sites by construction. Guard test backs it. |
| Decomposition | **One change** (owner decision; decomposition considered, declined). |

See `design.md` for the resolved design detail and the call-site grounding.
