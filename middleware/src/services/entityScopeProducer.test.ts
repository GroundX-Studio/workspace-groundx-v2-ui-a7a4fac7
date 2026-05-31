import { describe, expect, it } from "vitest";

import { produceEntityScope } from "./entityScopeProducer.js";

// 2026-05-31-steady-scope-producer Phase 1 — producer contract.
//
// The producer maps a known-target entity (today: the `sample`
// EntityKind) to the `chat_session_entities` scope-column refs that
// `deriveRagContentScope` reads back. The decision recorded in the
// change's Phase 0 gate: `sample:<scenarioId>` → the demo scope
// `{ type: "bucket", bucketId: <samplesBucket>, filter: { projectId:
// [scenarioId] } }`. The columns it fills are `bucketId` +
// `projectIdsJson`; `groupId` / `documentIdsJson` have no producer here
// (kept as cf19 / single-doc-viewer substrate, NOT dropped).
//
// "No known target" (unrecognized key, or no samples bucket configured)
// → the producer returns null and the row's scope columns stay NULL, so
// `deriveRagContentScope` falls through to the env-samples fallback (the
// documented anon-onboarding behavior, unchanged).

describe("produceEntityScope — sample EntityKind → demo scope columns", () => {
  it("maps a sample:<scenarioId> entity to bucketId + projectIdsJson when the samples bucket is configured", () => {
    const produced = produceEntityScope("sample:utility", { samplesBucketId: 28454 });
    expect(produced).toEqual({
      bucketId: 28454,
      projectIdsJson: JSON.stringify(["utility"]),
      groupId: null,
      documentIdsJson: null,
    });
  });

  it("uses the scenarioId after the `sample:` prefix as the project filter value", () => {
    const produced = produceEntityScope("sample:loan", { samplesBucketId: 42 });
    expect(produced).toEqual({
      bucketId: 42,
      projectIdsJson: JSON.stringify(["loan"]),
      groupId: null,
      documentIdsJson: null,
    });
  });

  it("returns null (no known target) when no samples bucket is configured — anon-onboarding fallback path stays intact", () => {
    expect(produceEntityScope("sample:utility", { samplesBucketId: null })).toBeNull();
    expect(produceEntityScope("sample:utility", { samplesBucketId: undefined })).toBeNull();
  });

  it("returns null for an unrecognized (non-sample) entity key — only the sample kind has a producer today", () => {
    expect(produceEntityScope("project:abc-123", { samplesBucketId: 28454 })).toBeNull();
    expect(produceEntityScope("document:doc-1", { samplesBucketId: 28454 })).toBeNull();
  });

  it("returns null for a malformed sample key with an empty scenarioId", () => {
    expect(produceEntityScope("sample:", { samplesBucketId: 28454 })).toBeNull();
    expect(produceEntityScope("sample", { samplesBucketId: 28454 })).toBeNull();
  });
});
