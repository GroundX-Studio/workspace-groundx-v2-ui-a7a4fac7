## 1. Retire the field (single slice: type, fixture, doc)

- [x] 1.1 Remove `extracted?: boolean` from `IngestProcessDocument` and `extracted` from its JSDoc field list in `app/src/api/entities/sdkTypes.ts`
  check: ! grep -nw "extracted" app/src/api/entities/sdkTypes.ts
- [x] 1.2 Remove the `extracted: false` fixture line from `app/src/api/entities/groundxDocumentsEntity.test.ts`
  check: ! grep -n "extracted: false" app/src/api/entities/groundxDocumentsEntity.test.ts
- [x] 1.3 Rewrite the `document.extracted` section in `docs/agents/gotchas.md` so it no longer documents the retired field
  check: ! grep -n "document.extracted" docs/agents/gotchas.md

## 2. Closure verification

- [ ] 2.1 Run lint, build and the full suite; confirm no remaining read of `.extracted` on a document and no dead type or endpoint left behind
  check: npm run build && npm --workspace app run lint && npm --workspace app exec vitest run src/api/entities

See workspace `openspec/changes/<change>/tasks.md` for cross-service coordination and deferred items.

## 3. CI qualification

- [x] 3.1 Reproduce the current failure on PR head `07b4532`: run 41021594889 attempt 4 passes build/unit tests and fails the Chromium install on Ubuntu 26.04 with Playwright 1.60.0.
- [x] 3.2 Pin the browser-installing jobs in `ci.yml` and `integration.yml` to Ubuntu 24.04; retain the container-only job's runner and all install/test commands. YAML comparison and `npm run test:deploy` pass.

CI acceptance is the GitHub check status on the latest PR #42 revision: Chromium installation, boot smoke and both CI jobs must pass before merge. The separate live-GroundX integration is not a per-PR gate.
