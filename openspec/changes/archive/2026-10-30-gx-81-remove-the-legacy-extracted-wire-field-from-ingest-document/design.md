## Goals / Non-Goals

Goals: stop this repo declaring and documenting the retired `extracted` ingest-document field (see `proposal.md`).

Non-Goals: any `converted` typing or handling, `docs/agents/groundx-real-api-shapes.md`, unrelated `extract*` names.

## Decisions

- Delete the field declaration and its JSDoc mention rather than marking it `@deprecated`: no reader exists in this repo, and `IngestProcessDocument` inherits an index signature from `GroundXDocument`, so a payload that still carries `extracted` keeps compiling and parsing.
- Delete the `extracted: false` fixture line only. The fixture stays otherwise unchanged, so the existing `getGroundXProcessingStatus` assertions keep covering the document shape.
- Rewrite the `gotchas.md` section instead of deleting it: the lesson that a document-level flag is not a workflow-run signal stays useful, but the field it names is retired, so the section is retitled and points at `converted` as the source-file-conversion signal.
- Proof is three grep checks (type, fixture, gotchas doc), each failing on the unchanged code and passing once the reference is gone. No new test is added: the type system cannot assert absence (the index signature makes any property key valid) and no behavior changes.
- Archive with `openspec archive --skip-specs`: no capability changes, so there is no delta to sync into `openspec/specs/`. `openspec validate --type change` reports "no deltas found" for this change by design; the `specs/` placeholder stays.

No ADR: the change removes a stale declaration and carries no architectural decision.
