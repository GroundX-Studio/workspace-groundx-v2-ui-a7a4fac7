# Cross-plan execution order — Analyze/Extract UX + workflow-authoring wave (rev. 2026-07-06)

> Read before executing any of these changes. Single ordering surface for the current wave; each
> change's `tasks.md` defers here for **cross-change** order. (The 2026-05-30 wave is COMPLETE and
> archived under `openspec/changes/archive/2026-05-31-*`.)

## Corrected model (live-verified 2026-07-06 against the GroundX API — supersedes earlier drafts)

**RENDER is output-first (does NOT use `leafFields`):**
- **Structure comes from the extraction OUTPUT** (`getDocumentExtract`), walked as-received. The
  server has already reshaped it via business logic: statement scalars **hoisted to root**, matched
  charges nested as **`meters[].meter_charges`** (a re-keyed projection), unmatched charges in a
  synthesized top-level **`account_charges`**. The app does NOT reassemble and does NOT derive
  structure from `leafFields`/`_groundx_persisted_extract` (which are flat, `/group/field`, and
  can't express the nesting).
- **Labels/types come from the workflow schema fields, looked up BY FIELD NAME**
  (`workflow.extract.<group>.fields.<id>.prompt` — the code already does this). A charge field under
  `meter_charges` or `account_charges` maps to the `charges` group's field def by name.
- **Hide** = don't render output keys with no matching schema field. (`__conflicts`/`*_decisions`
  don't appear in real output; no hardcoded pattern needed.) Confidence band renders only for
  `{value,confidence}` dicts — dormant on real data today (kept defensively).
- **The render works on the LEGACY demo already** — the legacy output is nested/hoisted and the
  legacy workflow carries the labels. So the render is **NOT v1-gated and NOT blocked by step 0.**

**AUTHORING runs the REAL harness build (we ARE Studio — studio.eyelevel.ai doesn't exist yet):**
- The editor produces the **YAML source** in the user's desired-output vocabulary; an app-side
  scaffold shapes it per harness conventions (step-kinds, ≤30/pseudo-groups, routing, `agent_chain`,
  field-prompt blocks) — STRUCTURE only.
- A **Python build service/job runs the REAL harness `compile_workflow.py`** (synced from the
  living plugin) to produce portable workflow JSON — prompt rendering, routing finalization,
  `outputRoutes`/`leafFields` all happen inside the real compiler. **Never reimplemented in TS**
  (that's a fork/drift), and **out-of-process** (not in the Node request loop). Node then **PUTs**
  the JSON via `updateGroundXWorkflow` and attaches it.
- `get workflow` returns `{steps, extract._groundx_persisted_extract, customSteps, outputRoutes,
  leafFields[], …}`; `PUT` takes that overlay. These matter for the authoring round-trip, not the
  render.

**Step 0 (demo → v1)** is for the authoring/consistency story, **not** a render prerequisite.

## The wave

| change | one line |
|--------|----------|
| `adopt-tanstack-query` | foundation + viewer cache shipped; remaining migration stays active |
| `analyze-and-chat-ux` | ✓ complete (archived 2026-09-12) |
| `unified-loader` | ✓ complete (pending archive) |
| `extract-workflow-authoring` | schema editor → YAML → **real harness Python build service** → PUT |
| `agentic-template-item-editor` | ✓ complete (pending archive) |

## Dependency graph

```
shipped TanStack foundation + viewer cache ──▶ analyze render (complete)
                                           └──▶ unified loader (complete)
analyze-and-chat-ux (complete) ──▶ extract-workflow-authoring editor
step 0 (demo → v1 workflow) ──(leafFields for authoring round-trip)──▶ extract-workflow-authoring
```

The render is **output-first and works on the legacy demo**. Its required TanStack foundation and
viewer cache have shipped. Authoring sits on top of the completed render and needs step 0 (v1
workflow) for its build/round-trip. The rest of the TanStack migration is independent follow-up.

## Ordered steps

‖ = may run concurrently with the step above it.

| # | change / phase | blocked by | why here |
|---|----------------|-----------|----------|
| 0 ‖ | **Migrate the demo workflow → v1** (see the concrete target + procedure below) | — | v1 `leafFields` for the authoring round-trip (NOT needed by the render) |
| 1 ‖ | `adopt-tanstack-query` foundation + viewer cache (complete) | — | shipped provider, retry policy, keys, and supported viewer queries |
| 2 | `analyze-and-chat-ux` (complete, archived 2026-09-12) | — | output-first render, highlights, and chat work shipped |
| 3 | `unified-loader` (complete, pending archive) | — | shared loading treatment and frame fix shipped |
| 4 | `extract-workflow-authoring` (schema editor → YAML → real harness build → PUT) | 0 | uses the completed render; still needs the Python build service + v1 workflow |
| 5 ‖ | `adopt-tanstack-query` remaining Phase 1 + Phase 2 | — | consolidate duplicate readers, add invalidation/reset coverage, then migrate the rest |

Steps 1–3 are complete. Step 0 and the remaining TanStack work are disjoint and may proceed in
parallel. Authoring waits only for step 0.

## Step 0 — demo workflow migration (concrete; verified live 2026-07-06)

- **Account/credential:** the demo/anon workspace, reached with `WORKSPACE_API_KEY` from
  `.mcp.json` (`GROUNDX_ANON_API_KEY` in `.env.local` is declared-but-empty; the real value is the
  workspace key). Base `https://api.groundx.ai/api/v1`. Never pass the key as a CLI arg or log it.
- **Target:** bucket **28454 "Studio Onboarding Samples"**, workflow
  **`9910308e-3100-473e-9da6-3ac29f5958a6` "studio-demo"** — currently **LEGACY** (its `extract` has
  `charges`/`meters`/`statement` directly; **no** `leafFields`/`customSteps`/`outputRoutes`).
- **Source:** `internal-arcadia-agents` `latest.yaml` (the v1 Arcadia utility workflow).
- **Procedure (harness-sanctioned, `references/4_sdk_integration.md §4`):** `templates/deploy_workflow.py`
  compiles `latest.yaml` → validates → **updates** the existing workflow via
  `client.update_extraction_workflow(...)`, `--bucket-id 28454`, key from env. (Do NOT re-parse the
  raw YAML through `create_extraction_workflow(path=...)` — that bypasses the compiler contract.)
- **No re-ingest.** Updating the definition makes `get workflow` return the v1 `leafFields` shape;
  the existing extraction output stays and (v1 ≡ legacy output, absent Arcadia/cashbot-go/harness
  bugs) its keys still match the new `leafFields`. Re-ingest only if regenerating values.
- **Verify:** after the update, `get workflow` on `9910308e` returns `leafFields`/`customSteps`/
  `outputRoutes`; the demo extract output is unchanged.

## Shared-file conflict map (later step rebases onto earlier — no blind parallel edits)

| surface | steps | rule |
|---------|-------|------|
| `Extract.tsx` | 1 (fetch→useQuery), 2 (output-first render rewrite), 3 (loader), 4 (edit toggle) | serialize; 2 is the big rewrite; 3/4 rebase on 2 |
| `PdfViewerWidget.tsx` | 1 (fetch→useQuery), 3 (loader) | 1 first, 3 rebases |
| viewer fetch sites (`useLiveExtract`, `liveExtractData`, `DocumentsContext`) | 1 (owns/consolidates), 2 (consumes) | step 1 owns the migration; 2 only uses the hooks |
| **`chatPrimitives.tsx`** (thinking indicator — NOT `ChatColumn`) | 2 (thinking stream), 3 (shared mark) | 2 sets structure, 3 drops the mark in |
| app `Workflow` type + `WorkflowInput` (add `leafFields`/`customSteps`/`outputRoutes` for authoring) | 4 (editor round-trip) | additive; the render uses existing `extract.<group>.fields` for labels, not these |
| `SchemaCategoryDef`→recursive `groups` (shared zod + middleware mirror + drift guard + `scenarioFixtures.ts`) | 2 | multi-package TYPE change, **no live-data migration** |
| `@groundx/shared` types (`ThinkingEvent`; workflow overlay fields) | 2, 4 | additive; both-sides-mirror + catalog-parity guard |

**Spec-delta serialization:** `ui-views` (1, 2, 3), `app-architecture` (1, 3), `conversation-flow`
(3), `chat-routing` (2), `extract-workflow-authoring` (4, new capability). Apply in execution order.

## Risks / watch items

- **Thinking source-2 (analyze §6.4)** — moving OpenAI chat onto `/v1/responses` risks tool-calls +
  citations. Stays in `analyze-and-chat-ux` (per product), order flexible; gate/verify behind a RAG
  regression bar. `/v1/responses` reasoning live-probed OK for `gpt-5.5`.
- **Step 0 gates AUTHORING, not the render** — the render works on the legacy demo (output-first).
  Step 0 (v1 workflow) is needed for the authoring round-trip; verify by effect after the PUT that
  the demo still renders (v1 ≡ legacy output).
- **The build service is Python, out-of-process** — the schema→workflow build runs the REAL harness
  `compile_workflow.py` (synced), never reimplemented in TS, never in the Node request loop. It
  emits portable workflow JSON that Node PUTs. Deploy cost (a Python service/job image) is real —
  own it (we are Studio).
- **In-app authoring scope** — the app-side YAML scaffold must honor the harness structural rules
  (step-kinds, ≤30/pseudo-groups, routing shape, locked charge field names); the real compiler does
  prompt rendering + route/leaf finalization. Restructuring edits are the hard case.
- **Confidence band** — dormant unless the extraction output carries `{value, confidence}`; described
  in the plan, not on any critical path.
- **Per-step review** — Discipline §10 adversarial gate after every task is the default.
