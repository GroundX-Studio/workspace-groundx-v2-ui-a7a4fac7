# Phase-2 execution order — the 7 regroup plans (2026-05-31)

> The remaining open work, regrouped 2026-05-31 into 7 OpenSpec changes (everything except the
> excluded `cf04` / `cf19` / `wf10`). This is the **strictly sequential** order to execute them —
> no parallel fan-out. Discipline §10 per-task adversarial review gate applies to every task.

## Adversarial review of the 7 plans

All 7 `openspec validate --strict` clean; `validate --all --strict` 32/32. INPUT gates correctly
lead their plans; no dormant-export work proposed; deltas are mostly ADDED (low collision); the
word-level plan correctly does NOT hunt the already-removed amount-due hack.

Findings:

- **[FIXED] smart-report-followups MODIFIED header mismatch — archive-blocker.** The delta's
  `### Requirement:` header (`…cited sections from the render endpoint`) didn't match the durable
  `specs/smart-report/spec.md` header (`…cited sections`). `validate` passed (delta well-formedness
  only) but it would FAIL at archive (no requirement to modify). Header restored to match; intent
  kept in the body. (commit `76b2912`)
- **[HIGH] `chatRouter.ts` is contended by FOUR plans** — tool-system (server role filter),
  word-level (the `assignTier(…, {hasAtomBox:false})` seam ~`:706`), steady-scope (`deriveRagContentScope`),
  and core-data (the 1637-line **split**). Drives the ordering: the **split runs LAST**, so the three
  feature edits land on the current router (their line/seam references stay valid) and the split then
  absorbs them — instead of rebasing feature work onto a moving module.
- **[MED] tool-system's app-side `availableIn` migration targets an ORPHAN.** The app `toolRegistry`
  has zero production importers; the catalog the LLM sees is the middleware `SERVER_TOOL_CATALOG`. The
  real behavior is the **server-side role filter**. Recommended answer to its INPUT gate #1:
  delete/defer the orphan, do the server filter — don't sink effort migrating dead code's type.
- **[MED] tool-system completes widget-role-access Phase 3.** Both carry active `agent-tools` deltas;
  when tool-system ships, WRA's `role-scoped-catalog` requirement becomes satisfied — archive WRA in
  concert then.
- **[MED] steady-scope + onboarding-experiences are INPUT-blocked** — they cannot start until their
  `INPUT NEEDED` task #1 is answered. Sequenced accordingly (5, 6).
- **[LOW] core-data "exhaustive orchestrator dispatch over `CanvasIntent`"** may be *already* satisfied
  (`never`-default switches were added in the step-19/20 work). Verify before doing it as a no-op task.
- **[LOW] ChatColumn is touched by both dependency-direction-guard (untangle) and onboarding-experiences
  (mounts experiences through it).** Sequenced so the untangle lands first (step 2 before step 6).

## The sequential order

| # | Plan | What | Gate / depends on |
|--|--|--|--|
| 1 | **smart-report-followups** | Route the initial f4 render through `POST /reports/render`; manual live-verify | none — independent, no chatRouter touch |
| 2 | **dependency-direction-guard** | Untangle `ChatColumn`→`@/views/`, then add the rule-5 guard | none — do before #6 (which mounts via ChatColumn) |
| 3 | **tool-system-completion** | Server-side role filter on the LLM catalog + `submit_/wizard_/close_` tools | 3 defaultable design INPUTs (answer up front: delete-the-orphan / minimal parity test / narrow glob-home). Completes WRA Ph3 → archive WRA after |
| 4 | **word-level-citation-geometry** | Live `-118-map` fetch → tight bbox into the `assignTier` seam | investigate `processId` first; escalates to INPUT only if it needs a credential |
| 5 | ⛔ **steady-scope-producer** | Real entity→scope producer + §9 column-drop | **BLOCKED on your INPUT** (steady/BYO scope model). Touches `deriveRagContentScope` |
| 6 | ⛔ **onboarding-experiences** | Workspace/Project ChatExperiences + nav enable + SchemaView fallback retirement | **BLOCKED on your INPUT** (the two experiences' UX/content). After #2 |
| 7 | **core-data-followups** | chatRouter **split** + ApiError base + factories + type-unification + gated DB drop | LAST — the split reorganizes the now-complete router (absorbs #3/#4/#5). Verify the "exhaustive dispatch" item isn't already done |

## Flow notes

- Steps **5 and 6 stall until you answer their `INPUT NEEDED` task #1.** If you answer those two
  (and the three defaultable tool-system design calls in #3) up front, the whole 1→7 chain runs
  without pausing.
- Only core-data's **chatRouter-split sub-task** waits on #5; core-data's other sections (ApiError
  base, factories, type-unification, DB-drop) have no such dependency and could run independently if
  #5 is still input-blocked.
- On archive: each source change archives **after** its new plan lands (widget-role-access after #3,
  wf05b after #4, entity-rag after #5, core-data-model-hardening after #7).
- Execution harness: same as the steps-10-24 run — one step per workflow invocation,
  TDD → hostile gate → refine → verify green → commit, each independently re-verified.
