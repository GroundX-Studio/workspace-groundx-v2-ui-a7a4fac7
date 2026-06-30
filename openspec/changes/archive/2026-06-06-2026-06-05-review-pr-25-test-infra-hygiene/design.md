# Design

## Source of truth

The source of truth is the GitHub PR diff for:

- Repository: `GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7`
- PR: `#25`
- Base: `workspace/groundx-v2-ui`
- Head: `fix/test-infra-portability-and-doc-cleanup`

The review mirrors the PR diff into an evidence ledger inside `tasks.md`; no
separate tracker is introduced.

## Review method

1. Capture PR metadata and file list.
2. Checkout the PR head locally, preserving any unrelated local work.
3. Reproduce each PR claim where the local runtime can do so.
4. Review the code in separate passes. A single file-by-file scan is not enough.
5. Run targeted gates before broad gates.
6. Run app test commands sequentially; the app test wrapper runs tool-reference
   self-tests that create temporary fixture files.
7. Reconcile all pass notes into one finding ledger before posting feedback.
8. Post GitHub review comments only for confirmed defects or missing evidence.

## Multi-pass review protocol

Each changed file must be evaluated through these independent passes:

| Pass | Lens | Failure mode it is meant to catch |
| --- | --- | --- |
| 1 - Intent and claim map | Compare PR title/body/commit messages to the diff. | The PR says it fixed or cleaned up something the code does not actually fix. |
| 2 - Scaffold philosophy | Compare the change to `AGENTS.md`, `docs/agents/principles.md`, `docs/agents/discipline.md`, `docs/agents/gotchas.md`, `CONTRIBUTING.md`, and `docs/agents/hacking-vs-solving.md`. | The change is locally plausible but violates the scaffold's planning, test-first, no-mock, no-hardcode, or source-of-truth rules. |
| 3 - Harness and brand fit | Compare UI/runtime choices to the GroundX Studio Harness web UI and design standards. | The change drifts from the scaffold stack, token system, visual standards, or harness delivery discipline. |
| 4 - Contract and behavior | Read touched code as production/runtime behavior, not as a diff. | A small lint or test-infra edit changes user-visible behavior, callback lifecycle, persistence, or type guarantees. |
| 5 - Test adversary | Try to make the tests pass while the behavior is wrong. | A guard is too weak, only tests implementation details, or hides a real regression. |
| 6 - Mechanical hygiene | Check whitespace, lint disables, stale docs, broad suppressions, and build artifacts. | A cleanup PR leaves cleanup defects behind. |
| 7 - Evidence replay | Run targeted and broad verification, then compare outputs to PR claims. | Review notes are based on assumptions, stale PR text, or unavailable runtime evidence. |
| 8 - Cold reconciliation | Re-read the finding ledger after all passes and challenge each verdict. | Early conclusions survive even after later evidence contradicts them. |

The final review table must include a column for each pass or explicitly mark a
pass as not applicable. A file cannot be marked "reviewed" because it was only
read once.

## Evidence classes

| Evidence | What it proves |
| --- | --- |
| Source inspection | The implementation matches the stated intent and local architecture. |
| Targeted unit or contract test | The touched behavior is guarded. |
| Lint/build output | Mechanical cleanup did not create new errors or hidden warnings. |
| Cross-runtime run | Node 24/25 claims are real, not only inferred from comments. |
| GitHub review comment | A confirmed issue is actionable for the PR author. |

Screenshots are not needed for this PR because the touched UI surface is limited
to the consent CTA styling and can be checked through source, token tests, and
lint.

## PR feedback outputs

The review is not complete until feedback is added to PR #25. Feedback must be
posted in three layers:

1. **Busy-human summary comment**: a short top-level comment near the start of
   the review feedback. It must use plain English, name the merge decision,
   list only the highest-priority blockers or risks, and point to the exact
   evidence commands. It should be readable in under one minute.
2. **Claude repair comment**: a longer top-level comment addressed to the coding
   tool that will repair the branch. It must give a step-by-step fix sequence,
   require the tool to read `AGENTS.md` and the reference docs first, require
   GroundX Studio Harness alignment for UI/runtime decisions, require OpenSpec
   updates where behavior or durable test infrastructure changes, and require
   Superpowers-style execution with adversarial review after each repair task.
3. **Inline hunk comments**: only for confirmed issues that are directly
   actionable on a changed line or hunk. Each inline comment must include the
   risk, evidence, and expected fix.

The busy-human summary should not try to teach the whole process. The Claude
repair comment should be explicit enough that a fresh coding agent can repair
the PR without reading this chat.

## File-by-file review inventory

| Area | Review question | Required evidence |
| --- | --- | --- |
| `app/src/test/setup.ts` | Does the fallback Storage preserve enough of the Web Storage contract without masking real jsdom behavior? | `storage-polyfill.test.ts`; a focused ChatStore persistence/QuotaExceededError test; Node 24/25 evidence or explicit external-evidence note. |
| `app/src/test/storage-polyfill.test.ts` | Does the guard fail for the right regression and avoid testing implementation details only? | Targeted test output and source inspection. |
| `AnalyticsConsentProvider.tsx` | Are forbidden literals replaced with canonical tokens without changing consent behavior? | no-hardcoded-styles gate, source inspection of focus-visible hex, consent test coverage or documented non-change. |
| `app/eslint.config.js` | Does `no-console` catch prod logs while allowing real diagnostics? | `npm --workspace app run lint`; inspection of allowed `warn` and `error` only. |
| `chatSessions.ts` | Is the debug block DEV-only and intentionally exempted? | Source inspection and build output. |
| `OnboardingSessionContext.tsx` | Are `advanceFrame` logs gated, and does `pickScenario` read current entity state without stale closure or churn? | Hook lint output plus a targeted scenario re-pick test if one exists; source inspection if no direct test exists. |
| `DocumentsProvider.tsx` | Is `api` correctly included in `listProcesses` deps with no effect loop? | Hook lint output and DocumentsProvider test coverage if present. |
| `OnboardingShell.tsx` | Is removing `isF1` from the callback deps behavior-preserving? | Hook lint output and source inspection of the callback body. |
| Contract test files | Did deleting eslint-disable comments keep the type equality asserts load-bearing and avoid whitespace-only artifacts? | `npm --workspace app run lint`, `npm --workspace middleware run lint`, `npm run build`, and whitespace scan. |
| Docs | Are F7 Integrate and e2e credential statements true today? | Source/test grep for `viewer-widgets/Integrate`; local/CI note for real Partner key dependency; `BookCallView`/`VITE_CALENDLY_URL` residual recorded separately from PR-caused failures. |

## Drift prevention

- `openspec validate --all --strict` keeps the plan shape valid.
- `npm run scan:secrets` ensures review notes did not add credential material.
- `npm run build` and workspace lint/test commands catch contract drift.
- GitHub review comments keep PR feedback with the PR instead of in local notes.

## Defect handling

Confirmed defects in PR #25 should be handled in this order:

1. Post the busy-human summary comment.
2. Post the Claude repair comment.
3. Leave inline GitHub review comments on exact files/hunks when findings are
   in the PR diff.
4. If the defect is outside the PR but blocks merge, open or update a GitHub
   issue and reference it in the PR review.
5. Do not patch the PR branch locally unless the user explicitly asks.
