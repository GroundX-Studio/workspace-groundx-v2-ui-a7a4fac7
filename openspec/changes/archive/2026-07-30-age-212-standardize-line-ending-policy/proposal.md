## Why

GitHub renders line-ending-only normalization as large whole-file add/delete diffs (the ai-server
`detect_ocr.py` case: 106/106 lines on a no-code-text-change PR), which makes real review harder.
This repo has no explicit line-ending policy today, so editor/OS defaults can silently introduce
CRLF or mixed line endings with nothing to catch it before merge.

## What Changes

- Add root `.gitattributes` declaring LF for this repo's actual tracked text extensions
  (`.ts .tsx .jsx .mjs .json .css .html .md .yaml .yml`) and `binary` for the tracked binary
  formats (`.png`, `.ttf`).
- Add root `.editorconfig` defaulting normal source/doc/config files to LF, UTF-8, and a trailing
  newline.
- Add `scripts/check-line-endings.mjs` — a pure Node, zero-dependency guard (same pattern as the
  scaffold's other `scripts/*.mjs` checks) that scans tracked text files and fails with a clear
  list of offenders if any contain CRLF or mixed line endings.
- Wire the guard into `package.json`: a new `check:line-endings` script, chained into the existing
  root `test` script so CI (which runs `npm test`) enforces it automatically.
- No `*.bat`/`*.cmd` files are tracked in this repo today, so no CRLF exception is needed; the
  policy documents the exception rule anyway per the ticket's required behavior, for when/if such
  files are added.

**Out of scope** (per AGE-212's own scope + the guard-first-can-fail rule):
- No functional/behavioral code changes.
- No bespoke test harness beyond the guard script itself — this repo has no
  `scripts/test-package-scripts.mjs` (unlike the scaffold) and none is added.
- No normalization PR — the repo scan below found **0 existing CRLF/mixed-line-ending
  offenders**, so policy + guard land together (per the ticket's "no offenders → land together"
  rule); there is nothing to normalize.
- No GitHub Actions workflow changes — CI already runs `npm test`, so chaining into `test` is
  sufficient; no separate workflow file exists in this repo to touch.
- No other repos — this proposal covers `workspace-groundx-v2-ui-a7a4fac7` only.

## Capabilities

### New Capabilities
- `line-ending-policy`: repo-tailored `.gitattributes`/`.editorconfig` policy plus a CI-enforced
  guard (chained into `npm test`) that fails when tracked text files contain CRLF or mixed line
  endings.

### Modified Capabilities
(none — no existing capability's requirements change)

## Impact

- **Affected files (new only):** `.gitattributes`, `.editorconfig`, `scripts/check-line-endings.mjs`.
- **Touched scaffold module:** `package.json` `scripts` block — add `check:line-endings`, chain it
  into `test` (no other script's behavior changes).
- **Affected wireframe frames:** none — this is repo tooling/contribution hygiene, not a
  user-facing F-series onboarding frame or app view.
- **Closure-gate tests:** `npm test` (now includes `check:line-endings`); `npm run scan:secrets`
  and the existing drift guards are unaffected and continue to run as before.
- **Backend contracts:** none. This proposal makes no API/contract change (matches the Linear
  ticket's "API / Contract Changes: None").
- **Repo inventory confirmed during grounding:** tracked text extensions are `.md .ts .tsx .jsx
  .mjs .json .yaml .yml .html .txt .css .js .sh` (plus a couple of dotfiles/templates); tracked
  binaries are `.png` (16) and `.ttf` (9); no `.bat`/`.cmd` files are tracked; 0 files currently
  contain CRLF or mixed line endings.
