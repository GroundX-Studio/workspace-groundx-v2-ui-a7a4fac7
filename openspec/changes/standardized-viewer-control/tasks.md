# Tasks — standardized-viewer-control

One change (owner decision). Ordering: T2–T5 are the foundation; T6 is the large
frame-retirement migration (WORKFLOW over the `advanceFrame` sites) and carries
the frame-coupled dependencies (LLM context, persisted snapshot, intent corpus);
T7–T9 build the affordance surface; T10–T14 lock the guarantees. Every task closes
only after its adversarial review gate passes against the plan AND the real code.

## Status (verified 2026-06-17, adversarial review)

- **T1 DONE** (committed `97d6e19`) — cornerstone test present and green
  (`OnboardingShell.pickViewFocus.test.tsx`; its docstring "expected to FAIL until
  T9" is now stale).
- **T4 DONE** (committed `8b85dd2`) — `extract-workbench.focusedCategoryId` on the
  step, `mutateActiveStep` added, `setFocusedCategory`/`schemaOverlay.focusedCategoryId`/
  live `?focus=` reads all gone (0 refs).
- **T9 PARTIAL** — the pick-a-view Extract pills dispatch `showExtract`
  (`experience.tsx:380`); the **auto-advance-on-"Done" still calls
  `advanceFrame("f3")`** (`experience.tsx:350`), so the second half of T9's gate is
  NOT met. (The "interact" pill still calls `advanceFrame("f5")` — that is T6/T7
  work, needs `showInteract`, not a T9 gap.)
- **T2 PARTIAL (pre-landed)** — `showExtract.focusedCategoryId` and
  `suggestedActions.anchor` already shipped in `shared/src/index.ts` (the anchor at
  `:641`); `showInteract` absent, `switchFrame` still present, `offerAs` absent.
- **T3, T5, T6, T6b, T7, T8, T10, T11, T12 NOT STARTED.** (T8 groundwork exists: the
  `answerSpan` aligner — `splitTextRun`/`normalizeForMatch` in `citationFootnotes.ts`
  — is ALREADY exported, no extraction needed.)
- **NEW: T13 (durable-spec coverage repair) and T14 (reference-doc sync) added below**
  from the review — both are coverage gaps the original plan dropped.
- **2nd review + steady-first reorientation folded in (2026-06-17):** R1–R7 are RESOLVED
  in `design.md §0` (no deferred decisions). Headline: the schema DESIGN surface is a
  PRODUCTION bug today (unreachable for authenticated users — `editSchema` no-ops in
  steady); this change FIXES it via a step `mode:"design"` sub-position + a real
  `editSchema` outcome (T2 carrier, T5 handler). Steady is the design target; onboarding
  overlays it. Every migrated intent must be steady-reachable + steady-tested (no silent
  no-ops).
- **Hard scan (2026-06-17, ran tests + hostile agents):** the T1 cornerstone test is
  VERIFIED GREEN (actually run, not grepped); `check-tool-quality` passes. Found + folded
  in: M1 (`experience.tsx:445` first-send guard — behavioral read missing from T6), M2
  (`pickScenario` analytics preservation), M3 (F1-a11y replacement predicate in T13), M4
  (`save-schema` re-trigger round-trip test), the 3 hand-maintained tool-test fixtures
  (`EXPECTED_NAMES`/`toolsForStep`/`TOOL_ARGS`), and the `offerAs` shared-constant parity
  discipline. (Prior pass's "nearly clean" was under-rigorous — this pass was not.)
- **EXECUTION (workflows):** Phase 1 foundation (T2/T3/T5) committed `77fb3848`; T6 + T9
  auto-advance committed `be782df3` — both independently verified green (tsc + full app
  1866 / middleware 1005 suites + guards + validate). All production triggers now change
  the canvas via `dispatch`.
- **GAP found in execution (resolve in the deletion phase):** R7's "reuse ingest-picker,
  no new intent kind" was incomplete. Three BACKWARD-transition sites have NO destination
  intent and remain on `advanceFrame` until deletion: `Extract.tsx:488` (f1 save-return),
  `OnboardingShell.tsx:324` (f1 URL-return), `experience.tsx:208` (f2 intro-snap).
  `showSample` ACTIVATES a scenario; there is no deactivate/return-to-picker intent, and
  the intro-snap needs BOTH a scanning doc-viewer beat AND the journey edge. **Before
  deleting `advanceFrame`/`currentFrame`/`completedFrames`/`frameToStepStandalone`, the
  deletion phase MUST add: (a) a return-to-ingest-picker (entity-deactivate) intent, and
  (b) an Understand intro-snap capability** (or fold the snap into an existing intent),
  then migrate these 3 sites. This is the frame-symbol-deletion gate.

> **Review corrections to stale facts:** "36 `advanceFrame` sites" is actually **18**
> production trigger call sites (verified). The intent-catalog completeness test
> (`intentCatalog.completeness.test.ts`) is **schema-derived — no hardcoded count to
> bump** (the "30→31" framing in memory/old notes is wrong; adding `showInteract` /
> dropping `switchFrame` keeps it green automatically). `openspec validate --strict`
> currently **passes** — the durable-spec contradiction (T13) is NOT caught by the
> validator, so it must be fixed by hand.

## T1 — Cornerstone failing test (user-visible) · SEQUENTIAL

- [x] Full-shell test: from a NON-Extract view with the onboarding pick-a-view
      pills present, clicking "Meters" switches the canvas to Extract focused on
      Meters; clicking "Charges" while already on Extract re-focuses live (no
      remount). (DONE `97d6e19`; the test's "expected to FAIL" docstring is now stale.)
- **Gate:** red for the documented reason; asserts user-visible canvas state.

## T2 — Shared contract + intent catalog (`@groundx/shared`) · SEQUENTIAL

- [x] Add `showInteract` to `canvasIntentSchema`; ~~add optional `focusedCategoryId`
      to `showExtract`~~ (ALREADY SHIPPED); ~~add optional `anchor` to the
      `suggestedActions` entry shape~~ (ALREADY SHIPPED, `index.ts:641`);
      add an optional `offerAs: { label, anchor? }` to the navigation tool input
      schemas. Remove `switchFrame`. Update the shared `intentCatalog`: drop the
      `switchFrame` entry, add `showInteract` with its `llm` coverage prompt, and
      mark offer-eligibility (intentBuilder + llm-emittable). NOTE: the catalog
      completeness guard is schema-derived — no count to bump.
- [x] **R7 (RESOLVED — steady-first, see design.md §0):** add a
      **`surface: "fields" | "design"`** sub-position to the `extract-workbench`
      ViewerStep — MIRRORING `report.surface` (NOT a new `mode` field; `mode` is the
      widget-contract prop). `ScopedCanvas` forwards it; Extract reads `isDesignSurface`
      from the step prop, NOT `currentFrame`. This makes the schema DESIGN surface
      reachable for AUTHENTICATED users (UNREACHABLE today — a production bug). Carrier
      shape only here; the `editSchema` real outcome is T5.
- **Gate:** `npx tsc --noEmit` clean across workspaces; `parseCanvasIntent`
      round-trips the new kinds; no `switchFrame` reference remains in shared; the
      carrier shapes exist (`extract-workbench.surface`, `showInteract`,
      `suggestedActions.anchor` already shipped). (The "every former `advanceFrame`
      destination has a dispatch intent" guarantee is T5's gate — the `editSchema`/f1
      OUTCOMES are T5, not T2.)

## T3 — Frame-free journey-progress source · SEQUENTIAL

- [x] `currentStep`, `completedSteps`, and `analyzeSubsteps` are ALL frame-derived
      today (`FRAME_TO_STEP[currentFrame]`, `completedFrames`→`FRAME_TO_STEP`,
      `analyzeSubsteps(currentFrame)`). Keep the strip's consumer shape
      (`JOURNEY_CATALOG`/`pillState`/`StepDescriptor`) but re-source it: the current
      stage already derives from the active step kind via the existing
      `VIEWER_STEP_TO_JOURNEY` map (`OnboardingShell.tsx:199–203`, frame is only a
      fallback) — REUSE it, drop the fallback; the reached-set from a small
      **persisted set of reached stages** (T6b; NOT a monotonic watermark — R3), a stage
      added on dispatch only on a first-time reach. Only `completedSteps` +
      `analyzeSubsteps` are fully
      frame-derived. Preserve the `analyzeReached` rule (a citation jump must not
      re-lock a traversed bracket) and the existing jump-ahead regression test.
- [x] **Watermark-shape correction (review R3/C2/C4):** the reached-set replacement
      MUST be a **SET of reached stages**, NOT a single monotonic high-water value —
      `integrate` is auth-gated/reachable-from-anywhere, so `completedFrames` is
      genuinely non-contiguous (the persisted fixture is `["f1","f2","f3","f7"]` with
      `lastFrame:"f5"`); a high-water-mark loses which stages were each visited. Also:
      the "citation-jump-no-relock" behavior T3's gate claims to cover has **no existing
      test** — write it (a `doc-viewer` citation step maps `currentStep` back to
      `understand` but must not re-lock the already-reached `analyze` bracket).
- **Gate:** the strip + gating read no frame value; the reached-SET adds a stage only
      on a first reach and reproduces the non-contiguous `integrate` case; the
      jump-ahead regression test asserts the same user-visible gating and is green; a
      NEW citation-jump-no-relock test exists and is green.

## T4 — On-step sub-position (ViewerStep + ScopedCanvas + Extract) · SEQUENTIAL

- [x] Carry `focusedCategoryId` on the `extract-workbench` step; forward it (and
      `report.selectedSectionId`) from `ScopedCanvas` to the widget. Rewire Extract
      to read focus from props; delete `schemaOverlay.focusedCategoryId`, its
      `setFocusedCategory` callers, and the `?focus` reads. Add the
      mutate-active-step (in-place) action used by sub-position changes.
      (DONE `8b85dd2` — `mutateActiveStep` at `ChatStoreContext.tsx:1612`; 0 refs to
      `setFocusedCategory`/`schemaOverlay.focusedCategoryId`.)
- **Gate:** Extract renders focus from the step prop; a focus change mutates the
      active step in place (history length unchanged) and re-focuses live; no
      `?focus` / `schemaOverlay.focusedCategoryId` / `setFocusedCategory` remains.

## T5 — Orchestrator: one outcome, payload honored, journey advance, side effects · SEQUENTIAL

- [x] Remove the `routeThroughOnboarding` fork for the `show*` / `editTemplate`
      handlers; each pushes/mutates its step honoring the payload (fix `showExtract`
      hardcoded `"utility"`). Add the `showInteract` handler. **Steady-gap closures
      (production bugs, R7/steady audit):** give `editSchema` a real experience-agnostic
      outcome — push/mutate the `extract-workbench` step into `mode:"design"` (T2
      carrier) so the schema design surface is REACHABLE for authenticated users (no
      `advanceFrame("f3a")`); give the f1/ingest return (`Extract.tsx:446`) a real
      ingest/picker dispatch; make `showSample` explicitly onboarding-scoped (an honest
      no-op-with-reason in steady, not a silent dead intent). Dispatch advances
      journey progress (T3). Re-home `advanceFrame`'s non-nav side effects
      (entity-deactivate, gate reset + sign-up overlay pop, understand-completed
      analytics) onto a **first-reach stage transition (onboarding only)** — fired
      only when a stage is first ADDED to the reached-set (R3), NOT on the raw intent
      handler, so a re-dispatch to a stage already reached (category re-focus, an offered
      or step-strip jump) does not re-fire them.
- [x] **Side-effect re-homing corrections (review R1/R2/R6 — "fire on stage-watermark
      increment" is WRONG for these):** (a) `understand.completed` must fire on the
      `showExtract` FIRST-REACH specifically, NOT on the `analyze`-stage increment —
      f5/interact also reaches `analyze` and a test asserts no fire on `f2→f5`. (b) the
      f1 entity-deactivate is a BACKWARD transition a monotonic watermark can't model —
      re-home onto the actual dispatch back to ingest/picker, not a watermark edge. (c)
      the f7 overlay pop fires on post-commit ARRIVAL at Integrate, not a first-reach —
      a second arrival with a live gate must still clear it. (d) compute the first-reach
      decision from a SYNCED REF, never a flag mutated inside the setState/reducer updater
      (the `openGate`→overlay silent-failure pattern). See design.md §0. (e) **M2 (hard
      scan):** when rewriting `pickScenario`'s frame seeds (`lastFrame:"f2"`/
      `completedFrames:["f1"]`, `OnboardingSessionContext.tsx:192-194`), PRESERVE its two
      analytics — `track("understand.started")` (`:207`) and `gaSetDefaults({currentSample})`
      (`:209`); they survive only by accident otherwise.
- [x] **`showInteract` document bridge (hard-scan note):** the `interact-chat` ViewerStep
      carries only `scenarioId` (`types.ts:422`) and mounts the SAME `doc-viewer` canvas
      (PdfViewer) as `openDocument`. The `showInteract` handler MUST resolve a document
      from its `scope` so the interact canvas isn't a doc-less PdfViewer. Gate in T5 tests.
- [x] **M4 (hard scan) — `save-schema` gate re-trigger round-trip test:** the multi-hop
      chain 401→`openGate("save",{cause:"save-schema"})`→dismiss(preserves cause)→
      re-open→commit→post-commit retry (`Extract.tsx:419-456`) TERMINATES in the f1/ingest
      return being rewritten (R7). Add an end-to-end test for it so the re-trigger
      invariant doesn't break at the rewritten seam.
- **Gate:** `showExtract` honors scope/schemaId/focusedCategoryId in both
      experiences; no hardcoded scenario id; EVERY former `advanceFrame` destination is
      reachable via a dispatched intent (incl. f3a via `editSchema`→`surface:"design"`
      and the f1 ingest-picker return); `understand.completed` fires on first
      `showExtract`, NOT on `f2→f5`/interact-first, AND its payload drops the frame keys
      (`fromFrame`/`toFrame` → stage/step); entity-deactivate fires on the ingest
      dispatch; the overlay pop is not stranded on a second Integrate arrival; the
      first-reach decision is ref-computed (not a setState-flag).

## T6 — Migrate the `advanceFrame` call sites (18 verified, not 36) · WORKFLOW (gated per unit)

- [x] Per production unit that calls `advanceFrame`, replace `advanceFrame(frame[, opts])`
      with the corresponding dispatched intent. **Corrected unit list (18 verified call
      sites, 2026-06-17 — the old list named 2 PHANTOM units and OMITTED 2 real ones):**
      - **Extract** ×6 (`Extract.tsx:382` f3, `:446` **f1 — NO destination intent yet**,
        `:1327/:1331` f5, `:1583/:1587` **f3a — NO destination intent yet**; see R7).
      - **SmartReportBuilder** ×2 (`:306/:314` f4).
      - **SignUpWidget** ×1 (`:184` f7).
      - **GateChatRail** ×1 (`:264` f7) — was MISSING from the old list.
      - **OnboardingShell** ×4 (`:378/:398/:405/:690`) + its URL effect.
      - **onboarding `experience`** ×4 (`:156` f2 intro-snap, `:350` f3 auto-advance,
        `:372` f5 interact pill, `:446` f5 first-send) — the old list collapsed these
        to "pick-a-view pills"; three were uncovered.
      - **NOT units:** `SmartReportRender` and `Integrate.tools` have ZERO real
        `advanceFrame` calls (comment-only) — removed from the list.
      Also migrate the orchestrator's own `switchFrame`→`advanceFrame` and
      `editSchema`→`advanceFrame("f3a")` cases (`CanvasOrchestratorContext.tsx:436,449`).
      After the last unit, delete `advanceFrame`, `currentFrame`, `frameToStepStandalone`,
      and `completedFrames`. Note: the `?? (() => undefined)` steady no-op exists ONLY in
      Extract + SmartReportBuilder (the genuinely-shared widgets); GateChatRail/
      SignUpWidget/OnboardingShell/experience use the REQUIRED `useOnboardingSession()`
      and cannot be steady-tested — D15's "add steady coverage" applies only to the
      two shared widgets.
- [x] **Migrate the behavioral frame STATE READS (not just `advanceFrame` calls)** —
      T3 covers only the strip/journey reads; these gate real behavior and are
      otherwise stranded: `experience.tsx:156/349` (`currentFrame === "f2"` guards),
      `experience.tsx:261` (`=== "f3a"` schema-agent header), `Extract.tsx:380`
      (`=== "f3a"` isDesignSurface), `OnboardingShell.tsx:204` (`=== "f1"` isF1), `:670`
      (`=== "f4a"` reportSurface → R4), `ChatColumn.tsx:108,156-174` (the frame
      whitelist), `SignUpWidget.tsx:156` + `GateChatRail.tsx:199` (`PRE_INTEGRATE_FRAMES`),
      AND **`experience.tsx:445`** — the first-send→Interact auto-advance GUARD
      (`frame === "f2"|"f3"|"f3a"|"f4"`, "not already past Interact"). This is a
      behavioral read, NOT just the `:446` call site; its replacement MUST be an explicit
      "current stage is pre-Interact" predicate + a test. The symbol-grep gate MASKS this
      (the literal vanishes but the don't-bounce-a-user-at-Interact rule could silently
      drop/invert). M1 (HIGH) from the 2026-06-17 hard scan.
- **Gate (PER UNIT):** the unit changes the canvas only via `dispatch`; its tests
      are green (incl. steady for shared widgets); cross-unit collision check on
      shared files; after the last unit no `advanceFrame` / `currentFrame` /
      `frameToStepStandalone` / `completedFrames` symbol remains.

## T6b — Frame-coupled cross-cutting migrations · SEQUENTIAL (each its own gate)

- [x] **LLM context:** replace `lastFrame` + `completedFrames` in the chat-request
      entity snapshot with the journey stage + active step kind. **Review-found extra
      sites (must also migrate):** `middleware/src/services/structuredHandler.ts` bakes
      frame vocabulary into LLM-facing PROMPT TEXT at `:184-185`, `:456-457`, `:554-555`
      ("Last frame: f1", "Frames completed: N", "frame f1") — not just `chatHandler`; and
      `app/src/conversation/intentFixtures/replayIntent.tsx:93` reads
      `onboarding?.state.currentFrame` to build the PRODUCTION `?debug=true` overlay
      (`IntentDebugPanel`) — re-source it off the active step/stage; AND
      `middleware/src/services/contextBundler.ts` carries `lastFrame: string|null` +
      `completedFrames: string[]` as TYPED entity-bundle fields (`:60-61`) used in token
      estimation (`:216`) and the doc comment (`:10-11`) — this is the LLM context
      assembler itself, so it MUST migrate to the stage/active-step shape (objective grep
      2026-06-17 — T6b previously named only chatHandler/structuredHandler). **Gate:** no
      frame value in the snapshot, the LLM prompt text, the context bundler, or the debug
      overlay; middleware request validation accepts the new shape.
- [x] **Persisted snapshot:** replace `lastFrame` with a persisted **active viewer
      step** (kind + payload) as the resume anchor, restored VERBATIM on hydrate (NOT
      a watermark — preserve the documented no-stale-resume rule); replace
      `completedFrames`/`completedFramesJson` with a small **reached-stage set** (R3)
      used only for checkmarks. Update `parseChatStoreSnapshot`, the ChatStore
      serialize/parse + hydrate path, and EntitySessionStore. **Review corrections
      (R5/R4/B2/B3):** (a) the active viewer step is NOT persisted today (`serialize`
      omits `viewer`; `deserialize`/`hydrateFromServer` hardcode `EMPTY_VIEWER_SESSION`)
      — this is a NET-NEW nested untrusted-input surface, needs a new
      `parseChatStoreSnapshot` sub-schema for the ViewerStep union + a `STORAGE_VERSION`
      bump, NOT a field swap. (b) the persisted `report` step must carry its
      `surface: "render"|"builder"` so the render/builder distinction (old f4 vs f4a,
      `OnboardingShell.tsx:670`) survives without a frame. (c) overlays
      (`sign-up`/`citation-peek`/`book-call`) MUST NOT be in the resume anchor (gate is
      reset to idle on hydrate — a persisted overlay would desync). (d) the server twin
      is a SECOND serialization surface — migrate the FULL set, not just localStorage:
      `completedFramesJson` writes (`ChatStoreContext.tsx:701/743/877/897`),
      `middleware/src/types.ts:107-108`, the `app.ts` entity-PUT validation/merge block
      (~`:817-912`), `api/chatSessionEntities.ts:32/61`, and the `mysqlRepository` DDL
      (`last_frame`/`completed_frames_json` columns + INSERT/SELECT/row-map). (e) use
      "reached-set", not "watermark", everywhere (R3).
      **Gate:** a returning user resumes on their last view verbatim incl. report
      surface; overlays do not restore; no `lastFrame`/`completedFramesJson` remains in
      localStorage OR the DB; the snapshot round-trips the active step + reached-set.
- [x] **Intent corpus + `intentCatalog`:** remove the `switchFrame` fixture (and its
      `suggest_intent` trigger) from `intentFixtures/fixtures.tsx`; add a
      `showInteract` fixture + its `intentCatalog` `llm` prompt. **Gate:** the replay
      + key-gated live-coverage suites are green; no `switchFrame` in the catalog.
- [x] **`frame-advanced` viewer-event:** migrate `viewerEventActionSchema` + its
      `app.ts` validation + the client twin `app/src/api/viewerEvents.ts` + the
      `apiRouteContract` test to a stage/step action. **Also
      assess the `"left"` action** (`middleware/src/types.ts` enum + app twin
      `ChatStoreContext/types.ts`) — it fires on the f1-back entity-deactivate
      (`OnboardingSessionContext.tsx:226`), which the D12 re-homing touches; keep or
      rename it deliberately (don't leave it frame-coupled by accident). **Gate:** no
      viewer-event action is `frame-advanced`; the `"left"` action is explicitly
      kept/renamed with a reason; the contract test asserts the new vocabulary.

## T7 — `offerAs` disposition (middleware + app mirror) · SEQUENTIAL

- [x] Add optional `offerAs: { label, anchor? }` to the navigation tools' input
      schemas, each with a `.describe(...)`; route a call carrying `offerAs` to a
      `suggestedActions` entry (validated intent via the tool's `intentBuilder` +
      label + optional anchor) instead of auto-dispatch; absence auto-dispatches per
      category. The `intentBuilder` MUST ignore `offerAs` (it never enters the
      intent). Gate offer-eligibility on `intentCatalog` (intentBuilder +
      llm-emittable). Add the interact navigation tool (emitting `showInteract`).
      Add **`show_extraction_edit`** (the `_edit` sibling of `show_extraction`, mirroring
      the shipped `show_smart_report_edit`; NOT a novel `show_schema_editor`), emitting
      `editSchema`, `category:"read"`, LLM-emittable — so the agent can OFFER "→ edit this
      schema" (owner decision; see design.md §3.1). `editSchema` moves OUT of the UI-only
      set. Mirror it in app `Extract.tools.ts` (catalog-parity).
      Remove `suggest_intent` (a general any-frame navigator) and any `switchFrame`
      emission — first confirm every destination it served maps to a per-destination
      intent (f3→`showExtract`, f4→`showReport`, f5→`showInteract`, f7→`showIntegrate`;
      f1/f2 need none), so nothing is orphaned. NOTE: `suggest_intent` is server-only
      (no app `*.tools.ts` mirror), so its removal MUST also drop it from the
      `SERVER_ONLY` set + comment in `app/src/tools/catalog-parity.test.ts:44` (an
      obligation the original gate wording missed).
- [x] **Hand-maintained test fixtures (hard-scan #3 — adding 2 tools / removing
      `suggest_intent` breaks these; named in NO task, would surface as red mid-T7):**
      `toolCatalog.test.ts` `EXPECTED_NAMES` (the authoritative `.toEqual` name list) and
      its per-step `toolsForStep(...).toEqual([...])` assertions; `intentToolCorpus.test.ts`
      `TOOL_ARGS` (the `{toolName→args}` map asserted `.toBeDefined()` per emittable
      entry) needs `show_interact` + `show_extraction_edit` entries.
- [x] **`offerAs` parity discipline (hard-scan #4):** define `offerAs` as ONE shared Zod
      constant imported by every navigation tool on BOTH app + middleware, so the
      full-shape JSON-Schema parity (`catalog-parity.test.ts:308-334`) is identical by
      construction (it is added to N navigation tools — N×2 drift surfaces otherwise).
      Note `check-tool-quality` R4 only `.describe()`-checks TOP-LEVEL fields, so the
      nested `label`/`anchor` are unguarded — describe them anyway for parity. Pin
      `show_extraction_edit`'s `inputSchema` + `intentBuilder` to emit `editSchema{schemaId}`
      (its existing shape — no sub-section field).
- **Gate:** `catalog-parity.test.ts` + `check-tool-quality` green with
      `ALLOWED_VERBS` UNCHANGED (`show_` is already allow-listed, so `show_interact`
      needs no allowlist edit) and `.describe()` on `offerAs`; the built intent
      contains no `offerAs`; an `offerAs` on a UI-only intent yields no suggested
      action; no `suggest_intent` in the catalog AND none in `SERVER_ONLY`.

## T8 — Affordance rendering: extend `suggestedActions` (pill + inline) · SEQUENTIAL

- [x] Render a `suggestedActions` entry as a pill (no `anchor`) via the existing
      chip rendering, or, with `anchor`, as inline clickable text, first occurrence;
      fall back to a pill when the phrase is not found. Inline anchoring is
      navigation-only; mutate and UI-driven actions (e.g. "show all sources",
      client-built intent) render as pills. One list; click dispatches through the
      orchestrator with `source: "user"`. Failing-test-first per render path + the
      fallback.
- **Reinvention guardrail (review correction):** the `answerSpan` aligner
      (`splitTextRun` + `normalizeForMatch`) is ALREADY exported from
      `citationFootnotes.ts` (nothing to "extract"), and `remarkCitationMarkers.ts`
      already does the link/code-safe mdast walk + preceding-text accumulation +
      clickable-node wrap shipped by `inline-footnote-citations`. Do NOT author a
      near-duplicate sibling plugin. Per principle 1 (add an axis value, not a fork),
      PARAMETERIZE the existing plugin/aligner with a match-rule axis (citations vs.
      offered-affordances); the only genuinely-new code is returning wrap offsets for
      an arbitrary anchor phrase. Generalizing clickable prose beyond `[N]` citations
      is the net-new behavior; the rendering mechanism is reuse.
- **Gate:** inline-wrap, missing-anchor-falls-back-to-pill, no-anchor-pill, and the
      citation+anchor coexistence in one Markdown render all tested; clicking
      dispatches through the orchestrator; no free-form-text intent built; the
      aligner/plugin is reused (parameterized), not copied — assert no second
      near-duplicate remark module exists.

## T9 — Pick-a-view pills + auto-advance via the standard · SEQUENTIAL

- [x] Make the onboarding pick-a-view pills (the existing `PickViewPill`) dispatch
      `showExtract` with `focusedCategoryId` directly through the orchestrator; keep
      per-category. (DONE `97d6e19` — `experience.tsx:380`.)
- [x] Confirm the auto-advance-on-"Done" dispatches `showExtract`. **NOT DONE** —
      `experience.tsx:350` still calls `advanceFrame("f3")` directly; migrate it to
      `dispatch(showExtract …)` (overlaps T6's OnboardingShell/experience unit + the
      `ui-views` "auto-advance through dispatch" requirement).
- **Gate:** the cornerstone (T1) is GREEN — works from another view + live re-focus;
      pills route through `dispatch`; the auto-advance routes through `dispatch`; no
      `?focus` carrier remains.

## T10 — Structural encapsulation + guard · SEQUENTIAL

- [x] Confine the viewer-step mutators so they are reachable only from the
      orchestrator module (no re-export to component/view/experience modules). Add a
      guard test that fails if any production module outside the orchestrator
      references a step mutator, or if an `advanceFrame` / `currentFrame` /
      `switchFrame` / `completedFrames` symbol exists. The guard SHALL also catch STALE
      COMMENTS naming the removed symbols (objective grep found 5: `router.tsx:113`,
      `useConversation.ts:14`, `ChatColumn.tsx:121`, `ScopedCanvas.tsx:13`,
      `contextBundler.ts:10-11`) — clean them; don't leave the vocabulary in prose.
      (DONE — the last structural mutator bypass was `Extract.tsx`'s synchronous
      `handleSave` direct `pushStep`; it now dispatches `presentExperienceBeat`
      `ingest-picker` through the orchestrator, mirroring the post-commit path, so
      `Extract` no longer destructures `pushStep`. Guard:
      `app/src/test/viewer-mutation-seam.guard.test.ts` — (A) walks `app/src`, fails if
      any module outside the orchestration core (`CanvasOrchestratorContext` +
      `ChatStoreContext` def + `OnboardingSessionContext`) CALLS or destructures a
      viewer-step mutator (comment mentions stripped, so prose like
      "calls ChatStore.gotoDocViewer" is not a false positive); (B) walks
      `app/src` + `middleware/src`, fails on any retired frame symbol / bare frame
      literal (`"f1"`…`"f7"`, `"f3a"`/`"f4a"`) / `onboarding-frame-` / `advance-to-f`
      test-id / `(frame f` prose in CODE OR COMMENTS. Test-infra excluded by the
      "imports vitest/@testing-library" signal + the `app/src/test/` harness dir — the
      documented `frameToStep.ts` exception and the `initialFrame` convenience
      (`renderWithOnboardingProviders.tsx`, `intentFixtures/replayIntent.tsx`) fall under
      it. Ships 2 meta self-tests proving every detector matches a known-bad sample.)
- **Gate:** the guard passes and genuinely fails on a planted violation (prove it).
      (DONE — clean tree: 6/6 green. Planted a real `pushStep(...)` call in a view
      (`SteadyShell.tsx`) and an `advanceFrame("f3")` in middleware (`ragPipeline.ts`):
      BOTH invariant tests went RED naming the exact offender + line, the 4 other tests
      stayed green; reverted byte-identical, 6/6 green again. `tsc --noEmit` app +
      middleware clean.)

## T11 — Drift guards + full verification · SEQUENTIAL

- [x] `npm --workspace app test` + the middleware suite green (incl. the intent
      replay + key-gated live-coverage suites); `npx tsc --noEmit` clean (app +
      middleware + shared); no-hardcoded-styles + widget-contract + catalog-parity +
      check-tool-quality green; `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1
      validate standardized-viewer-control --strict --json` passes; T13 + T14 closed.
- **Gate:** all green; the real typecheck (`tsc --noEmit`, not the no-op script).
      `validate --strict` passing is NECESSARY BUT NOT SUFFICIENT — also assert the
      T13 grep (no removed frame symbol survives in any durable spec without a matching
      delta) and the T14 reference-doc check. **Steady-first gate:** every migrated
      navigation intent is reachable AND tested in STEADY (incl. `editSchema` →
      the schema design surface opens for an authenticated user); no intent is a silent
      no-op in steady (audit the orchestrator switch: no `if (onboardingSession)` arm
      without an explicit, documented onboarding-only reason). Also assert the
      authenticated experience renders NO onboarding step-strip/journey nav and NO
      gate-locked affordances (owner: "same chat, minus the onboarding nav, no locked
      buttons" — already largely true via `AppNav`; verify + guard against leaks).

## T12 — Whole-plan adversarial review · SEQUENTIAL

- [x] One hostile review against the plan AND the code: every `show*` produces one
      outcome; no frame vocabulary remains anywhere (incl. the LLM context + the
      persisted snapshot + the intent corpus); affordances are server-validated and
      share one `suggestedActions` list; the seam is the sole viewer-mutation path;
      the cornerstone + a Chrome DevTools spot-check pass on the live preview.
- [x] **Closeout:** ~~delete `RESUME.md`~~ — already deleted 2026-06-17 at the user's
      request ("moving forward with the information we have"); the handoff note no
      longer exists in this folder.
- **Gate:** review passes; any finding returns the relevant task to in-progress.

## T13 — Durable-spec coverage repair · SEQUENTIAL (review-surfaced; do before T11/T12)

The change deletes `switchFrame` / `suggest_intent` / `advanceFrame` / `currentFrame`
/ `completedFrames` / `lastFrame` / `frame-advanced` and the whole frame machine, but
the delta files' `## MODIFIED` / `## REMOVED` blocks use requirement headers that DO
NOT MATCH the durable requirements that actually carry those symbols — so on archive
those durable requirements survive untouched and the spec set self-contradicts.
`openspec validate --strict` does NOT catch this (verified — it passes today).

> **SYSTEMIC (verified 2026-06-17): ALL SIX delta `## MODIFIED` headers are ORPHANED**
> (none matches a durable header): `app-architecture` "A navigation intent SHALL produce
> the same viewer-step change…", `agent-tools` "Navigation intents SHALL fully describe
> their destination", `chat-routing` "Offered viewer actions SHALL route onto
> suggestedActions…", `conversation-flow` "A suggested action SHALL render as a pill…" +
> "The chat SHALL dispatch suggested actions through the orchestrator only", `ui-views`
> (its two), `observability` "The viewer-event action vocabulary SHALL be frame-free".
> For EACH: either RETARGET the block to the real durable header it modifies (the targets
> exist — e.g. agent-tools "The app and server tool catalogs SHALL agree…", chat-routing
> "The fenced-JSON proposal paths SHALL be retired"), OR, if the requirement is genuinely
> new, move it under `## ADDED`. This applies to all six — the per-delta bullets below
> address the REMOVED-block frame symbols; this note adds the MODIFIED-header fix to
> every one.

- [x] **app-architecture** — add MODIFIED/REMOVED blocks targeting the REAL durable
      headers: `The frame model SHALL include a report builder frame f4a` (:584,
      REMOVED — the whole frame model incl. FFrame), ~~`The orphaned per-frame onboarding
      views SHALL be removed` (:658)~~ (carries NO removed *machine* symbol — only prose
      about deleting per-frame views, which this change COMPLETES rather than contradicts;
      symbol-grep does not flag it, so no delta is needed — the GATE is symbol-based),
      `Orchestrator dispatch SHALL be exhaustive over the CanvasIntent union`
      (:781 — drop the `switchFrame`→`advanceFrame` and `editSchema`→`advanceFrame("f3a")`
      cases), `ViewerSession SHALL be the master viewer-state record per chat session`
      (:65 — drop `currentFrame`/`lastFrame`), AND `F1 overlay SHALL hide the underneath
      shell from assistive tech` (:351, reads `currentFrame === "f1"` at :357). Keep the
      genuinely-new requirements (seam encapsulation, on-step sub-position, frame-free
      strip, frame-free resume) as ADDED. **M3 (hard scan):** the F1-overlay a11y
      requirement's acceptance criterion is literally `session.currentFrame === "f1"`
      (`:357`, consumed at `OnboardingShell.tsx:1090-1091` for `aria-hidden`/`inert`) —
      the delta MUST state the replacement predicate (active step kind is `ingest-picker`),
      not just delete the frame word, so the a11y guarantee doesn't regress.
- [x] **agent-tools** — MODIFY the durable F-series tool requirements (`show_understand`
      F2 :24, `show_extraction` F3 :36, `show_field_citation` F4 :48,
      `propose_schema_field` F3a :76, `propose_report_section` S3a :89, all re-stated
      frame-free) and the `suggest_intent` references in the catalog-agreement (:457),
      per-tool-guidance (:520), and server-executed (:544) requirements (the
      `suggest_intent` example swapped for the surviving server-only `lookup_groundx_docs`).
      The orphaned MODIFIED "Navigation intents SHALL fully describe their destination"
      moved to ADDED (genuinely new); the orphaned REMOVED "The `suggest_intent` tool and
      frame-named navigation" deleted (suggest_intent is not a standalone durable
      requirement — its removal is the MODIFIED-of-examples above; this REMOVED block was
      what HARD-FAILED the dry-run archive).
- [x] **chat-routing** — MODIFY `The fenced-JSON proposal paths SHALL be retired`
      (:232 — it mandated the `tool:suggest_intent` chip + `switchFrame` dispatch; now
      re-stated to drop them, keep the propose_schema_field native-tool path). The
      genuinely-new "Offered viewer actions SHALL route onto `suggestedActions`" moved to
      ADDED; the orphaned REMOVED "The `suggest_intent` router path…" deleted (folded into
      the :232 MODIFIED).
- [x] **conversation-flow** — MODIFY `The conversation SHALL persist across onboarding
      frame advances without a routing hack` (:83) AND the SEPARATE requirement at :6
      (its :21 scenario "the engine contains no `advanceFrame` references"). The two
      genuinely-new affordance requirements moved to ADDED.
- [x] **ui-views** — MODIFY the 4 durable requirements carrying the HARD `currentFrame`
      symbol — `F-series view transitions…` (:145, symbols at :149/:156), `F1 IngestView…`
      (:224, symbol :228), `F2 UnderstandView…` (:269, symbol :271), and `The onboarding
      entry SHALL compose a ChatExperience…` (:736, symbol :749 — NOTE: :749 sits in the
      :736 requirement, NOT :721 as the old note guessed). All 5 hard symbols stripped.
      The 2 invented MODIFIED headers moved to ADDED. Label-only F-series UX text in other
      requirements (:507/:522/:667 etc.) survives as UX names — carries no removed symbol.
- [x] **observability** — the change ALREADY ships an observability delta, but it
      MODIFIES a header (`The viewer-event action vocabulary SHALL be frame-free`) that
      does NOT exist in durable observability (its 6 reqs are Hotjar/Sentry/Prometheus/
      Alerts/pino/frontend-error). `frame-advanced` has ZERO durable-spec presence (it
      lives in `middleware/src/types.ts` + the route-contract test). FIX: make the
      observability delta an `## ADDED` requirement (or relocate the viewer-event
      vocabulary contract to its real durable home, e.g. `data-tier`/`app-architecture`),
      not a MODIFIED-of-nonexistent. DONE: made it `## ADDED` (frame-advanced has ZERO
      durable presence, so there is no MODIFIED target — confirmed by grepping all durable
      specs; it lives only in `middleware/src/types.ts` + the route-contract test).
- [x] **plugin-loader** (no delta today) — added a delta MODIFYING `Tour state machine
      SHALL accept tour as a third intent source` (the req at :80 holding the
      `{kind:"advanceFrame", to:"f3"}` intent at :84/:89) to dispatch the per-destination
      intents. Dormant (PLUG-blocked) but referenced a deleted intent kind. (The :66
      "inline F1-F7 flow" prose is a UX-flow-shape label, carries no removed machine
      symbol — left as-is.)
- [x] **onboarding-schema-editor** (no delta today) — added a delta MODIFYING `F3a topbar
      SHALL render the spec'd chrome` (hard `advanceFrame("f3")` at :73) and `Schema-Agent
      chat affordances SHALL surface earlier-turns + confidence delta` (hard
      `currentFrame === "f3a"` at :335) — both re-stated off the `extract-workbench` step's
      `surface: "fields" | "design"` sub-position. The pervasive "F3a" surface-name prose
      survives as a UX name.
- [x] **testing-suite / smart-report** — ASSESSED + RECORDED: NO delta needed for either.
      Neither carries a removed *machine* symbol (`advanceFrame`/`currentFrame`/
      `switchFrame`/`completedFrames`/`frameToStepStandalone`/`frame-advanced`/
      `suggest_intent`/`lastFrame`/`FFrame`) — verified by grep. testing-suite has only the
      frame *testids* (`onboarding-frame-f2/f3/f5`, `data-viewer-frame-active`) and the
      F1→F7 golden-path label; smart-report has only "frame f4/f4a" as render/builder
      surface NAMES which map onto the surviving `report.surface: "render"|"builder"` field
      this change preserves. F-series UX labels + DOM testids survive as names while the
      frame machine is retired; no durable spec there asserts a removed symbol/testid as a
      live mechanism, so the GATE (matching-block-per-removed-symbol) requires nothing.
- **Gate:** grep every `openspec/specs/*/spec.md` for the removed symbols → only the
      change's own delta files (or zero) remain; every durable requirement carrying a
      removed symbol has a matching MODIFIED/REMOVED block whose header matches the
      durable header verbatim; `openspec validate --strict` green.

## T14 — Reference-doc sync · SEQUENTIAL (review-surfaced; AGENTS.md mandate)

- [x] **`docs/agents/data-model.md`** (BLOCKER per `AGENTS.md` — "you MUST update the
      reconciliation matrix in the same change"): drop `switchFrame` from the
      CanvasIntent union (:114), `lastFrame`/`completedFrames` from EntitySession
      (:116), `currentFrame` from OnboardingSession (:117); add `showInteract`, the
      `editSchema` real outcome, the `extract-workbench.surface` field, and the
      active-step + reached-set fields.
- [x] **`docs/agents/architecture.md`** — update the `advanceFrame` action (:74), the
      `currentFrame`-derived fallback note (:129), and the `frame-advanced` viewer-event
      (:165).
- [x] **`docs/agents/onboarding-flow.md`** — rewrite the `advanceFrame`/`?focus=`
      dead-button mechanism (:23/:69/:78) now that pills dispatch and `?focus=` is gone.
- [x] **`docs/agents/overview.md`** — note the F-series frame machine is retired
      (labels may survive as UX names; the `advanceFrame`/`currentFrame`/`completedFrames`
      machine does not).
- [x] **`docs/agents/chat-session-model.md`** (review-found miss) — `lastFrame`/
      `completedFrames` as the "current entity axis" (:36/:101-102) and the viewer-event
      table rows `frame-advanced`/`advanceFrame` (:217-218). Most material doc after
      data-model.md.
- [x] **`docs/agents/gotchas.md`** (miss) — instructs calling `advanceFrame(frame)`
      (:138-139).
- [x] **`docs/agents/testing.md`** (miss) — the `initialFrame` harness option that sets
      `session.currentFrame` (:42/:68); reconcile with the new step-seed harness.
- [x] **`docs/agents/widget-contract.md`** (miss) — `OnboardingNav` "the LLM dispatches
      `switchFrame` intents" (:811).
- **Gate:** no removed symbol is documented as current/canonical in any `docs/agents/`
      reference doc (grep the full `docs/agents/` tree for the removed symbols → clean).

## T15 — Final-review fixes (2026-06-18 fresh whole-diff adversarial review)

The final fresh review (reviewing the net diff as an outside PR) found a real blocker that
every prior pass — including the "green" T12 review — missed, because the two halves were
each tested but the SEAM between them was not.

- [x] **BLOCKER — wire the durable reached-set to the strip (kill the dormant plumbing).**
      The persisted + server-twinned `EntitySession.reachedStages` (the R3/D13 deliverable,
      written by `markStageReached`) is NEVER read: `OnboardingShell.tsx:369` keeps its OWN
      `useState<Set<StepId>>` re-accumulated from `currentStep`, and the inline comment
      (:366-368) admits it's "the remaining strip-wiring item." Consequence: dormant
      persistence, two sets that can drift, and **cross-reload checkmarks are broken** (on
      hydrate the strip re-seeds from `currentStep` only, losing the persisted non-contiguous
      history). FIX: expose `reachedStages` on `OnboardingSessionState` (project the active
      entity's set); the strip reads `session.reachedStages ∪ {currentStep}` (single source);
      delete the local `useState`/`useEffect`; seed `reachedStages` in the test harness; ADD a
      cross-reload checkmark test (the missing seam); keep jump-ahead/non-contiguous/no-relock
      green; remove the stale comment.
      DONE 2026-06-18: `OnboardingSessionState.reachedStages` projects `active?.reachedStages`
      (stable empty-set const); `OnboardingShell` reads `session.reachedStages ∪ {currentStep}`
      via `useMemo` (local `useState`/`useEffect` deleted); the harness/provider seed now mirrors
      the live path (`pickScenario` origin `[ingest,understand]` ∪ seeded-step stage); added the
      cross-reload non-contiguous-checkmark seam test (verified RED against the old code, GREEN
      with the fix). `session.reachedStages` now has a real reader. tsc + full app suite (1911)
      green.
- [x] **SHOULD-FIX — one kind→stage mapping.** `shared/src/index.ts:916`
      `viewerStepKindToJourneyStage` and app `journeyCatalog.ts:58` `VIEWER_STEP_TO_JOURNEY`
      are two hand-written copies (the comment claims derivation; there's none, no cross-check
      test) — and the new shared map matches the exact `doc-viewer:understand` signature the
      project's own `recurrence-drift-guards` guard (f) forbids, escaping it only because the
      guard scans `app/src` not `shared/src`. FIX: derive `VIEWER_STEP_TO_JOURNEY[k].step` from
      the shared map (+cross-check) AND extend the drift guard to also scan `shared/src`.
      DONE 2026-06-18 — `VIEWER_STEP_TO_JOURNEY[k].step` now built via
      `Object.fromEntries` over the shared `viewerStepKindToJourneyStage` (only the
      strip-specific `substep` is owned app-side via `VIEWER_STEP_SUBSTEP`); added a
      `journeyCatalog.test.ts` cross-check asserting derived `step === shared[k]` for every
      kind + total-coverage. Drift guard (f) refactored: the kind→STAGE check now scans BOTH
      `app/src` AND `shared/src`, allowing the ONE canonical site `shared/src/index.ts` and
      forbidding a rival literal in either tree (proven non-vacuous by a planted
      `shared/src/__driftplant__.ts` → fired, then removed). app suite 1914 / guards green.
- [x] **SHOULD-FIX — un-guarded second mutation path.** `pickScenario` calls `pushStep` and is
      invoked directly from views (`IngestView.tsx:101`, `OnboardingShell.tsx:306`); `IngestView`
      ALSO dispatches `showSample` right after (:103), double-calling `pickScenario`. Fix the
      redundant double-call; assess widening the seam guard to cover `pickScenario`/
      `returnToIngestPicker` (currently only the named mutators are unrepresentable).
      DONE 2026-06-18 (double-call) — `IngestView.handlePickScenario` now activates the sample
      ONLY through `dispatch({kind:"showSample"})` (whose orchestrator handler calls
      `pickScenario`); the direct `pickScenario(scenario)` call + its dep were removed. Failing
      seam test first: counts `track("sample.picked")` = 1 (was 2), proven non-vacuous by
      re-introducing the call → RED, then restored. The seam-guard WIDENING assessment for
      `pickScenario`/`returnToIngestPicker` is NOT taken here (left as a deliberate follow-up;
      out of scope for the double-call fix).
- [x] **NOTE fixes:** `StepId = JourneyStage` alias (third vocab copy); de-dup the
      `scanningDocViewerStep`/"scenario:unknown" literal (orchestrator reuses one source);
      correct the `showInteract` comment that claims a scenario-fallback that doesn't exist;
      consider re-stating the residual "frame f4/f4a" LABELS in agent-tools/smart-report durable
      specs onto `report.surface:"builder"`; rename `isF1` (frame-free semantics).
      DONE 2026-06-18 (3 of 5) — (a) `StepId` now `= JourneyStage` (imported from
      `@groundx/shared`); the redundant `as ReadonlySet<StepId>` cast + stale "value-identical"
      comment in `OnboardingShell` removed; tsc clean (the unions were structurally identical).
      (b) `scanningDocViewerStep` extracted to its own module
      (`contexts/OnboardingSessionContext/scanningDocViewerStep.ts`), exported via the barrel;
      both `pickScenario` and the orchestrator `understand-scanning` beat now build the step
      from this ONE source (no inline `scenario:unknown` literal rebuild). (c) `showInteract`
      comment in `onboarding/experience.tsx` corrected to state the handler resolves the step's
      doc ONLY from `scope` (no scenario-fallback) and the onboarding canvas is fed from the
      shell's `canvasScope` prop. The two remaining sub-items (re-state f4/f4a durable-spec
      LABELS; rename `isF1`) are NOT done — left as separate follow-ups (out of scope here).
- **Gate:** `session.reachedStages` has a real reader; cross-reload checkmarks tested; one
      kind→stage map (cross-checked + guard scans shared/src); no double-pickScenario; full
      suites + guards + validate + archive dry-run green.

## Deferred (tracked, not in this change)

- Per-category pills as a general/steady pattern at arbitrary schema cardinality;
  outside onboarding, category navigation lives inside the Extract widget.
- **Persistent viewer-destination switcher for the authenticated experience**
  (owner-deferred 2026-06-17). For now steady navigation = chat + agent-offered
  affordances + citation jumps. This change makes every destination dispatchable through
  the seam, so a switcher later is a thin consumer; the decision is deferred, not the
  capability.
- Persisted-intent data migration is NOT required (pre-launch; `parseCanvasIntent`
  degrades unknown kinds to null).
- **NOTE-level closeout follow-ups (from the T12 hostile review):**
  (a) ~~make `interact-chat.scenarioId` optional~~ **DONE 2026-06-18 — REMOVED entirely.**
  A read-audit showed `interact-chat.scenarioId` was never consumed for behavior (the
  canvas resolves its document from `scope`/`documentId`; the chat derives its scenario
  from the session) — it was set, persisted, restored, and never read. So the right fix
  was deletion, not "optional": dropped from the `ViewerStep` union, `PersistedViewerStep`
  schema, the serializer, the two production set-sites (`showInteract` handler +
  `OnboardingShell` canvas-step fallback, which had hardcoded `?? "utility"`), the test
  fixtures, and `data-model.md`. (`extract-workbench.scenarioId` stays — it is the real
  schemaId.) tsc/app 1909/mw 1016/guards/validate all green. (b) **DONE 2026-06-18 — moved**
  `replayIntent.tsx` from `app/src/conversation/intentFixtures/` to `app/src/test/`
  (its `./types` import → `@/conversation/intentFixtures/types`; importers updated;
  the seam-guard doc comment updated). Now ALL test-only frame conveniences live under
  the one `app/src/test/` directory (the guard's documented exclusion #2), so the only
  frame vocabulary anywhere is that single test-harness directory. tsc/app 1909/mw 1016
  green.

> **discipline §8 (satisfied 2026-06-18):** the two deferred features are filed as GitHub
> Issues — **#28** (steady per-category pills) and **#29** (persistent destination-switcher
> decision). The persisted-intent item is a non-action (nothing to do), so no Issue.
>
> **#30 (filed 2026-06-18, PRE-EXISTING, surfaced in the final review):** verify/fix that
> `lastStep` restores the CANVAS on a returning-user reload, not just the entity field. The
> resume anchor is persisted + restored as a field, but the viewer is reset to EMPTY on
> hydrate and the `pickScenario` re-push is conditionally skipped by the `sampleAlreadyActive`
> guard — canvas-level resume is UNTESTED. This change PRESERVED that pre-existing resume
> mechanism (it only swapped `lastFrame`→`lastStep`), so it is NOT a regression introduced
> here; tracked as #30.
