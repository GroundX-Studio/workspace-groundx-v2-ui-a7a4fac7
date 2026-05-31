# Tasks — CF-19 ensureBucketGroup helper

**STATUS: BACKLOGGED (2026-05-30) — needs rework before it can run; NOT in the active set.**

> These tasks are written against a broken proposal (wrong endpoint,
> empty-group-on-create, false idempotency, false data model, retired
> scope discriminant, wrong credential, wrong line number). See the
> Rework checklist in `proposal.md`. Do not execute until rewritten.

## Helper module

- [ ] **Failing test:** `ensureBucketGroup.test.ts` — first call with
      `[B1, B2]` issues exactly one `POST /v1/groups` via a mocked
      Partner client; second call with `[B1, B2]` issues zero POSTs;
      third call with `[B1, B3]` issues one POST.
- [ ] Add `middleware/src/services/ensureBucketGroup.ts` exporting
      `createBucketGroupHelper(partnerClient)` which returns
      `ensureBucketGroup(bucketIds: number[]) → Promise<number>`.
- [ ] Cache shape: a `Map<string, number>` keyed by sorted-id
      `bucketIds.slice().sort((a,b)=>a-b).join(",")`.
- [ ] On miss: `POST /v1/groups` with body
      `{ name: "gx-studio-auto-${cacheKey}" }` via partnerClient.
      Throw a typed error on non-2xx (the caller falls back to
      single-bucket scope per existing handler logic).
- [ ] Reuse the existing Partner-client transport (no new HTTP
      surface).

## Handler wiring

- [ ] **Failing test:** `chatHandler.test.ts` — an entity with
      `bucketIds: [B1, B2]` produces `{ kind: "group", groupId }`
      from `deriveRagContentScope`, with `groupId` matching the
      helper's return.
- [ ] **Failing test:** an entity with `bucketIds: [B1]` keeps the
      `{ kind: "bucket", bucketId: B1 }` shape unchanged.
- [ ] Extend `deriveRagContentScope` to check
      `activeEntity.bucketIds.length > 1` BEFORE the existing
      single-bucket branch. When multi-bucket, await
      `ensureBucketGroup(bucketIds)` and return the group shape.
- [ ] Thread the helper through `ChatHandlerDeps`.

## Cleanup

- [ ] Delete the `TODO(CF-19)` block in `chatRouter.ts:852-862`.
- [ ] Remove the "no upstream caller" caveat from the
      `chat-routing` capability spec (handled via spec delta).

## Closure

- [ ] Middleware tests green (`ensureBucketGroup.test.ts` +
      `chatHandler.test.ts` updates).
- [ ] App tests green (untouched; sanity).
- [ ] OpenSpec `validate --all --strict` passes.
- [ ] Browser smoke if available: a steady session with an entity
      carrying two bucket ids returns real RAG results (not
      "no snippets").
- [ ] Archive the change.
