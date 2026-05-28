# Tasks — widget-contract-floor-raise

Four phases. Each lands independently with green tests; phases CAN
be reordered. Per Rule 9, each phase opens with a failing test or a
user-visible verification step.

## Phase 1 — Templates (P0, ~1 hr)

- [ ] **Failing assertion**: opening `app/src/components/_template/`
      yields no file (the dir does not exist).
- [ ] Create `app/src/components/_template/README.md` with the
      five required section headers + filler explaining each.
- [ ] Create `app/src/components/_template/Template.tsx` — minimal
      widget exporting `Template` with `mode: "onboarding" | "steady"`
      prop, demo affordance locked under onboarding, `data-mode`
      attribute.
- [ ] Create `app/src/components/_template/Template.test.tsx` —
      the canonical 3 tests (mount-both-modes, locked-affordance-absent
      under onboarding, mode-prop reflected on `data-mode`).
- [ ] Add a header comment to each template file: "Copy this dir to
      `chat-widgets/<Name>/` or `viewer-widgets/<Name>/`, rename
      Template → Name, fill in the TODO markers."
- [ ] Ensure `_template/` is **excluded** from the widget-contract
      drift guard (its placement is `components/_template/`, not
      `chat-widgets/` or `viewer-widgets/`).

## Phase 2 — Worked example walkthrough (P0, ~1-2 hr)

- [ ] Pick a realistic small widget to use as the worked example.
      Recommended: `ChipsBar` — a horizontal chat-widget row of
      generic action chips (the wireframe shows this pattern in
      multiple places).
- [ ] Extend `docs/agents/widget-contract.md` § "How to add a new
      widget" with a 7-step walkthrough showing the actual file
      contents at each step:
      1. Pick the slot + name
      2. Copy `_template/` → `chat-widgets/ChipsBar/`
      3. Fill in `ChipsBar.README.md` (show the populated file)
      4. Fill in `ChipsBar.test.tsx` (show the populated file)
      5. Implement `ChipsBar.tsx` (show the populated file)
      6. Mount it in a host (show the JSX)
      7. Run `npm test` — drift guard + own tests pass.
- [ ] The walkthrough must close with the verification command and
      expected output, not just the procedure.

## Phase 3 — OpenSpec Widget Contract Requirement (P1, ~30 min)

- [ ] **Failing assertion**: `grep -i "widget contract" openspec/specs/app-architecture/spec.md` returns 0 SHALL statements.
- [ ] Add a new Requirement to
      `openspec/specs/app-architecture/spec.md`:
      ```
      ### Requirement: Every widget SHALL conform to the slot contract

      Every component under `app/src/components/chat-widgets/<Name>/`
      or `app/src/components/viewer-widgets/<Name>/` SHALL:
      (1) export a single default consumer-facing component named
      after the directory;
      (2) accept a `mode: "onboarding" | "steady"` prop that locks
      editable affordances under `mode="onboarding"`;
      (3) ship a sibling `README.md` documenting the widget;
      (4) ship a sibling `.test.tsx` covering mount-in-both-modes
      + locked-affordances-absent-under-onboarding + required
      events;
      (5) compose only from `primitives/`, `brand/`, or `layout/`
      (never another widget slot or `views/`).
      ```
- [ ] Add 2 Scenarios:
      - Drift-guard test fires when a widget directory is missing
        README or sibling test.
      - Drift-guard test fires when the widget's main file doesn't
        export a component whose props type includes `mode`.
- [ ] Validate: `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict` passes.

## Phase 4 — README content drift guard (P3, ~30 min)

- [ ] **Failing assertion**: a widget's README that ships without
      the required headers passes the drift guard today.
- [ ] Extend `app/src/test/widget-contract.test.ts` to read each
      widget's README and assert it contains:
      - `## What it does` (or `## Purpose`)
      - `## Props`
      - `## Locked affordances under \`mode="onboarding"\`` (or
        equivalent)
      - `## Events` (or `## Callbacks`)
      - `## How to mount` (or `## Integration`)
- [ ] Backfill any existing widget README that fails the new check
      (audit pass: catalog which widgets need updates, then update
      them in this same phase to keep tests green).

## Phase 5 — Edge-case recipes (P2, ~45 min)

- [ ] Add "Promote brand → widget" section to
      `widget-contract.md`. Cover: signal that triggers promotion
      (complexity threshold, multi-instance, mode-conditional
      affordances), file-level migration steps, test-suite
      migration, what stays in `brand/`.
- [ ] Add "Anti-examples" section to `widget-contract.md`. List 5
      concrete examples of components that are NOT widgets
      (`CiteChip`, `Heading`, `OnboardingNav`, `AppShell`,
      `IconButton`) with the rule of thumb for each.

## Closure (per Rule 9)

- [ ] OpenSpec `validate --all --strict` passes.
- [ ] `widget-contract.test.ts` green (drift guard extensions land
      without breaking existing widgets).
- [ ] App + middleware test suites green.
- [ ] Archive the change via `openspec archive` once shipped.
