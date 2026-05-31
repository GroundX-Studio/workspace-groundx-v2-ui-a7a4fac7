import { describe, expect, it } from "vitest";

import type { ChatSessionEntityRecord } from "../types.js";
import { deriveRagContentScope } from "./chatHandler.js";

/**
 * WF-07 — GroundX ↔ product domain vocabulary lock (drift guard).
 *
 * Locks the invariant that a product **project / portfolio / fund / folder
 * is a FILTER FIELD on documents within a bucket**, NOT a GroundX group; a
 * GroundX **group is reserved for cross-bucket (multi-workspace) search only**.
 * `deriveRagContentScope` is the single place this mapping is materialized, so
 * this test pins it against future drift (the contradiction that once lived in
 * the decisions doc — "Solar project view = group" — must never reach code).
 */

function entity(partial: Partial<ChatSessionEntityRecord>): ChatSessionEntityRecord {
  return {
    chatSessionId: "cs-test",
    entityKey: "ent-test",
    lastFrame: null,
    completedFramesJson: "[]",
    scanProgressJson: null,
    extractedValuesJson: null,
    bucketId: null,
    projectIdsJson: null,
    groupId: null,
    documentIdsJson: null,
    createdAt: new Date(0),
    lastVisitedAt: new Date(0),
    ...partial,
  };
}

describe("WF-07 domain vocabulary lock — deriveRagContentScope", () => {
  it("a single-workspace project view resolves to bucket + projectId filter-field, NOT a group", () => {
    const scope = deriveRagContentScope(
      entity({ bucketId: 28454, projectIdsJson: JSON.stringify(["proj_sundance"]) }),
      null,
    );
    expect(scope).toEqual({ type: "bucket", bucketId: 28454, filter: { projectId: ["proj_sundance"] } });
    expect(scope?.type).not.toBe("group");
  });

  it("a multi-project view is still a bucket filter (never a group)", () => {
    const scope = deriveRagContentScope(
      entity({ bucketId: 28454, projectIdsJson: JSON.stringify(["P1", "P2"]) }),
      null,
    );
    expect(scope).toEqual({ type: "bucket", bucketId: 28454, filter: { projectId: ["P1", "P2"] } });
    expect(scope?.type).not.toBe("group");
  });

  it("a portfolio / bucket-wide view (no projectIds) is a plain bucket scope (no filter)", () => {
    const scope = deriveRagContentScope(entity({ bucketId: 28454 }), null);
    expect(scope).toEqual({ type: "bucket", bucketId: 28454 });
  });

  it("a group is used ONLY for an explicit multi-workspace groupId", () => {
    const scope = deriveRagContentScope(entity({ groupId: 99 }), null);
    expect(scope).toEqual({ type: "group", groupId: 99 });
  });

  it("bucket + projectId filter wins over the env fallback and never silently becomes a group", () => {
    const scope = deriveRagContentScope(
      entity({ bucketId: 28454, projectIdsJson: JSON.stringify(["proj_sundance"]), groupId: null }),
      77,
    );
    expect(scope?.type).toBe("bucket");
  });

  // B1 inc. 3 — the retired `{kind:"unknown"}` variant is now an explicit
  // `null` (no fake scope shape). searchGroundX handles null as the doc-wide
  // fallback. Lock the null contract so the behavior-preserving migration
  // can't silently regress to a truthy fallback.
  it("no entity + no fallback bucket → null (not a fake 'unknown' variant)", () => {
    expect(deriveRagContentScope(null, null)).toBeNull();
    expect(deriveRagContentScope(undefined, null)).toBeNull();
  });

  it("an entity with no scope refs + no fallback bucket → null", () => {
    expect(deriveRagContentScope(entity({}), null)).toBeNull();
  });
});
