## Why

cashbot-go is removing the legacy `extracted` field from its ingest-document wire response (GX-81, follow-up to GX-42); `converted` is the sole source-file-conversion signal. This repo still declares `extracted?: boolean` on `IngestProcessDocument` and carries a fixture and a gotcha doc describing it. Nothing here reads the field, so the declarations are stale and misleading.

## What Changes

- Remove `extracted?: boolean` from `IngestProcessDocument` in `app/src/api/entities/sdkTypes.ts` and drop `extracted` from the JSDoc field list above it.
- Remove the `extracted: false` fixture line in `app/src/api/entities/groundxDocumentsEntity.test.ts`.
- Rewrite the `document.extracted` section in `docs/agents/gotchas.md` so it no longer documents a field the wire stops emitting.
- Leave `docs/agents/groundx-real-api-shapes.md` unchanged: it holds dated probe captures of what the API returned at the time.

The stored and emitted data is unaffected in this repo: the type is a hand-written loose shape that inherits an index signature from `GroundXDocument`, so a payload that still carries `extracted` keeps parsing and is simply no longer typed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No spec under `openspec/specs/` describes the `extracted` document field, so no requirement changes.

## Impact

- Code: `app/src/api/entities/sdkTypes.ts`, `app/src/api/entities/groundxDocumentsEntity.test.ts`. A grep of `app/src`, `middleware/src` and `shared` found no read of `.extracted` on a document and no other declaration of the field; the other `extracted`-containing files there match unrelated names.
- Docs: `docs/agents/gotchas.md`.
- Backend contracts: none depended on. No new endpoint, SDK, DB or migration change.
- Compatibility: no consumer in this repo reads the field, so the removal is safe regardless of when cashbot-go stops emitting it. The cashbot-go merge ordering gate (dashboard first) is owned by that repo's change.

## Scope

In scope: the stale type, fixture and gotcha doc above.

Out of scope: `converted` handling or typing, cashbot-go and groundx-ai-dashboard changes, unrelated `extract*` names (`extractId`, `extractedValuesJson`, X-Ray prose), `groundx-real-api-shapes.md`, and line-ending-only changes.

## Open design questions

None. No wireframe frames are affected; closure gate is the existing `npm test` (including the app unit tests for `groundxDocumentsEntity`).
