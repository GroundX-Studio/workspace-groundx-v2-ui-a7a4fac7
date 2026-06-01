# Phase 3 execution order — close out the core-data-followups tail

`2026-05-31-core-data-followups` delivered §1–§5 + the security hardening (7a–7n) and is **archived**
(`changes/archive/2026-06-01-2026-05-31-core-data-followups`). Its deferred tail — the 5 wide §4 folds,
a full experience audit, and the soak-gated DB drop — was extracted into **6 focused changes**. This is
their sequential execution order + the cross-plan dependencies. The pre-existing
`2026-05-29-wf05b-word-level-geometry` is folded into this sequence as **step 1** (it owns the canonical
`XrayDoc` type the wire-types fold depends on), making **7 changes** total.

## The changes

| # | Change | What | Capability |
|---|--------|------|------------|
| 1 | `2026-05-29-wf05b-word-level-geometry` | word-atom citation resolver (pure) + fixture test + **canonical `XrayDoc` type set** (resolves the X-Ray field-name drift); live `-118-map` fetch stays backlogged | chat-routing |
| 2 | `2026-05-31-chat-wire-types-shared` | #18 envelope fold + LOW remaining wire-twins → one `@groundx/shared` source + `Eq<>` drift guards | chat-routing (+auth-and-sessions) |
| 3 | `2026-05-31-canvas-intent-schema-shared` | one shared Zod `canvasIntentSchema`, validated at both `current_intent_json` boundaries | app-architecture (+data-tier) |
| 4 | `2026-05-31-session-auth-subshapes` | `LoginReqCallback` + `SchemaFieldExtractionResult` → discriminated unions + `parseChatStoreSnapshot` validator | auth-and-sessions |
| 5 | `2026-05-31-viewer-history-column-drop` | drop the write-NULL-only `viewer_history/overlays/workspace` cols + migration + guard | data-tier |
| 6 | `2026-05-31-e2e-experience-audit` | full Chrome-DevTools-MCP audit of every interaction path; fix defects | testing-suite |
| 7 | `2026-05-31-extraction-schemas-table-drop` | §6: drop `extraction_schemas` + boot copy-migration + orphan CREATE | data-tier |

## Sequence + dependencies

```
[1 wf05b] → [2 chat-wire-types] → [3 canvas-intent] → [4 session-subshapes] → [5 viewer-col-drop]   (5 code folds)
                                                                                      │
                                                                                      ▼
                                                                      [6 e2e-experience-audit]      (after code is final)
                                                                                      │
                                                                                      ▼
                                                          [7 extraction-schemas-table-drop]          (LAST — see gates)
```

1. **`wf05b` goes FIRST.** It is the natural lead because it promotes the **canonical `XrayDoc` type set**
   (resolving the X-Ray `documentPages[].pageNumber` vs `.number`/`.page` field-name drift) — the exact twin
   the next change defers to it. Landing it first means `chat-wire-types-shared` references an already-canonical
   `XrayDoc` instead of carrying a deferred twin. wf05b ships the **pure** word-atom resolver + fixture test +
   the tight-bbox wiring now; the live `-118-map.json` fetch (processId discovery + storage-URL build) stays a
   **backlog** ticket (no precedent infra). It also **unblocks** the `UTILITY_AMOUNT_DUE_REGION` hack removal
   that `core-data-model-hardening` is gated on.
2. **The code folds (1→5), sequential.** Run them **sequentially, not parallel** — they contend on
   `shared/src/index.ts`, the chat/auth type modules, and `services/citationGeometry.ts` (the same contention
   that bit earlier phases). Order: `wf05b` → `chat-wire-types` (biggest, highest "one source of truth" value;
   now references the canonical `XrayDoc`) → `canvas-intent` → `session-subshapes` → `viewer-col-drop` last (it
   carries a real DB migration; isolate it + review it hardest).
   - **Cross-plan rule (now resolved by ordering):** `chat-wire-types-shared` must **not** touch the X-Ray
     response-shape / `PageDim` twin — wf05b owns and canonicalizes it first. chat-wire-types consumes the
     result; no double-fix.
3. **`e2e-experience-audit` runs AFTER the code folds land**, so the audit exercises the final code. It drives
   every interaction via Chrome DevTools MCP (measure, don't eyeball), logs defects, fixes them with
   regression tests, and signs off only at visual + functional satisfaction.
4. **`extraction-schemas-table-drop` runs LAST**, gated on **both**: (a) the e2e audit passing, **and**
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
- `2026-05-29-wf05b-word-level-geometry` — **now step 1 of this plan** (no longer a parked husk); owns + lands
  the canonical `XrayDoc` type set before `chat-wire-types-shared`, and unblocks the
  `core-data-model-hardening` hack removal.
- `2026-05-28-wf04-tool-coverage-completion`, `2026-05-31-schemaview-live-only-extract` — unrelated husks;
  unchanged.
- `cf04` / `cf19` / `wf10` — user exclusions; untouched.
