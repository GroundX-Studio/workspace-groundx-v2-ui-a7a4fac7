## ADDED Requirements

### Requirement: Root `.gitattributes` normalizes tracked text to LF and protects binaries
The repo SHALL declare a root `.gitattributes` that normalizes this repo's actual tracked text
extensions (`.ts`, `.tsx`, `.jsx`, `.mjs`, `.json`, `.css`, `.html`, `.md`, `.yaml`, `.yml`) to
`text eol=lf`, marks the tracked binary formats (`.png`, `.ttf`) as `binary`, and documents that
`*.bat`/`*.cmd` files are the one exception permitted to remain CRLF (even though none are
currently tracked in this repo).

#### Scenario: gitattributes normalizes a tracked source file to LF
- **WHEN** a contributor's editor writes a `.ts`, `.tsx`, `.jsx`, `.mjs`, `.json`, `.css`,
  `.html`, `.md`, `.yaml`, or `.yml` file with CRLF line endings and it passes through git with
  this repo's `.gitattributes` in effect
- **THEN** git normalizes the file's line endings to LF on checkin, so it is never committed with
  CRLF

#### Scenario: gitattributes protects binary assets from normalization
- **WHEN** a `.png` or `.ttf` file is added or checked out
- **THEN** git treats it as `binary` and applies no line-ending normalization to it

#### Scenario: gitattributes documents the `.bat`/`.cmd` CRLF exception
- **WHEN** a `.bat` or `.cmd` file is ever added to this repo
- **THEN** `.gitattributes` already declares it may remain CRLF, so adding one does not require a
  policy change

### Requirement: Root `.editorconfig` defaults normal files to LF
The repo SHALL declare a root `.editorconfig` that sets `end_of_line = lf`, `charset = utf-8`,
and `insert_final_newline = true` for normal source, documentation, and config files, so editor
defaults do not reintroduce CRLF or mixed line endings independently of git's own normalization.

#### Scenario: editor honors the repo's LF default for a new file
- **WHEN** a contributor's `.editorconfig`-aware editor creates or edits a tracked source,
  documentation, or config file in this repo
- **THEN** the editor defaults to LF line endings, UTF-8 encoding, and a trailing final newline
  for that file

### Requirement: `scripts/check-line-endings.mjs` guards tracked text files
The repo SHALL provide `scripts/check-line-endings.mjs` — a pure Node.js, zero-dependency script
matching this repo's other `scripts/*.mjs` checks — that enumerates the tracked text extensions
declared LF in `.gitattributes`, excludes the declared binary formats, inspects each file's
content for CRLF (`\r\n`) or mixed line endings, and reports every offender.

#### Scenario: guard fails on a tracked file containing CRLF or mixed line endings (polarity: reject — fail closed, no silent fix)
- **WHEN** a tracked file within the guard's scope contains any CRLF or mixed line-ending content
- **THEN** `node scripts/check-line-endings.mjs` exits non-zero and prints the offending file
  path(s) in its output — it does not silently pass, and it does not rewrite or normalize the
  file itself

#### Scenario: guard passes when every in-scope file is LF (polarity: finalize success)
- **WHEN** every tracked file within the guard's scope contains only LF line endings
- **THEN** `node scripts/check-line-endings.mjs` exits 0

#### Scenario: guard excludes binaries and out-of-scope extensions
- **WHEN** the guard enumerates the tracked file set
- **THEN** it excludes `.png`/`.ttf` (declared `binary`) and any extension not declared
  LF-normalized text in `.gitattributes`, so it never flags a binary or out-of-scope file as an
  offender

### Requirement: The guard is enforced through the repo's standard `test` path
The repo SHALL expose a `check:line-endings` npm script that runs the guard, and the root `test`
script SHALL chain it in, so `npm test` — the command CI already runs — fails whenever a
line-ending offender exists, without requiring a new CI workflow.

#### Scenario: `npm test` fails when the guard fails (polarity: reject before state — no green build with an offender present)
- **WHEN** `check:line-endings` exits non-zero as part of `npm test`
- **THEN** the overall `npm test` invocation fails (non-zero exit), so CI cannot pass while a
  CRLF/mixed-line-ending offender is present in a tracked file

#### Scenario: `npm test` behavior is otherwise unchanged when there are no offenders
- **WHEN** there are no CRLF/mixed-line-ending offenders among tracked in-scope files
- **THEN** `check:line-endings` exits 0 and the rest of `npm test`'s existing steps run and
  determine the suite's outcome exactly as they did before this change
