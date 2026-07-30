## 1. Repo-tailored policy files

- [x] 1.1 Add root `.gitattributes` — `text eol=lf` for `.ts .tsx .jsx .mjs .json .css .html .md .yaml .yml`, `binary` for `.png .ttf`, plus a documented `*.bat`/`*.cmd` → CRLF exception rule (inactive today, per required behavior).
- [x] 1.2 Add root `.editorconfig` — `end_of_line = lf`, `charset = utf-8`, `insert_final_newline = true` for the same text extensions.

## 2. Guard script (test-first)

- [x] 2.1 RED: create a scratch (uncommitted) fixture file with a CRLF line ending inside the repo tree; confirm there is no working guard yet to catch it (the script does not exist).
- [x] 2.2 GREEN: implement `scripts/check-line-endings.mjs` per design — root-anchored via `git rev-parse --show-toplevel`, tracked-file scope from `git ls-files -z` filtered to the `.gitattributes` LF extension set, CRLF/mixed-line detection per file, non-zero exit with every offending path printed, 0 exit when clean.
- [x] 2.3 Verify GREEN: run `node scripts/check-line-endings.mjs` — confirm it exits non-zero and lists the scratch fixture from 2.1; delete the scratch fixture; re-run and confirm it exits 0 against the real tracked tree.
- [x] 2.4 Verify the guard is root-anchored: run it from a subdirectory (e.g. `cd app && node ../scripts/check-line-endings.mjs`) and confirm identical behavior — this is the specific defect the prior AGE-212 rollout hit in 4 of 7 sibling repos.

## 3. Wire into the enforced test path

- [x] 3.1 Add a `check:line-endings` script to `package.json` running the guard.
- [x] 3.2 Chain `check:line-endings` into the root `test` script (alongside the existing `test:alias` / `test:setup-env` / `test:deploy` / `test:skills-sync` steps).
- [x] 3.3 Run `npm test` locally end-to-end and confirm it still passes with the new step included.

## 4. Closure verification

- [x] 4.1 Re-run the guard directly against the real tracked tree and confirm 0 offenders — no separate normalization PR is needed (ticket's "no offenders → land together" rule).
- [x] 4.2 Run `git diff --check` to confirm this change's own new files (`.gitattributes`, `.editorconfig`, `scripts/check-line-endings.mjs`, `package.json`) introduce no whitespace/line-ending issues.
- [x] 4.3 Confirm N/A: no persisted DB column, API endpoint, or app context is touched by this change (repo tooling only) — no dead-column/dead-endpoint/dead-context cross-check applies.
- [x] 4.4 Confirm N/A: no UI component is added or changed by this change — no component story or per-app manual QA golden-flow path applies; the manual verification path is `npm test` (task 3.3) plus the guard runs in 2.3–2.4.
- [x] 4.5 `openspec validate --type change "age-212-standardize-line-ending-policy"` passes.

Cross-repo note: this change covers `workspace-groundx-v2-ui-a7a4fac7` only. See the workspace
`openspec/changes/AGE-212-standardize-line-ending-policy/tasks.md` for cross-repo coordination
(the other SDD-supported repos in scope) and any deferred follow-ups.
