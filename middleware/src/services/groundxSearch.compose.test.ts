/**
 * 2026-06-02-onboarding-review-bugfixes #7 — key-valid filter composition.
 *
 * The RBAC filter (`{projectId:{$in:[…]}}`) and the scope filter
 * (`compileScopeFilter`, single value → `{projectId:"…"}`) must NOT be naively
 * `$and`-ed: GroundX 400s with "cannot query more than 1 data type per key" when
 * a key carries two clauses of different shapes. `composeFilters` must INTERSECT
 * shared keys into ONE clause.
 */
import { describe, expect, it } from "vitest";

import { composeFilters } from "./groundxSearch.js";

describe("composeFilters — key-aware merge (#7)", () => {
  it("intersects a shared projectId key into a single clause (no $and on one key)", () => {
    const out = composeFilters({ projectId: { $in: ["p1", "p2"] } }, { projectId: "p1" });
    expect(out).toEqual({ projectId: "p1" });
  });

  it("intersects two $in sets into a single $in (or scalar when one survives)", () => {
    expect(composeFilters({ projectId: { $in: ["p1", "p2"] } }, { projectId: { $in: ["p2", "p3"] } })).toEqual({
      projectId: "p2",
    });
    expect(composeFilters({ projectId: { $in: ["p1", "p2", "p3"] } }, { projectId: { $in: ["p2", "p3"] } })).toEqual({
      projectId: { $in: ["p2", "p3"] },
    });
  });

  it("denies all when the intersection is empty (never an invalid two-type filter)", () => {
    expect(composeFilters({ projectId: { $in: ["p1"] } }, { projectId: "p2" })).toEqual({
      projectId: { $in: [] },
    });
  });

  it("keeps distinct keys as separate single-key clauses (no key repeated)", () => {
    const out = composeFilters({ projectId: { $in: ["p1"] } }, { workflow_id: "w1" }) as Record<string, unknown>;
    // distinct keys → $and of one clause each; each key appears exactly once.
    // A single-element set normalizes to scalar equality (`{$in:[x]}` ≡ `x`).
    expect(out).toEqual({ $and: [{ projectId: "p1" }, { workflow_id: "w1" }] });
  });

  it("flattens a single-field scope $and and still intersects the shared key", () => {
    // compileScopeFilter emits {$and:[…]} only for multi-field; a nested shared
    // key must still merge, not double up.
    const out = composeFilters({ projectId: { $in: ["p1", "p2"] } }, { $and: [{ projectId: "p2" }] });
    expect(out).toEqual({ projectId: "p2" });
  });

  it("passes through when only one side is present", () => {
    expect(composeFilters(null, { projectId: "p1" })).toEqual({ projectId: "p1" });
    expect(composeFilters({ projectId: { $in: ["p1"] } }, null)).toEqual({ projectId: { $in: ["p1"] } });
    expect(composeFilters(null, null)).toBeNull();
  });
});
