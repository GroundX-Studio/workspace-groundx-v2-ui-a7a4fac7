## Goals / Non-Goals

**Goals:**
- Make LF the enforced line-ending policy for this repo's tracked text files, with binaries
  explicitly protected from normalization.
- Enforce it through the existing `npm test` path (the command CI already runs) — no new CI
  workflow.
- Land policy + guard together in one PR, since the repo scan found 0 existing CRLF/mixed-line
  offenders (no separate normalization PR is needed — AGE-212's "no offenders → land together"
  rule).

**Non-Goals:**
- No functional/behavioral code change to the app or middleware.
- No bespoke test harness beyond the guard script (`scripts/test-package-scripts.mjs` is a
  scaffold-only pattern this repo does not have and this change does not add).
- No new GitHub Actions workflow — CI already runs `npm test`.
- No other repos — this design covers `workspace-groundx-v2-ui-a7a4fac7` only.

## Decisions

**`.gitattributes` scope — the repo's actual tracked text extensions, not a generic template.**
Source of truth: `git ls-files` inventory taken during proposal grounding (confirmed again during
design: 701 `.md`, 380 `.ts`, 263 `.tsx`, 25 `.jsx`, 13 `.mjs`, 13 `.json`, 11 `.yaml`, 7 `.yml`,
4 `.html`, 16 `.png`, 9 `.ttf`; 0 `.bat`/`.cmd`). `.gitattributes` declares `text eol=lf` for
`.ts .tsx .jsx .mjs .json .css .html .md .yaml .yml` and `binary` for `.png .ttf`, plus a
documented (inactive today) `*.bat`/`*.cmd` → CRLF exception rule per the ticket's required
behavior. `.txt`/`.js`/`.sh` and other tracked-but-rare extensions stay out of scope — the
approved proposal scoped the extension list explicitly and this design does not expand it.

**`.editorconfig` — defaults only, not a lint rule.** `.editorconfig` is advisory (editor-level);
it cannot fail a build. It carries `end_of_line = lf`, `charset = utf-8`,
`insert_final_newline = true` for the same text extensions, so contributor editors default to the
same policy `.gitattributes` enforces at the git layer. The enforcement mechanism is the guard
script below, not the editorconfig file.

**Guard implementation — pure Node `.mjs`, matching the scaffold's existing pattern.**
`scripts/check-line-endings.mjs` mirrors `scripts/scan-secrets.mjs`: zero dependencies, reads the
tracked file list via `git ls-files -z` (`--cached --others --exclude-standard`), filters to the
extensions `.gitattributes` declares LF-normalized text, reads each file and checks for `\r\n` or
a bare `\r`, and prints every offending path before exiting non-zero. It excludes `.png`/`.ttf`
and any extension not in the LF set, so it cannot mis-flag a binary. This is a read-only check —
it never rewrites a file — matching the ticket's "CI/validation fails" requirement, not a
silent-fix requirement.

**Wiring point — chain into `test`, add no new script category.** A new `check:line-endings` npm
script runs the guard; the root `test` script (already the CI-run command per `package.json`)
chains it alongside the existing `test:alias` / `test:setup-env` / `test:deploy` /
`test:skills-sync` steps. No new GitHub Actions workflow is needed because CI already runs
`npm test`.

**Drift-prevention:** `npm run check:line-endings` (standalone) or `npm test` (chained) is the
command that proves the requirement holds — a reintroduced CRLF/mixed-line file fails either
one. This is the check itself; no separate drift-guard test file is needed since the guard *is*
the guard.

## Risks / Trade-offs

- **New tracked extension added later without a `.gitattributes` entry** → its line endings stay
  unnormalized and unguarded. Mitigation: the guard's scope is `.gitattributes`-driven, so
  extending coverage is a one-line `.gitattributes` addition, not a script rewrite.
- **Guard runs from a subdirectory and silently no-ops** — a defect independently hit by 4 of 7
  sibling-repo builders in this same rollout (per prior AGE-212 review). Mitigation: the guard
  resolves the repo root via `git rev-parse --show-toplevel` before calling `git ls-files`, so it
  behaves the same regardless of the invoking cwd.
- **`.editorconfig` defaults are advisory only** — a contributor's editor can still ignore it.
  Mitigation: this is why enforcement lives in the guard (git-level, CI-enforced), not the
  editorconfig file.

No ADR is warranted — this is a single, low-risk tooling addition with no architectural decision
beyond what's captured above.
