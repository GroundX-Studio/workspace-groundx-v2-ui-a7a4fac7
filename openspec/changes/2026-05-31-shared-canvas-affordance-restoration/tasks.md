# Tasks

> TDD: failing test first for every change. Adversarial review gate after EVERY
> task (falsify claims against code + plan; no-op/dormant-plumbing check;
> `openspec validate --strict`; drift guards + build green) before advancing.

## Task 1 · Report render→builder edit hand-off (live, no per-frame wiring)

- [ ] **Failing test (render):** `SmartReportRender` mounted in a
      `CanvasOrchestratorProvider` (spy) + `OnboardingSessionProvider` — clicking
      `report-section-edit-billing_summary` dispatches
      `{ kind: "editTemplate", templateId: "rt-utility-ic-brief", selectedSectionId: "billing_summary" }`.
- [ ] **Failing test (builder pre-open):** `SmartReportBuilder` with NO
      `selectedSectionId` prop but `session.selectedReportSectionId = "anomalies"`
      renders `report-builder-editor-anomalies` open.
- [ ] Implement: `SmartReportRender` dispatches `editTemplate` via
      `useCanvasOrchestratorOptional()`; remove the `onEditSection` prop +
      README/JSDoc references. `SmartReportBuilder` seeds `openRowId` +
      re-open effect from `selectedSectionId ?? session.selectedReportSectionId`.
- [ ] **User-level test (OnboardingShell):** on f4 render, click `✎ edit §1` →
      canvas swaps to `data-canvas-kind="report-builder"` AND
      `report-builder-editor-billing_summary` is open.
- [ ] Adversarial review gate.

## Task 2 · Interact save→gate, chat-driven (route intent + tool + chip)

- [ ] **Failing test (orchestrator):** dispatching `{ kind: "openGate", trigger: "save" }`
      calls `onboardingSession.openGate("save")`; no-op (no throw) with no
      OnboardingSession provider.
- [ ] Implement: orchestrator routes `openGate` in the `onboardingSession` block.
- [ ] **Failing test (tool):** `GateChatRail.tools.ts` exports `save_to_account`
      (mutate, verb-allowlisted, `Use when`, per-field describe); handler returns
      `{ kind: "openGate", trigger: "save" }`; `availableSteps` ⊇ interact surface.
- [ ] Implement the app tool + mirror `save_to_account` on
      `SERVER_TOOL_CATALOG` (intentBuilder parity); update `toolCatalog.test.ts`
      `EXPECTED_NAMES` + the per-step name-set assertions; `catalog-parity` passes.
- [ ] **User-level test:** OnboardingShell on f5 — a `tool:save_to_account`
      suggested-action chip click opens the gate (canvas → `gate-value-prop`).
- [ ] `check-tool-quality` + drift guards green. Adversarial review gate.

## Task 3 · Retire the orphaned per-frame views

- [ ] Confirm zero production importers (only comments/tests) for
      `UnderstandView` / `ExtractView` / `InteractView` / `IntegrateView` /
      `ReportRenderView` / `ReportBuilderView`.
- [ ] Delete the six `*.tsx` + their `*.test.tsx`; drop any now-dead helper
      (`UnderstandPlaceholder` if orphaned) and stale comment references.
- [ ] `npm run build` + full app + middleware suites green; no broken imports.
- [ ] Adversarial review gate.

## Close-out

- [ ] `openspec validate --strict` clean; no delta vs shipped/archived.
- [ ] Update `build_status` memory snapshot if foundations shifted.
