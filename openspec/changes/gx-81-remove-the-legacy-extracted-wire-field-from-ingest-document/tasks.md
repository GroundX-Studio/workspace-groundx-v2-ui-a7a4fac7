## 1. Retire the field (single slice: type, fixture, doc)

- [ ] 1.1 Remove `extracted?: boolean` from `IngestProcessDocument` and `extracted` from its JSDoc field list in `app/src/api/entities/sdkTypes.ts`
  check: ! grep -nw "extracted" app/src/api/entities/sdkTypes.ts
- [ ] 1.2 Remove the `extracted: false` fixture line from `app/src/api/entities/groundxDocumentsEntity.test.ts`
  check: ! grep -n "extracted: false" app/src/api/entities/groundxDocumentsEntity.test.ts
- [ ] 1.3 Rewrite the `document.extracted` section in `docs/agents/gotchas.md` so it no longer documents the retired field
  check: ! grep -n "document.extracted" docs/agents/gotchas.md

## 2. Closure verification

- [ ] 2.1 Run lint, build and the full suite; confirm no remaining read of `.extracted` on a document and no dead type or endpoint left behind
  check: npm run build && npm --workspace app run lint && npm --workspace app exec vitest run src/api/entities

See workspace `openspec/changes/<change>/tasks.md` for cross-service coordination and deferred items.
