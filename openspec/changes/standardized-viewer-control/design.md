# Design — standardized-viewer-control

> Source-of-truth / drift-prevention doc for this cross-cutting change.
> **Sections 1–2 are settled** (current-state map + locked target). **Section 3
> (affordance authoring + inline binding + enforcement) is pending the open
> questions in `proposal.md`** and will be filled before `tasks.md` is written.

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
- **Journey progress needs a frame-free SOURCE** (D3). Correction from the second review: `currentStep` (`= FRAME_TO_STEP[currentFrame]`, `OnboardingShell.tsx:199`), `completedSteps` (`completedFrames` mapped through `FRAME_TO_STEP`, `:330`), and `analyzeSubsteps(currentFrame, …)` are ALL frame-derived — the strip is a step-shaped VIEW over frame state, not an independent model. Keep the strip's consumer shape (`JOURNEY_CATALOG`/`pillState`/`StepDescriptor`) but re-source it: the **current stage** already derives from the active step kind via `VIEWER_STEP_TO_JOURNEY` (`:199–203`, frame only a fallback) — REUSE it, drop the fallback; the **reached-set** (checkmarks) from a small persisted **stage watermark** (D13), incremented on dispatch only on a first-time reach. Only `completedSteps` + `analyzeSubsteps` are fully frame-derived. Preserve the `analyzeReached` rule (`:339–343`) and the jump-ahead regression test. Onboarding-only.
- **Sub-position on the step** (D5): `extract-workbench.focusedCategoryId`, `report.selectedSectionId`. `ScopedCanvas` forwards to the widget; sub-position changes mutate the active step in place. Extract reads focus from props; `schemaOverlay.focusedCategoryId` and its `setFocusedCategory` callers removed.
- **Offer = a disposition, not a new tool** (D7): a navigation tool call MAY carry optional `offerAs: { label, anchor? }`; presence routes it to the OFFERED `suggestedActions` list instead of auto-dispatch. The **existing `suggestedActions` is extended with an optional `anchor`** (D8) — one list, rendered as a pill (no `anchor`) or an inline clickable phrase. `suggest_intent`/`switchFrame` removed.
- **Persistence + LLM-context** (D13): the resume anchor becomes a **persisted active viewer step** (replacing `lastFrame`, restored verbatim — not a watermark); the reached-set becomes a **persisted stage watermark** (replacing `completedFrames`, checkmarks only); the agent's snapshot sends the journey stage + active step kind. Two frame-named persisted fields out, two frame-free in.

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
  intents (`showSample`, `openDocument`, `showCitations`, `editSchema`) are NOT
  offerable. A NEW interact navigation tool (emitting `showInteract`) is added.

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
resolves it.) The real migration is **`advanceFrame`: 36 production call sites** in
widgets/views (Extract, SmartReportBuilder, SmartReportRender, SignUpWidget,
Integrate.tools, OnboardingShell, the pick-a-view pills). Removing `advanceFrame`
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
  verbatim), persist a **stage watermark** for checkmarks (replacing
  `completedFrames`, never used for resume), and send the journey stage + active step
  kind in the chat-request snapshot. Pre-launch — no data migration.
- **`offerAs` obligations** (N3): `offerAs` lives in each navigation tool's domain
  `inputSchema` (the only place an LLM tool-call can carry it), so it needs a
  `.describe()` (check-tool-quality Rule 4) AND each navigation `intentBuilder` MUST
  ignore it (presentation, not a domain arg — must not flow into the intent).
- **Inline-anchor plugin** (N7): share the `answerSpan` alignment helper in
  `citationFootnotes.ts` rather than duplicating it.
- **`showExtract` payload + no fork** (D6): honor `scope`/`schemaId`; no hardcoded
  `"utility"`; `show*` handlers do not fork on experience.
