# Design — standardized-viewer-control

> Source-of-truth / drift-prevention doc for this cross-cutting change.
> **Sections 1–3 are settled** (current-state map + locked target + resolved
> affordance design).
>
> **Review corrections (2026-06-17 adversarial review) — read before executing:**
> 1. **Partially pre-landed:** `showExtract.focusedCategoryId` (T4) and
>    `suggestedActions.anchor` (T2, `index.ts:641`) already shipped — §1's
>    "inline clickable is only a citation precedent" understates this; the anchor
>    field exists, only its render path (T8) is missing.
> 2. **`advanceFrame` = 18 trigger sites, not 36** (§3.3 corrected).
> 3. **Catalog completeness guard is schema-derived** — no "30→31" count to bump.
> 4. **T8 is mostly reuse, not new build:** the `answerSpan` aligner
>    (`splitTextRun`/`normalizeForMatch`) is already exported and the citation remark
>    plugin already wraps clickable prose — PARAMETERIZE it (match-rule axis), don't
>    fork a sibling. (§3.2 wording "extract the helper" is wrong — it's already
>    extracted.)
> 5. **Durable-spec coverage gap (blocker, → new T13):** the deltas' MODIFIED/REMOVED
>    headers do not match the durable requirements that carry the removed frame
>    symbols; `plugin-loader` + `onboarding-schema-editor` have no delta at all.
>    `openspec validate --strict` PASSES anyway (does not catch this).
> 6. **Reference docs not in the plan (→ new T14):** `data-model.md` (AGENTS.md
>    mandates same-change update), `architecture.md`, `onboarding-flow.md`.
> 7. **T9 is partial:** pick-a-view pills migrated; the auto-advance still calls
>    `advanceFrame("f3")`.

## 0. Design decisions RESOLVED by the 2nd review (2026-06-17) — steady-first

A second, independent code-grounded review found the locked design under-modeled the
frame state. **Root cause: the frame carried information the 4-value stage + a single
*monotonic* watermark cannot — sub-position (extract vs interact vs render vs builder),
backward transitions, and a *non-contiguous reached SET*.** Plus a steady-experience
audit found `editSchema`/`switchFrame` are NO-OPs in steady (the schema design surface
is UNREACHABLE for authenticated users). The risks (R1–R7) are stated below, EACH WITH
ITS RESOLUTION — no deferred decisions. Per the steady-first orientation, every
resolution is designed for the authenticated experience; onboarding overlays it.

- **R1 (BLOCKER) — `understand.completed` analytics loses granularity (D12).** Today
  it fires on the `f2→f3` transition and a test asserts it does NOT fire on `f2→f5`
  (`OnboardingSessionContext.test.tsx:155,164`). But f3, f3a, f4, f4a, f5, f6 ALL map
  to the single `analyze` stage (`OnboardingShell.tsx:80-85`). Re-homing the analytics
  onto "fire when the `analyze` stage watermark increments" WILL fire on `f2→f5`,
  breaking the test. The analytics is bound to a *sub-destination* (Extract), not the
  stage. → Fire it on the `showExtract` first-reach specifically, not the stage.
- **R2 (BLOCKER) — `advanceFrame("f1")` entity-deactivate is a BACKWARD transition
  (D12).** A monotonic watermark only increments; "fire entity-deactivate when the
  watermark increments" can never model a return to Ingest. Re-home onto the actual
  trigger (the dispatch back to picker / `showSample` / `openGate`), not a watermark
  edge. Pinned by `gateLifecycle.test.tsx` (advanceFrame("f1") dismisses an open gate).
- **R3 (BLOCKER) — a monotonic watermark can't reproduce `completedFrames` for
  `integrate` (D3/D13).** `integrate` is auth-gated and reachable from anywhere; the
  persisted set is genuinely non-contiguous (`ChatStoreContext.test.tsx` persists
  `["f1","f2","f3","f7"]` with `lastFrame:"f5"`). A high-water-mark loses "which
  stages were each individually visited." → The reached-set replacement must be a
  **SET of reached stages**, not a single high-water value.
- **R4 (BLOCKER) — render(f4) vs builder(f4a) is a frame read T3 strands.**
  `OnboardingShell.tsx:670` reads `currentFrame === "f4a"` to choose the report
  CanvasKind; the `report` ViewerStep already carries `surface?: "render"|"builder"`
  (`types.ts:423`) — T6 must move this read onto the step's `surface` field, which the
  frame-free-strip task (T3) alone does not cover.
- **R5 (BLOCKER) — the active viewer step is NOT persisted today (D13).** `serialize`
  writes only entities/messages/etc.; `deserialize`/`hydrateFromServer` hardcode
  `viewer: EMPTY_VIEWER_SESSION`. So "persist the active step, restore verbatim" is a
  **net-new, nested, untrusted-input persistence surface** (the ViewerStep union with
  citations/litRegions) requiring a `parseChatStoreSnapshot` sub-schema + a
  `STORAGE_VERSION` bump — NOT the "drop two fields, add two" D13 frames it as. State
  explicitly that **overlays are NOT in the resume anchor** (else a stale `sign-up`
  overlay restores over an `idle` gate — gate is reset to idle on hydrate today).
- **R6 (SHOULD-FIX) — the setState side-effect anti-pattern.** The watermark increment
  will be computed inside a reducer/setState updater; detecting "did it increment?"
  from a flag mutated there is the exact silently-failing pattern that already bit
  `openGate`→sign-up-overlay ([[feedback_no_sideeffect_flags_in_setstate]]). T5 MUST
  mandate computing the first-reach decision from a synced ref, as `openGate` now does
  (`OnboardingSessionContext.tsx:110-120,309-324`).
- **R7 (BLOCKER) — f3a / schema-editor is orphaned.** `editSchema`'s entire behavior
  is `advanceFrame("f3a")` (`CanvasOrchestratorContext.tsx:449`), and there is NO
  intent in `canvasIntentSchema` that reaches the f3a design surface. Three reads gate
  on it (`experience.tsx:261`, `Extract.tsx:380` `isDesignSurface`, `Extract.tsx:1583/
  1587` call `advanceFrame("f3a")`). Removing `advanceFrame` strands the whole schema
  editor. Likewise `Extract.tsx:446` calls `advanceFrame("f1")` with no f1/ingest
  intent to migrate to. → T2/T5 must add the destination intents (an Extract
  design-surface position and/or an ingest/picker intent), or the migration breaks
  these surfaces. This is the largest MISSING piece.

### Resolutions (steady-first; no deferred decisions)

- **R1 →** `understand.completed` fires on the session's FIRST `showExtract` dispatch
  (the Extract first-reach), computed from a SYNCED REF (R6), NOT on the `analyze`-stage
  increment (f5/interact also reaches `analyze`). Onboarding-only analytic (steady has
  no journey). Keeps the existing "no-fire on `f2→f5`" test green.
- **R2 →** the f1 entity-deactivate + gate-reset re-home onto the EXPLICIT dispatch that
  returns to ingest/picker (the save-and-return path / a picker intent), not a watermark
  edge. Onboarding-only.
- **R3 →** the reached-set is a **SET of reached stages** (onboarding journey-progress
  only), NOT a monotonic high-water value — it must reproduce the non-contiguous
  `integrate`-then-back case. Steady has no journey-progress, so this state is purely the
  onboarding overlay.
- **R4 →** render-vs-builder stays on the `report` step's `surface` field (already
  steady-correct); the onboarding strip reads `surface` from the step. The only work is
  deleting the `currentFrame === "f4a"` read at `OnboardingShell.tsx:670`.
- **R5 →** persist the active viewer step as a NEW versioned snapshot field carrying ONLY
  the navigational payload (kind + scope/schemaId/focusedCategoryId/templateId/
  selectedSectionId/surface/design-mode) — NOT ephemeral citation highlights (rebuilt on
  demand). Overlays are NOT persisted. Bump `STORAGE_VERSION`; migrate the server twin
  (`completedFramesJson`→reached-set) too. This is a PRODUCTION resume improvement —
  steady doesn't persist `viewer` today either, so both experiences gain verbatim resume.
- **R6 →** every one-time side-effect decision is computed from a SYNCED REF (the
  established `openGate` pattern, `OnboardingSessionContext.tsx:110-120`), never a flag
  mutated inside a setState/reducer updater. Mandated in T5's gate.
- **R7 → (the steady-first headline)** the schema-design surface becomes an
  EXPERIENCE-AGNOSTIC sub-position on the `extract-workbench` step — a
  **`surface: "fields" | "design"`** field MIRRORING `report.surface: "render" |
  "builder"` (NOT a new `mode` field — Extract/Report share the meta-pattern, and `mode`
  is already the widget-contract prop name). `editSchema` gets a REAL orchestrator outcome
  that pushes/mutates that step into `surface:"design"` in BOTH steady and onboarding (NO
  `advanceFrame("f3a")`, NO experience fork) — exactly mirroring how `editTemplate` pushes
  `report` `surface:"builder"`. `isDesignSurface` reads the step's `surface`, not
  `currentFrame`. The in-widget "Edit schema" menu and the new `show_extraction_edit`
  offer dispatch the same intent. The existing `SchemaView` design pane, the
  `propose/accept/reject schema-field` tools, `PendingSchemaOverlay`, and `saveTemplate`
  are ALL REUSED (surface-agnostic already) — `editSchema`'s only job is the sub-position
  flip. **This CLOSES a production bug** (authenticated users could not reach the schema
  editor at all). **The f1/ingest return** (`Extract.tsx:446`, onboarding save-and-return)
  dispatches the existing `ingest-picker` step (reuse `showSample`/the picker; onboarding
  choreography only — in steady, finishing a schema edit returns to `surface:"fields"` of
  the same step, NOT to a picker). `showSample` is made explicitly onboarding-scoped (an
  honest no-op-with-reason in steady, not a silent dead intent). After this, the
  f3a/f1/f4a frames are pure onboarding projections that the retirement deletes with
  nothing stranded.

**Net schema/data impact:** `canvasIntentSchema` — `editSchema` gains a real outcome
(no new kind needed; it already exists); `extract-workbench` ViewerStep gains a
**`surface: "fields" | "design"`** sub-position (mirroring `report.surface`, NOT a new
`mode` field); journey reached-set becomes a **stage SET** (NOT a monotonic watermark —
R3; standardize all "watermark" wording on "reached-set"); the persisted snapshot gains a
versioned active-step + reached-set and drops `lastFrame`/`completedFrames`.

## 1. Current architecture (what exists today)

### 1.1 The seam
`CanvasOrchestrator.dispatch(intent, source)` — `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx:82`.
Every dispatch does a telemetry triple-write (`setCurrentIntent` + `appendViewerEvent` + server `recordIntent`) then runs an exhaustive `switch (intent.kind)` routing to either ChatStore viewer mutators or `OnboardingSession`. A new intent kind without a case fails `tsc` (`assertNeverIntent`).

### 1.2 Two state models (one of them legacy)
- **Viewer steps** (the real "what's shown" model): `ViewerStep` union in `app/src/contexts/ChatStoreContext/types.ts:426` — `ingest-picker | doc-viewer | extract-workbench | interact-chat | report | integrate`, with overlays (`sign-up | citation-peek | book-call`) z-stacked on top. The canvas renders the active step via `stepToCanvasKind` → the production widget registry (`scopedViewerWidgetRegistryProduction.ts`, one mount per `CanvasKind`).
- **Onboarding frames** (legacy alias): `OnboardingSession.advanceFrame(frame)` maps f1–f7 → a step via `frameToStepStandalone` (`OnboardingSessionContext.tsx:26`) then `pushStep`. `currentFrame` is a derived getter; the canvas already switches on `currentStep.kind`, not the frame. Frames *also* encode journey stage + completion (`completedFrames`) + gating — the double duty this change unwinds.

### 1.3 Intent → viewer, and the onboarding/steady fork
The orchestrator forks the `show*` family on `routeThroughOnboarding`
(`CanvasOrchestratorContext.tsx:325–365`): onboarding → `advanceFrame("f3"/"f4"/"f7"/"f4a")`, steady → `pushStep({kind:…})`. `showExtract` ignores its `scope`/`schemaId` payload and hardcodes `scenarioId:"utility"` (the D6 bug).

### 1.4 LLM tool → intent (server-validated; never free-form)
Middleware: LLM tool call → `getServerTool(name)` in `SERVER_TOOL_CATALOG` (`middleware/src/services/toolCatalog.ts`) → JSON-parse args → Zod-validate against `tool.inputSchema` → `tool.intentBuilder(validatedArgs)` → `CanvasIntent` (`middleware/src/services/ragPipeline.ts:162–226`). Then:
- `category:"read"` → `reply.intents[]` (auto-dispatched, `source:"agent"`).
- `category:"mutate"` → `reply.suggestedActions[]` as a `tool:<name>` chip carrying `detail.intent` (dispatched on click, `source:"user"`).
- `serverExecute` tools (e.g. `lookup_groundx_docs`) run inside the grounded loop and never emit an intent.
Each tool is intent-routed XOR server-executed. App `*.tools.ts` mirror the catalog; `catalog-parity.test.ts` enforces name + verbatim-description + role + `rendersWidget` parity.

### 1.5 Clickable affordances that already ship
- **Pills:** `reply.suggestedActions[]` → `SuggestedActionChips` → `handleSuggestedAction` → `suggestedActionToIntent` (reads `tool:*` `detail.intent`) → `dispatch` (`useConversation.ts:198–330`, `chatPrimitives.tsx`).
- **Inline clickable text (precedent):** answer prose `[N]` tokens → `remarkCitationMarkers` plugin → `CiteChip` footnote button → `highlightCitation` intent on click (`primitives/Markdown/*`, `brand/CiteChip/CiteChip.tsx`). Phrase alignment via the citation's `answerSpan`.
- **`suggest_intent`** (server-only tool) already emits an *offered navigation* chip — currently legacy-mapped to `switchFrame`. This is the seed for the general affordance.

### 1.6 The bypassing triggers (the problem)
- Onboarding pick-a-view pills: `advanceFrame("f3") + navigate(?focus=…)` directly (`conversation/experiences/onboarding/experience.tsx:362–376`). `?focus` is read once at Extract mount (`Extract.tsx:445,459`) → non-reactive → dead buttons.
- Step-strip pills: onClick wired in `OnboardingShell` to `advanceFrame` directly.
Both skip `dispatch` → no telemetry, no shared behavior.

## 2. Target (locked decisions D1–D9)

See `proposal.md` Scope table. In one picture:

```
ANY trigger ─┐
 (LLM tool,  │
  chip,      │
  citation,  ├─▶ dispatch(intent, source) ──▶ ONE per-kind switch ──▶ pushStep / mutate active step
  step strip,│        (telemetry triple-write)        │                 (viewer.history)
  pickview,  │                                         └─▶ advance journey-progress (stage/reached/gating)
  auto-adv)  ┘
                                                  canvas = pure function of active ViewerStep
                                                  step strip + jump-ahead guard = function of journey-progress
```

- **No frames.** `advanceFrame`/`currentFrame`/`frameToStepStandalone`/`switchFrame`/`completedFrames` removed. Intents name destinations directly (D4). The `show*` handlers stop forking on `routeThroughOnboarding` (one outcome; onboarding layers journey + gate on top). `advanceFrame`'s non-nav side effects (entity-deactivate, gate reset + overlay pop, analytics) re-home into the dispatch handlers (D12).
- **Journey progress needs a frame-free SOURCE** (D3). Correction from the second review: `currentStep` (`= FRAME_TO_STEP[currentFrame]`, `OnboardingShell.tsx:199`), `completedSteps` (`completedFrames` mapped through `FRAME_TO_STEP`, `:330`), and `analyzeSubsteps(currentFrame, …)` are ALL frame-derived — the strip is a step-shaped VIEW over frame state, not an independent model. Keep the strip's consumer shape (`JOURNEY_CATALOG`/`pillState`/`StepDescriptor`) but re-source it: the **current stage** already derives from the active step kind via `VIEWER_STEP_TO_JOURNEY` (`:199–203`, frame only a fallback) — REUSE it, drop the fallback; the **reached-set** (checkmarks) from a small persisted **set of reached stages** (D13; NOT a monotonic watermark — §0 R3), a stage added on dispatch only on a first-time reach. Only `completedSteps` + `analyzeSubsteps` are fully frame-derived. Preserve the `analyzeReached` rule (`:339–343`) and the jump-ahead regression test. Onboarding-only.
- **Sub-position on the step** (D5): `extract-workbench.focusedCategoryId`, `report.selectedSectionId`. `ScopedCanvas` forwards to the widget; sub-position changes mutate the active step in place. Extract reads focus from props; `schemaOverlay.focusedCategoryId` and its `setFocusedCategory` callers removed.
- **Offer = a disposition, not a new tool** (D7): a navigation tool call MAY carry optional `offerAs: { label, anchor? }`; presence routes it to the OFFERED `suggestedActions` list instead of auto-dispatch. The **existing `suggestedActions` is extended with an optional `anchor`** (D8) — one list, rendered as a pill (no `anchor`) or an inline clickable phrase. `suggest_intent`/`switchFrame` removed.
- **Persistence + LLM-context** (D13): the resume anchor becomes a **persisted active viewer step** (replacing `lastFrame`, restored verbatim — not a watermark); the reached-set becomes a **persisted set of reached stages** (replacing `completedFrames`, checkmarks only; NOT a monotonic watermark — §0 R3); the agent's snapshot sends the journey stage + active step kind. Two frame-named persisted fields out, two frame-free in.

## 3. Affordance authoring, inline binding, enforcement — RESOLVED

### 3.1 Offer vs perform (Q-a) — a disposition on the navigation tools
Offering is a DISPOSITION on the existing navigation tools, not a new tool. A
navigation tool's `inputSchema` gains an optional presentation field:

```
show_extraction({ ...domainArgs, offerAs?: { label, anchor? } })
```

- `offerAs` ABSENT -> the tool auto-dispatches per its category (today's behavior;
  `read` navigation lands on `reply.intents[]`).
- `offerAs` PRESENT -> the server builds the intent via the SAME `intentBuilder`
  (so it is server-validated, never free-form) but surfaces it as an OFFERED entry
  on `suggestedActions` (with `label` + optional `anchor`) instead of
  auto-dispatching.
- **Mutate tools** stay always-offered (unchanged). **Perform + offer both,
  mixable:** a turn can call `show_extraction` directly (perform) and call it again
  with `offerAs` (offer); the same action is expressible either way. No new tool, no
  new verb — so the `check-tool-quality` `ALLOWED_VERBS` allowlist is untouched, and
  the flat one-tool-one-`intentBuilder` model is preserved.
- Offer-eligible tools are exactly the navigation tools that have an `intentBuilder`
  AND are LLM-emittable per the shared `intentCatalog` (`llm` field). UI-only
  intents (`showSample`, `openDocument`, `showCitations`) are NOT offerable. A NEW
  interact navigation tool (emitting `showInteract`) is added.
- **`editSchema` IS offer-eligible (owner decision 2026-06-17).** Now that the
  schema-design surface is a real reachable destination (R7), the agent MAY offer a
  clickable "→ edit this schema" affordance. This requires the navigation tool
  **`show_extraction_edit`** — the `_edit` sibling of `show_extraction`, EXACTLY
  mirroring the shipped `show_smart_report_edit` (the `_edit` sibling of
  `show_smart_report_render` that emits `editTemplate`). NOT a novel `show_schema_editor`
  and NOT a design-mode arg on `show_extraction` (Report shipped a separate `_edit` tool,
  not a `surface` arg on its render tool — mirror that; the locked memory
  `project_template_scope_results` names the sibling pair `show_extraction_edit` +
  `show_smart_report_edit`). It emits `editSchema`, `category: "read"` (navigation), and
  is marked LLM-emittable. `editSchema` moves OUT of the UI-only set.

### 3.2 Inline binding (Q-b) — extend `suggestedActions`, phrase match, fallback
- The existing `suggestedActions` entry shape gains one optional field: `anchor`
  (the inline-binding phrase). NO new `affordances[]` field — one list.
- No `anchor` -> renders as a follow-up **pill** (the existing `SuggestedActionChips`
  rendering).
- With `anchor` -> a remark plugin (sibling of `remarkCitationMarkers`) finds that
  phrase in the answer prose via the citation `answerSpan` alignment
  (normalization-tolerant), wraps the FIRST occurrence as an inline clickable that
  dispatches the entry's intent on click. If the phrase is not found, it **falls
  back to a pill** so the action is never lost.
- The `?focus=` URL param is dropped as a navigation carrier. On-step
  `focusedCategoryId` (D5) plus the dispatched intent are the source of truth.

### 3.3 Enforcement (Q-c) — structural encapsulation
The viewer-step mutators (`pushStep`, `gotoDocViewer`, `showCitationRegions`,
`clearCitationHighlight`, `clearCitationRegions`, the new mutate-active-step) SHALL
be reachable ONLY from the orchestrator's `dispatch`. Bypass is made
unrepresentable, not merely tested.

**Grounding (audited 2026-06-17):** the push/goto/citation step mutators already
have ZERO callers outside `ChatStoreContext` (definition) and
`CanvasOrchestratorContext` (dispatch) — encapsulation there is *formalizing a
near-true boundary*. (`setFocusedCategory` is the one exception — Extract calls it
today — and it is REMOVED under D5 in favor of the dispatched on-step focus, which
resolves it.) The real migration is **`advanceFrame`: 18 production trigger call
sites** (re-verified 2026-06-17; the earlier "36" counted comments/orchestrator/tests)
in widgets/views (Extract ×6, SmartReportBuilder ×2, SignUpWidget ×1, GateChatRail ×1,
OnboardingShell ×4, the onboarding experience ×4 incl. the still-unmigrated
auto-advance and the interact pill). Removing `advanceFrame`
(D2) forces every one onto `dispatch(show* / editTemplate / openGate / …)` by
construction — that migration IS the standardization. After removal the
orchestrator is the sole module importing the step mutators; a guard test backs the
boundary, and the `advanceFrame` symbol no longer exists for a trigger to call.

### 3.4 The dependencies the first plan dropped (now explicit)
- **Intent corpus + `intentCatalog`** (D11): `intentFixtures/fixtures.tsx` is the
  single source of truth for every intent kind and contains a `switchFrame` fixture
  (via `suggest_intent`). Remove it; add a `showInteract` fixture + its `intentCatalog`
  `llm` prompt; keep the replay + live-coverage suites green.
- **`advanceFrame` side effects** (D12): re-home entity-deactivate (old f1), gate
  reset + sign-up overlay pop (old f7), and `understand.completed` analytics onto the
  **journey-progress advance (onboarding only)** — NOT the raw intent handlers, so
  arbitrary navigation to the same destination does not fire them.
- **`frame-advanced` viewer-event** (D14): the `viewerEventActionSchema` enum
  (`middleware/src/types.ts:141`) + its `app.ts` validation + the `apiRouteContract`
  test drop `frame-advanced` for a stage/step action.
- **Resume + persistence + LLM-context snapshot** (D13). The persisted snapshot
  (`parseChatStoreSnapshot`) stores only `lastFrame` + `completedFrames` per entity;
  the viewer step is RESET to empty on hydrate and rebuilt from `lastFrame`, so
  `lastFrame` is the SOLE resume anchor (and the code warns that conflating it with a
  highest-reached watermark caused a stale-resume bug). Therefore: persist the
  **active viewer step** as the resume anchor (replacing `lastFrame`, restored
  verbatim), persist a **set of reached stages** for checkmarks (replacing
  `completedFrames`, never used for resume; NOT a monotonic watermark — §0 R3), and send the journey stage + active step
  kind in the chat-request snapshot. Pre-launch — no data migration.
- **`offerAs` obligations** (N3): `offerAs` lives in each navigation tool's domain
  `inputSchema` (the only place an LLM tool-call can carry it), so it needs a
  `.describe()` (check-tool-quality Rule 4) AND each navigation `intentBuilder` MUST
  ignore it (presentation, not a domain arg — must not flow into the intent).
- **Inline-anchor plugin** (N7): share the `answerSpan` alignment helper in
  `citationFootnotes.ts` rather than duplicating it.
- **`showExtract` payload + no fork** (D6): honor `scope`/`schemaId`; no hardcoded
  `"utility"`; `show*` handlers do not fork on experience.
