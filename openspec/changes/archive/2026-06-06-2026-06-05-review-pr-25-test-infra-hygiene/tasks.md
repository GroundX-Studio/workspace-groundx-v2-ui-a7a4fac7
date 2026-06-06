# Tasks

> Review-only. Do not modify PR #25 code unless the user explicitly approves a
> fix. Every task is SEQUENTIAL and must close with an adversarial review gate
> against the PR diff, the plan, and real verification output.

## Task 1 - Establish baseline and reproduce PR claims (SEQUENTIAL)

- [x] Failing-test-first review gate: on the base branch
      `workspace/groundx-v2-ui`, attempt to reproduce the PR's claimed failures
      before accepting the fixes.
      - Run locally available baseline commands:
        - `git fetch origin workspace/groundx-v2-ui fix/test-infra-portability-and-doc-cleanup`
        - `git switch workspace/groundx-v2-ui`
        - `node -v`
        - `npm --workspace app run lint`
        - `npm --workspace app test -- src/test/storage-polyfill.test.ts`
      - If Node 24 or 25 is available, repeat the storage baseline on that
        runtime and record whether `localStorage.clear()` or `setItem()` fails.
      - If only Node 20 is available, record that Node 24/25 reproduction needs
        external evidence.
- [x] Checkout the PR head:
      `gh pr checkout 25 --repo GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7`.
- [x] Capture PR metadata:
      `gh pr view 25 --repo GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7 --json number,title,headRefName,baseRefName,commits,files,reviews,comments`.
- [x] Adversarial review gate: confirm every PR body claim has a planned
      evidence source, or mark it "unproven" before moving on.

## Task 2 - Build the review ledger and pass matrix (SEQUENTIAL)

- [x] Capture the exact changed-file list:
      `git diff --name-only origin/workspace/groundx-v2-ui...HEAD`.
- [x] Create a review ledger with one row per changed file and these columns:
      - `file`
      - `diff summary`
      - `PR claim covered`
      - `Pass 1 intent/claim verdict`
      - `Pass 2 scaffold philosophy verdict`
      - `Pass 3 harness/brand verdict`
      - `Pass 4 contract/behavior verdict`
      - `Pass 5 test-adversary verdict`
      - `Pass 6 hygiene verdict`
      - `Pass 7 evidence verdict`
      - `Pass 8 cold reconciliation verdict`
      - `risk`
      - `review comment needed`
      - `feedback target` with values `busy-human`, `claude-repair`,
        `inline`, `none`, or a comma-separated combination.
- [x] Mark no verdict as final until Task 10. Early pass verdicts may be
      `pass`, `issue`, `unproven`, or `not applicable`.
- [x] Adversarial review gate: the ledger must contain all 17 changed files
      before any file-specific review begins.

## Task 3 - Pass 1: intent and PR-claim review (SEQUENTIAL)

- [x] Read the PR title, body, commit list, changed-file list, and diffstat.
- [x] For each changed file, write the PR claim it appears to support:
      - test infra portability;
      - lint/no-console hygiene;
      - docs cleanup;
      - hook dependency fix;
      - contract-test cleanup;
      - style-token cleanup;
      - other.
- [x] Compare each claim against the actual diff hunks. Record mismatches,
      stale PR body statements, and unsupported claims in the ledger.
- [x] Adversarial review gate: assume the PR body is wrong until the diff and
      verification output prove it right.

## Task 4 - Pass 2: scaffold philosophy review (SEQUENTIAL)

- [x] Re-read these project references before judging the code:
      - `AGENTS.md`
      - `docs/agents/principles.md`
      - `docs/agents/discipline.md`
      - `docs/agents/gotchas.md`
      - `CONTRIBUTING.md`
      - `docs/agents/hacking-vs-solving.md`
- [x] For each changed file, record whether the change conforms to:
      - solve-to-model rather than patching symptoms;
      - TDD or at least a specific regression guard;
      - no hardcoded product/brand drift;
      - no broad suppressions;
      - one source of truth;
      - real verification instead of mock-mode assumptions.
- [x] Adversarial review gate: a change that makes tests green by weakening the
      scaffold's philosophy is a review finding even if the local gate passes.

## Task 5 - Pass 3: GroundX Studio Harness and brand review (SEQUENTIAL)

- [x] Compare the touched UI/runtime choices against the GroundX Studio Harness
      web UI guidance:
      - keep the Vite/React/MUI + Express middleware stack;
      - use repo tokens/constants instead of hardcoded styling;
      - preserve implementation discipline and test-first review;
      - do not introduce rival docs, trackers, or generated surfaces.
- [x] For `AnalyticsConsentProvider.tsx`, verify every touched color, font
      weight, focus ring, hover state, and CTA style against repo constants or
      an explicit product-brand reason.
- [x] For docs changes, verify the language does not contradict scaffold docs or
      harness delivery expectations.
- [x] Adversarial review gate: a styling or docs cleanup cannot leave a
      hardcoded brand value in a touched block without either fixing it or
      creating an explicit follow-up finding.

## Task 6 - Pass 4: contract and behavior review (SEQUENTIAL)

- [x] Read each touched runtime file without looking at the PR description, and
      ask what behavior changed:
      - `app/src/api/chatSessions.ts`
      - `app/src/components/privacy/AnalyticsConsent/AnalyticsConsentProvider.tsx`
      - `app/src/contexts/DocumentsContext/DocumentsProvider.tsx`
      - `app/src/contexts/OnboardingSessionContext/OnboardingSessionContext.tsx`
      - `app/src/views/Onboarding/OnboardingShell.tsx`
      - `app/src/test/setup.ts`
- [x] Inspect every changed contract-test file and confirm type equality asserts
      still fail the build when the shared and local types diverge.
- [x] Record behavior risks in the ledger: persistence changes, callback
      identity churn, stale closures, production logging, consent gating, and
      hidden test-environment drift.
- [x] Adversarial review gate: no change may be dismissed as "just lint" until
      its runtime and contract implications are checked.

## Task 7 - Pass 5: test-adversary review (SEQUENTIAL)

- [x] For `app/src/test/setup.ts`, ask whether the fallback Storage could make a
      broken jsdom/storage behavior look healthy.
- [x] For `app/src/test/storage-polyfill.test.ts`, check whether the assertions
      prove the claimed Web Storage behavior or only a narrower method subset.
- [x] For hook dependency fixes, locate targeted tests or lint coverage that
      would fail if the stale closure remained.
- [x] For the style cleanup, verify whether the hardcoded-style test catches
      embedded hex strings inside CSS shorthands.
- [x] For contract tests, verify the deleted eslint-disable comments did not
      remove the load-bearing type assertion pattern.
- [x] Adversarial review gate: record at least one plausible "test passes but
      behavior is wrong" scenario for each changed area, then decide whether
      existing tests close that hole.

## Task 8 - Pass 6: mechanical hygiene review (SEQUENTIAL)

- [x] Search for whitespace-only lines introduced by deleting eslint-disable
      comments:
      `git diff --check origin/workspace/groundx-v2-ui...HEAD`.
- [x] Search for broad or stale suppressions:
      - `rg -n "eslint-disable|eslint-disable-next-line|ts-expect-error|ts-ignore" app middleware docs`
      - `rg -n "console\\.(log|group|groupCollapsed|groupEnd|info|debug)" app/src`
- [x] Run:
      - `npm --workspace app run lint`
      - `npm --workspace middleware run lint`
      - `npm run build`
- [x] Adversarial review gate: a hygiene PR with whitespace artifacts, stale
      suppressions, or unaccounted warnings cannot be called clean.

## Task 9 - Pass 7: evidence replay and targeted verification (SEQUENTIAL)

- [x] Run targeted storage tests:
      - `npm --workspace app test -- src/test/storage-polyfill.test.ts`
      - `npm --workspace app test -- src/contexts/ChatStoreContext`
      - Run these app test commands sequentially. `npm --workspace app test`
        runs `check-tool-references.test.mjs`, which creates temporary fixture
        files; parallel app test commands can race each other and produce a
        false failure.
- [x] If Node 24/25 is available, run the same targeted storage tests there.
      If not available, explicitly record "Node 24/25 not locally verified".
- [x] Run targeted style and consent tests:
      - `npm --workspace app test -- src/test/no-hardcoded-styles.test.ts src/components/privacy/AnalyticsConsent/AnalyticsConsentProvider.test.tsx`
- [x] Run targeted hook and onboarding tests:
      - `npm --workspace app test -- src/contexts/OnboardingSessionContext/OnboardingSessionContext.test.tsx src/contexts/OnboardingSessionContext/gateLifecycle.test.tsx src/views/Onboarding/OnboardingShell.test.tsx src/contexts/sdkContexts.test.tsx`
- [x] Run middleware tests:
      `npm --workspace middleware test`.
- [x] Adversarial review gate: compare actual output to the PR body and record
      stale, unsupported, or runtime-specific claims.

## Task 10 - Pass 8: cold reconciliation and final review decision (SEQUENTIAL)

- [x] Re-read the ledger from top to bottom without the PR body open.
- [x] Challenge every `pass` verdict with these questions:
      - Which command, source line, or doc proves this?
      - Could the test still pass if the implementation were wrong?
      - Does this conform to scaffold docs and harness philosophy?
      - Is the finding actionable on a specific PR hunk?
- [x] Re-read all `issue` and `unproven` verdicts and downgrade only when there
      is direct counter-evidence.
- [x] Build the final review table with one row per changed file:
      `file`, `passes completed`, `risk`, `evidence`, `verdict`, `follow-up`.
- [x] Draft the busy-human PR comment:
      - under 250 words;
      - plain English;
      - starts with the merge recommendation;
      - lists only confirmed blockers and highest-risk issues;
      - includes exact verification commands that failed or passed;
      - avoids process lectures.
- [x] Draft the Claude repair PR comment:
      - names the expected repair workflow before naming individual code fixes;
      - tells Claude to read `AGENTS.md`, `docs/agents/principles.md`,
        `docs/agents/discipline.md`, `docs/agents/gotchas.md`,
        `CONTRIBUTING.md`, and `docs/agents/hacking-vs-solving.md` before editing;
      - tells Claude to use the GroundX Studio Harness guidance for UI/runtime
        and brand-token decisions;
      - tells Claude to use OpenSpec for durable behavior or test-infra
        contract changes;
      - tells Claude to use Superpowers-style task execution with an
        adversarial review gate after each repair task;
      - gives an ordered fix sequence and exact verification commands.
- [x] Draft inline comments only for verified hunk-level findings.
- [x] Adversarial review gate: no changed file is unreviewed, no PR claim is
      unproven, no pass column is blank, no feedback target is missing for a
      confirmed issue, and no merge blocker is left only in local notes.

## Task 11 - Area-specific deep dives retained from the review passes (SEQUENTIAL)

These checks are required inside Tasks 3-10; they are listed here so no changed
area gets lost during execution.

### Node 24/25 Web Storage test setup

- [x] Inspect `app/src/test/setup.ts` for:
      - fallback only when active storage is non-functional;
      - `localStorage` and `sessionStorage` both covered;
      - no leakage between tests beyond the existing `beforeEach` clears;
      - `Storage.prototype` chaining sufficient for the spy behavior claimed;
      - no browser/runtime production impact.
- [x] Run targeted PR-head tests:
      - `npm --workspace app test -- src/test/storage-polyfill.test.ts`
      - `npm --workspace app test -- src/contexts/ChatStoreContext`
      - Run these app test commands sequentially. `npm --workspace app test`
        runs `check-tool-references.test.mjs`, which creates temporary fixture
        files; parallel app test commands can race each other and produce a
        false failure.
- [x] If Node 24/25 is available, run the same targeted storage tests there.
      If not available, explicitly record "Node 24/25 not locally verified".
- [x] Review the documented StorageEvent caveat: decide whether a PR that leaves
      a known failing test on Node 24/25 is mergeable, needs a skip with an
      issue, or needs a jsdom upgrade before merge.
- [x] Adversarial review gate: the storage fallback must not make the suite
      green by hiding a real jsdom or cross-tab behavior regression.

### Styling and consent behavior

- [x] Inspect `app/src/components/privacy/AnalyticsConsent/AnalyticsConsentProvider.tsx`.
- [x] Confirm `FONT_WEIGHT_HEADLINE` equals the intended `700` token and
      `darken(NAVY, 0.2)` matches the previous hover intent closely enough.
- [x] Check the remaining `outline: "2px solid #7f96ff"` literal. If the
      no-hardcoded-styles guard intentionally misses outline shorthands, record
      whether this PR should fix the guard gap or leave it as follow-up.
- [x] Run the style/lint guard:
      - `npm --workspace app run lint`
      - targeted no-hardcoded-styles test if present in the app suite.
- [x] Adversarial review gate: consent initialization, storage of consent state,
      and third-party script gating must be unchanged by the style cleanup.

### `no-console` and production log gating

- [x] Inspect `app/eslint.config.js` and confirm `no-console` is `warn` with
      only `warn` and `error` allowed.
- [x] Inspect `app/src/api/chatSessions.ts` and confirm the disabled console
      block is inside `import.meta.env.DEV`.
- [x] Inspect `app/src/contexts/OnboardingSessionContext/OnboardingSessionContext.tsx`
      and confirm every `console.log` call is gated by `import.meta.env.DEV`.
- [x] Run:
      - `npm --workspace app run lint`
      - `npm run build`
- [x] Search for console output in app runtime code:
      `rg -n "console\\.(log|group|groupCollapsed|groupEnd|info|debug)" app/src`.
- [x] Adversarial review gate: no ungated debug log may remain in production
      paths, and no broad eslint-disable may mask future logs.

### Hook dependency changes

- [x] Inspect `DocumentsProvider.listProcesses` and confirm `[api, run]` is
      the correct dependency set.
- [x] Inspect `OnboardingSessionContext.pickScenario` and confirm
      `registry.state.entities` is stable enough to include and necessary to
      resolve an existing entity's `lastFrame`.
- [x] Inspect `OnboardingShell` and confirm `isF1` is truly unused by
      `handleStepSelect`.
- [x] Run:
      - `npm --workspace app run lint`
      - targeted tests for `DocumentsProvider`, `OnboardingSessionContext`, and
        `OnboardingShell` if present. Use workspace-relative test paths such as
        `src/contexts/OnboardingSessionContext/OnboardingSessionContext.test.tsx`
        when invoking `npm --workspace app test -- ...`.
- [x] Adversarial review gate: the fixes must remove stale closures without
      introducing callback churn, accidental re-renders, or navigation changes.

### Contract-test cleanup and mechanical artifacts

- [x] Inspect every changed contract-test file and confirm type equality asserts
      still fail the build when the shared and local types diverge.
- [x] Search for whitespace-only lines introduced by deleting eslint-disable
      comments:
      `git diff --check origin/workspace/groundx-v2-ui...HEAD`.
- [x] Run:
      - `npm --workspace app run lint`
      - `npm --workspace middleware run lint`
      - `npm run build`
- [x] Adversarial review gate: removed eslint-disable comments must not leave
      lint noise, whitespace artifacts, or type asserts that are no longer
      load-bearing.

### Documentation claims

- [x] Verify `docs/agents/overview.md` F7 Integrate "Real" claim against:
      - `app/src/components/viewer-widgets/Integrate`;
      - its README and tests;
      - the mount path that makes F7 reachable.
- [x] Verify `docs/agents/gotchas.md` Node 24/25 Storage note against Task 2
      evidence.
- [x] Verify `docs/agents/gotchas.md` e2e Partner-key note against the current
      no-mock-mode docs and local e2e setup.
- [x] Adversarial review gate: docs must not overclaim shipped behavior or
      convert a local setup limitation into an unexplained product failure.

## Task 12 - Full review closeout (SEQUENTIAL)

- [x] Run OpenSpec validation:
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-05-review-pr-25-test-infra-hygiene --strict`.
- [x] Run repo gates available locally:
      - `npm run scan:secrets`
      - `npm run build`
      - `npm --workspace app run lint`
      - `npm --workspace middleware run lint`
      - `npm --workspace app test`
      - `npm --workspace middleware test`
      - If `npm --workspace app test` fails only on the known
        `BookCallView` `VITE_CALENDLY_URL` fixture, record the exact pass/fail
        counts and whether the PR created, fixed, or merely carried that
        environment-gated residual.
- [x] Build a final review table with one row per changed file:
      `file`, `risk`, `evidence`, `verdict`, `follow-up`.
- [x] Post the busy-human top-level PR comment first.
- [x] Post the Claude repair top-level PR comment second.
- [x] Post inline GitHub review comments for confirmed hunk-level findings
      only. Each inline comment must include file/hunk, risk, and evidence.
- [x] After posting, read back the PR comments and confirm the two top-level
      comments and any inline comments are visible on PR #25.
- [x] Adversarial review gate: no changed file is unreviewed, no PR claim is
      unproven, no confirmed issue lacks PR-visible feedback, and no merge
      blocker is left only in local notes.
