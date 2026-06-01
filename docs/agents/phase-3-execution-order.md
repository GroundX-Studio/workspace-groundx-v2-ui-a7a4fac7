# Phase 3 execution order — close out the core-data-followups tail

`2026-05-31-core-data-followups` delivered §1–§5 + the security hardening (7a–7n) and is **archived**
(`changes/archive/2026-06-01-2026-05-31-core-data-followups`). Its deferred tail — the 5 wide §4 folds,
a full experience audit, and the soak-gated DB drop — was extracted into **6 focused changes**. This is
their sequential execution order + the cross-plan dependencies.

## The changes

| # | Change | What | Capability |
|---|--------|------|------------|
| 1 | `2026-05-31-chat-wire-types-shared` | #18 envelope fold + LOW remaining wire-twins → one `@groundx/shared` source + `Eq<>` drift guards | chat-routing (+auth-and-sessions) |
| 2 | `2026-05-31-canvas-intent-schema-shared` | one shared Zod `canvasIntentSchema`, validated at both `current_intent_json` boundaries | app-architecture (+data-tier) |
| 3 | `2026-05-31-session-auth-subshapes` | `LoginReqCallback` + `SchemaFieldExtractionResult` → discriminated unions + `parseChatStoreSnapshot` validator | auth-and-sessions |
| 4 | `2026-05-31-viewer-history-column-drop` | drop the write-NULL-only `viewer_history/overlays/workspace` cols + migration + guard | data-tier |
| 5 | `2026-05-31-e2e-experience-audit` | full Chrome-DevTools-MCP audit of every interaction path; fix defects | testing-suite |
| 6 | `2026-05-31-extraction-schemas-table-drop` | §6: drop `extraction_schemas` + boot copy-migration + orphan CREATE | data-tier |

## Sequence + dependencies

```
[1 chat-wire-types] → [2 canvas-intent] → [3 session-subshapes] → [4 viewer-col-drop]   (the 4 code folds)
                                                                          │
                                                                          ▼
                                                          [5 e2e-experience-audit]      (after the code is final)
                                                                          │
                                                                          ▼
                                              [6 extraction-schemas-table-drop]          (LAST — see gates)
```

1. **The 4 code folds (1→4), sequential.** They are logically independent, but run them **sequentially, not
   parallel** — they contend on `shared/src/index.ts` and the chat/auth type modules (the same contention
   that bit earlier phases). Recommended order: `chat-wire-types` first (biggest, highest "one source of
   truth" value) → `canvas-intent` → `session-subshapes` → `viewer-col-drop` last (it carries a real DB
   migration; isolate it + review it hardest).
   - **Cross-plan dependency:** `chat-wire-types-shared` must **not** fix the X-Ray response-shape /
     `PageDim` twin — that belongs to `2026-05-29-wf05b-word-level-geometry`. Whichever lands first owns it;
     do not double-fix.
2. **`e2e-experience-audit` runs AFTER the 4 folds land**, so the audit exercises the final code. It drives
   every interaction via Chrome DevTools MCP (measure, don't eyeball), logs defects, fixes them with
   regression tests, and signs off only at visual + functional satisfaction.
3. **`extraction-schemas-table-drop` runs LAST**, gated on **both**: (a) the e2e audit passing, **and**
   (b) the soak gate — the `templates` migration live one production release + zero remaining
   readers/writers of `extraction_schemas`. This is the only item that **cannot be closed by code now**;
   it waits on the deploy cadence.

## Per-change gates (every change)
TDD failing-test-first · hostile adversarial review against the real code · `openspec validate <id>
--strict` · app + middleware suites green · `npm run build` (tsc + vite) clean · drift guards green ·
commit hygiene (stage by path, no `git add -A`, no off-script archive) · archive on completion.

## Husk dispositions
- `2026-05-29-core-data-model-hardening` — the **umbrella pass-1 inventory** that spawned
  core-data-followups. Partly delivered (via archived core-data-followups), partly relocated (the 4 folds
  above). Needs its OWN reconciliation pass: mark delivered items done, extract any genuinely-uncovered
  item (e.g. the `ExtractedFieldValue` ↔ `RenderedSection` generated-result unification) into a focused
  change, then retire. NOT auto-closed — requires per-item verification.
- `2026-05-29-wf05b-word-level-geometry` — stays active; owns the X-Ray twin that `chat-wire-types-shared`
  defers to it.
- `2026-05-28-wf04-tool-coverage-completion`, `2026-05-31-schemaview-live-only-extract` — unrelated husks;
  unchanged.
- `cf04` / `cf19` / `wf10` — user exclusions; untouched.
