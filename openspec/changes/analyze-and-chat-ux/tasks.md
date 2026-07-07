# Tasks — analyze-and-chat-ux

Four workstreams: **§1–4 Extract render + card→hover (A/B)**, **§6 thinking stream (C)**,
**§7 polishes (D)**, **§8 combined verification**. TDD (failing test first),
adversarial-review gate after each task. Keep the suite green at every step. The Extract work
(§1–4) is **output-first**: STRUCTURE comes from the extraction OUTPUT tree walked as-received;
LABELS/TYPES come from the workflow schema fields joined **by field name**. The schema type stays
FLAT, so the shared-type touch is light (shared + middleware mirror + drift guard + fixtures) — the
recursion lives in the app's output walk/render, not the schema. §6 and §7 are independent of §1–4
and of each other; §6 keeps **both** thinking sources — source-1 app narration AND source-2 model
reasoning (OpenAI Responses API `reasoning:{summary}`) — in this change; their order is flexible.

> **Coordination — see [`docs/agents/cross-plan-execution-order.md`](../../../docs/agents/cross-plan-execution-order.md) for the authoritative order.** The render is **blocked by
> `adopt-tanstack-query` Phase 1 ONLY** — this change's §1–2 extract+workflow reads consume its
> `useQuery` hooks, NOT the current context/effect fetch (`useLiveExtract`/`DocumentsContext`). It
> is **NOT v1-gated and NOT blocked by wave step 0**: the render is output-first — the legacy demo
> output already has the nested/hoisted shape and the legacy workflow already carries the field
> labels, so the render works on the current demo. (Step 0's demo → v1 migration remains useful for
> the authoring/consistency story, but is NOT a render prerequisite.) It **does NOT depend on
> `extract-workflow-authoring`** — the render walks the output tree and joins labels by name, so
> there is no `deriveSchema`/harness dependency. It is **followed by** `unified-loader`, which swaps
> the shared loading mark into the viewer + chat structure THIS change settles — so do NOT try to
> land `unified-loader` first. `extract-workflow-authoring`'s authoring UI sits on top of this
> change's recursive render.

## A/B — Extract render + hover highlights

## 1. Schema + parse layer (the foundation)

- [x] 1.1 `ExtractionSchemaDef = {id, name, groups: SchemaGroupDef[]}` with **flat**
      `SchemaGroupDef = {id, name, fields: SchemaFieldDef[]}` (NOT recursive — it is a label
      dictionary; structure comes from the output). If `SchemaCategoryDef`/`type` enum can drop
      cleanly, drop them; otherwise keep the existing shape — the schema does not need to become
      recursive. Keep it a shared type in the shared source (`shared/src/index.ts`), the middleware
      mirror (`middleware/src/scenarios/types.ts`), the drift guard (`typesDriftGuard.ts`) green,
      re-exported from `types/scenarios.ts`.
- [x] 1.2 `workflowToSchema` produces a **flat field-def dictionary for labels** (TDD). KEEP the
      existing `fieldFromPrompt` read of `workflow.extract.<group>.fields.<id>.prompt`
      (`extractLiveData.ts:58`) — it already reads labels/types/instructions by field name. Emit a
      dictionary keyed by (group, fieldId) — or fieldId — used purely to LABEL output fields; the
      render joins output→schema by name (a charge field `line_amount` under `meter_charges` OR
      `account_charges` maps to the `charges` group's field def by name). **No `leafFields` walk, no
      raw-YAML parse, no `deriveSchema`/harness engine, no `CATEGORY_ORDER` allow-list.** Drop the
      `CATEGORY_ORDER` restriction so every schema group's fields are available for label lookup.
      Consume the workflow via the `adopt-tanstack-query` `useQuery` hook (do not re-hand-roll the
      fetch). Test: the utility workflow yields label defs for statement/meters/charges fields
      (incl. the `meter_id` FK in `charges`); a workflow with an arbitrary-named group also yields
      its field defs (anti-hardcode guard on the LABEL lookup).
- [x] 1.3 `extractToInstances` replacing `extractToValues` (TDD) — **walk the OUTPUT tree**, not the
      schema. Top-level scalar keys → root fields; a top-level key whose value is an array
      (`meters`, `account_charges`) → an array group, one instance per element; a key inside a
      meter whose value is an array (`meter_charges`) → a nested array group, recursing. Join each
      output field to its schema field def BY NAME for label/type; an output key with no matching
      schema field is skipped (the hiding rule). Unwrap `{value, confidence}` DEFENSIVELY (dormant —
      no such dicts in real output). Test: statement scalars at root, all 8 meters, each meter's
      `meter_charges`, and top-level `account_charges` all present; bare values handled; dict-value
      unwrap covered defensively; empty input → empty root; an output key with no schema field is
      omitted.
- [x] 1.4 `liveValuesToFieldValues` → instance-path keyed (TDD) — key by
      `[group/][idx/][nestedGroup/idx.]fieldName` over the output walk; attach per-instance
      confidence (dormant) + citations. Test: two meter instances' same field get distinct
      instance-path keys + distinct geometry.

## 2. Render

- [x] 2.0 **Walk the OUTPUT tree as-received; hide keys with no schema field** (TDD, foundation).
      `getDocumentExtract` returns the ALREADY-reshaped output (server-side `match_attrs`/hoist/
      project): statement scalars hoisted to root · `meters[]` with nested `meter_charges` ·
      synthesized top-level `account_charges` · NO top-level `charges`. The render **walks this tree
      as-received** (NO in-app reassembly/group-by). STRUCTURE comes from the output; LABELS/TYPES
      come from the workflow schema fields joined BY FIELD NAME (§1.2). **Hiding = don't render an
      output key that has no matching schema field** — `account_charges`/`meters`/`meter_charges`
      are structure containers (rendered); their leaf fields are schema fields (rendered);
      `__conflicts`/`*_decisions` are confirmed ABSENT in real data, so no explicit filter needed.
      Confidence band DORMANT (no `{value,confidence}` dicts; keep defensively; not tied to
      `__conflicts`). Test: output walks to statement + meters(+meter_charges) + account_charges; an
      output key with no schema field is hidden; an arbitrary output shape renders.
- [x] 2.1 Recursive `FieldGroup`/tab-bar component (TDD) — **an object level = a tab bar, one tab
      per array group present in the OUTPUT** (structure from output; labels from the schema by
      name). Count = array length (0 for `[]`). Scalar tab → field-row tree (mono field name ·
      value · confidence band [dormant] · citation dot). Array group → **instance pills** labeled by
      the group's own identifying field(s) chosen from its schema/data at runtime (first present
      identifier-type field), else `#n` — NOT a hardcoded field name. Top-level tabs are the output
      tree's top-level arrays + root scalars. Selecting a meter recurses → **its own tab bar** whose
      "Charges" tab is the meter's nested `meter_charges` (from the received tree; §2.0). Test:
      empty array group → tab at 0; a selected meter's Charges tab shows its nested charges; an
      arbitrary output shape recurses.
- [x] 2.2 Wire `Extract.tsx` to the recursive render (Values view); preserve the shipped
      per-instance confidence band (dormant here); remove the `CATEGORY_ORDER`-era category-tab
      assumption.
- [x] 2.2b **Editor is OUT of this change** — the `Values | Edit schema` toggle and all
      workflow-schema authoring/save move to the new **`extract-workflow-authoring`** change (see
      that change). This change ships the read-only recursive render (Values) only.
- [x] 2.2c **Persisted-Template mismatch note** — the render reads LIVE extraction output + LIVE
      workflow schema, NOT the persisted Extract Template (flat `{categories}`,
      `shared/src/index.ts:426` `extractBodySchema`). If any pin-to-Template path bridges into this
      render, flag the shape gap or scope it out — do not silently assume they're the same shape.
- [x] 2.3 Migrate the real `extractionSchema`/`extractToValues` consumers off the removed shape
      (NOT `ChatColumn` — it has no such read). Consumers: `api/extractLiveData.ts`,
      `Extract/SchemaView.tsx`, `hooks/liveExtractData.ts`, `types/scenarios.ts`. Grep proves no
      `CATEGORY_ORDER`/`extractToValues` references remain.

## 3. Interaction — retire the card, hover→highlight

- [x] 3.1 Remove the **inline provenance block** — the `<Box data-testid="field-provenance-panel">`
      (SOURCE + WHY MATCHED) at `Extract.tsx:1033` + its breadcrumb. This is surgery inside the
      1772-line `Extract.tsx`, **not** deleting a `FieldProvenancePanel` component (there is none).
- [x] 3.1b Retire the `field-provenance-panel` test contract in `docs/agents/testing.md` and the
      `field-provenance-panel` assertions in `Extract.test.tsx` / `ExtractView.test.tsx`.
- [x] 3.2 Field-instance row drives the PDF highlight on **hover/focus** (TDD) — sets
      `targetPage`+`highlightBbox` per instance; leave/blur clears. Reuse the shipped padded
      overlay. Test: hovering `field-row` for meter 2's `line_amount` renders `pdf-viewer-highlight`
      at that instance's bbox; leaving clears it.
- [x] 3.2b **Click pins** a highlight so keyboard/touch users get a stable target; a second click
      unpins. Test: click pins across a subsequent mouse-leave; second click clears.
- [x] 3.3 Keep the confidence band + reason inline on the row (no card).

## 4. Fixtures + guards

- [x] 4.1 (adapted) Fixtures NOT reshaped: the flat manifest fixtures render through
      `manifestToInstances` (a degenerate single-instance tree + page map) into the SAME
      recursive render — less fixture churn, same composable seam. Extract/ExtractView tests
      updated to the instance-tab/row/pin contract; SchemaView untouched (flat label editor).
- [x] 4.2 Anti-hardcode guard test (permanent) — an arbitrary OUTPUT shape (a top-level array
      group whose name ∉ {statement,meters,charges}, with a nested array 2 deep) walks + renders
      end-to-end, labels joined by name.
- [x] 4.3 Drift guards green: widget-contract, no-hardcoded-styles, recurrence-drift,
      catalog-parity.

## C — Chat thinking stream

## 6. Thinking stream (source 1 ships independently of source 2)

- [x] 6.1 Shared `ThinkingEvent` type in `@groundx/shared`
      (`{kind:"status",text} | {kind:"reasoning",text}`) + its SSE wire encoding on the
      chat stream. Update `data-model.md` (chat-message/stream row).
- [x] 6.2 **Source 1 — app narration** (TDD): `ragPipeline`/`turnRunner` emit ordered
      `{kind:"status"}` events at the real phase boundaries (plan → GroundX search →
      snippet assembly → grounded completion → citation verify). Deterministic; no provider
      dependency. Test the emitted sequence for a scripted turn.
- [x] 6.3 **Add a live-fed source to `chat-widgets/ThinkingStream`** (TDD): let it consume
      streamed `ThinkingEvent`s (accumulate + reveal), not just the scripted `notes[]`. Do NOT
      fork a new widget — added source axis, keep its README + `role`/`scope`. Test: live events
      reveal in order; scripted onboarding-intro path still works.
- [x] 6.3b **Render it in `app/src/conversation/chatPrimitives.tsx`** (TDD): replace the bare
      `showThinking` → `LoadingDots` `BotBubble` (`chat-thinking` testid) with the live-fed
      `ThinkingStream` for in-flight real turns; collapse to the answer + citations on the final
      `message`. (This is `chatPrimitives.tsx`, NOT `ChatColumn` — ChatColumn has no thinking
      indicator.) Test: mid-turn shows status lines in place of the dot; final render clears them.
- [x] 6.4 **Source 2 — OpenAI Responses API reasoning path** (TDD, IN SCOPE; order vs §6.2–6.3
      is flexible, both ship in this change). Behind the `LlmClient` seam, add an OpenAI
      **Responses API** path (`/v1/responses`, `reasoning:{summary:"auto"}` — live-probed to work
      for gpt-5.5) that maps reasoning-summary deltas → `{kind:"reasoning"}` events; enable it for
      the configured OpenAI chat models. NEVER prompt for raw chain-of-thought — only provider
      summaries. Test: a Responses-API fake emits reasoning events. **Gate/verify carefully:**
      moving chat off `/chat/completions` risks tool-calls + citations — verify both still work on
      the Responses path before enabling.
- [x] 6.4b **Anthropic reasoning branch + graceful degrade** (TDD): the Anthropic branch
      (`thinking:{adaptive,summarized}` → `thinking_delta`) shares the §6.4 adapter interface; a
      non-reasoning provider/model yields zero reasoning events and the stream stays valid. Test:
      Anthropic fake emits reasoning events; a non-capable fake → zero reasoning events, stream
      still valid.

## D — Polishes

## 7. CSS polishes

- [ ] 7.1 Understand doc-pane scrollbar flush to the pane edge (drop the wasted right
      gutter); do NOT regress the existing **chat** scrollbar-gutter requirement. Verify in
      Chrome DevTools. **[2026-07-07 live measurement: does NOT reproduce on the current
      doc-viewer step — every wrapper (viewer-frame-body → onboarding-shell-canvas-pane) is
      flush (gap 0) and the contain-fit page renders NO scrollbar (zoom pans, overflow
      hidden). Chat gutter (`scrollbarGutter: stable`) intact. Needs the original repro
      surface/state before any code change — do no harm.]**
- [x] 7.2 Chat header cutoff: pad the header text, not the scroll region, so scrolled content
      reaches y=0. Verified in Chrome DevTools 2026-07-07: chat scroller `padding-top: 0`,
      first message top-offset = 0 at scrollTop 0 (ConversationFlow py→pb + OnboardingShell
      chat-pane pr:0 scrollbar-flush).

## 8. Verification

- [x] 8.1 `npx tsc --noEmit` + full app + middleware vitest green. (app 2035 / middleware 1030, both tsc clean — 2026-07-07)
- [x] 8.2 `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`. (23/23)
- [x] 8.3 Live Chrome DevTools E2E on the utility sample: ALL 8 meters render, each with its
      charges nested; hovering a field lights its bbox (padded, readable), leaving clears;
      confidence bands show where present; no detail card; a chat turn shows the thinking
      stream (status lines) then collapses to the answer; scrollbar flush; header not clipped.
- [x] 8.4 Adversarial review gate: no hardcoded group names anywhere; every instance renders
      (no `[0]` flatten); hover-highlight per instance; card fully removed; confidence band
      preserved; thinking stream degrades cleanly with no reasoning provider; no raw CoT
      leaked; suite + guards green.

## Deferred (tracked)

- D.1 Per-document geometry/instance cap for very large documents (log, never silently drop).
- D.2 Instance labeling heuristics beyond "identifying field or #n".

## Verification record (2026-07-07)

- 8.3 live (chrome-devtools on dev-RDS stack): Meters·8 tab (was [0]-flatten), 8 pills by real
  meter_id, meter0 Charges·6 vs meter5 Charges·5, hover → page+bbox highlight (p.3, bbox y .088),
  leave clears, click pins across mouse-leave; thinking stream: dots → Planning → Searching →
  Reading 8 passages → Writing → Verifying → collapsed to cited answer; chat first message reaches
  y=0. Confidence bands: dormant in real output (no {value,confidence} dicts) — covered by tests.
- 8.4 greps CLEAN (no group-name literals in the render path; provenance panel + selectedField
  machinery fully gone); §6 degrade verified LIVE (gpt-5.5 'auto' emitted zero reasoning summaries
  → stream stayed valid on status lines); no raw CoT by construction (summary-only APIs).
- §6.4 gate: LIVE turn through POST /responses on gpt-5.5 — citation funnel emitted 3 → shipped 3,
  fence intact, tools advertised. Default OFF (.env.example); dev soaks with the flag on.
- OPEN: §7.1 only (doc-pane gutter does not reproduce — needs the original repro surface).
