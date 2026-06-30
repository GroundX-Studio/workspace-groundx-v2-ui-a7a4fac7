import { describe, expect, it } from "vitest";

import {
  compileScopeFilter,
  contentScopeSchema,
  type ContentScope,
  type ScopeFilter,
} from "@groundx/shared";

/**
 * Unified `ContentScope` contract (B1 increment 3). One scope type across the
 * app↔middleware boundary, discriminated on `type`, with a **composable
 * `filter`** optional on every shape (bucket / group / documents). `filter`
 * reuses the GroundX search filter-field mechanism (project / portfolio / fund
 * / folder filter-fields). No mandatory filter, no forbidden shape.
 *
 * `compileScopeFilter` is the single place a `ScopeFilter` becomes a GroundX
 * search `filter` object: a single value → `{field: v}`, multiple → `{field:
 * {$in: [...]}}`, multiple fields → `$and` of each. This must match the legacy
 * `projectIds` compilation exactly (projectIds folded into `filter.projectId`).
 */
describe("ContentScope — unified shared contract", () => {
  it("accepts all three shapes with no filter", () => {
    const shapes: ContentScope[] = [
      { type: "bucket", bucketId: 42 },
      { type: "group", groupId: 99 },
      { type: "documents", documentIds: ["d1", "d2"] },
    ];
    for (const s of shapes) {
      expect(contentScopeSchema.safeParse(s).success).toBe(true);
    }
  });

  it("accepts a composable `filter` on every shape", () => {
    const filtered: ContentScope[] = [
      { type: "bucket", bucketId: 42, filter: { projectId: "p1" } },
      { type: "group", groupId: 99, filter: { tenant: "t-7" } },
      { type: "documents", documentIds: ["d1"], filter: { region: ["us", "eu"] } },
    ];
    for (const s of filtered) {
      expect(contentScopeSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects the retired `kind` discriminant and the `unknown` variant", () => {
    expect(contentScopeSchema.safeParse({ kind: "bucket", bucketId: 42 }).success).toBe(false);
    expect(contentScopeSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });
});

describe("compileScopeFilter", () => {
  it("undefined / empty → null (no filter)", () => {
    expect(compileScopeFilter(undefined)).toBeNull();
    expect(compileScopeFilter({})).toBeNull();
    expect(compileScopeFilter({ projectId: [] })).toBeNull();
  });

  it("single value (scalar) → {field: v}", () => {
    expect(compileScopeFilter({ projectId: "proj-A" })).toEqual({ projectId: "proj-A" });
  });

  it("single-element array → {field: v} (matches legacy projectIds single-id)", () => {
    expect(compileScopeFilter({ projectId: ["proj-A"] })).toEqual({ projectId: "proj-A" });
  });

  it("multi-element array → {field: {$in: [...]}} (matches legacy projectIds $in)", () => {
    expect(compileScopeFilter({ projectId: ["A", "B", "C"] })).toEqual({
      projectId: { $in: ["A", "B", "C"] },
    });
  });

  it("multiple fields → $and of each clause", () => {
    const filter: ScopeFilter = { projectId: ["A", "B"], fund: "f3" };
    expect(compileScopeFilter(filter)).toEqual({
      $and: [{ projectId: { $in: ["A", "B"] } }, { fund: "f3" }],
    });
  });
});
