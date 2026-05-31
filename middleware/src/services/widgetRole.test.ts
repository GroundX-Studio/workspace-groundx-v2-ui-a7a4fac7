import { describe, expect, it } from "vitest";

import {
  contentScopeSchema,
  isWidgetReadOnly,
  widgetRoleCanEdit,
  widgetRoleSchema,
  widgetScopeSchema,
  type ContentScope,
  type WidgetRole,
  type WidgetScope,
} from "@groundx/shared";

/**
 * 2026-05-30-widget-role-access Phase 1 — shared role enum + lock policy +
 * widget scope union. `WidgetRole` replaces the old binary widget `mode`
 * ("onboarding"/"steady") with an authorization role; the lock policy is
 * centralized (`widgetRoleCanEdit` / `isWidgetReadOnly`) so a widget never
 * hardcodes `role === "anonymous"`. `WidgetScope` is `ContentScope | {type:
 * "none"}` — the `none` variant lives ONLY in this union, never in
 * `contentScopeSchema` (which has no "none" member).
 */

describe("widgetRoleSchema", () => {
  it("parses the two shipped roles", () => {
    expect(widgetRoleSchema.parse("anonymous")).toBe("anonymous");
    expect(widgetRoleSchema.parse("member")).toBe("member");
  });

  it("rejects junk", () => {
    expect(widgetRoleSchema.safeParse("steady").success).toBe(false);
    expect(widgetRoleSchema.safeParse("onboarding").success).toBe(false);
    expect(widgetRoleSchema.safeParse("admin").success).toBe(false);
    expect(widgetRoleSchema.safeParse("").success).toBe(false);
    expect(widgetRoleSchema.safeParse(null).success).toBe(false);
  });

  it("type compiles", () => {
    const r: WidgetRole = "member";
    expect(r).toBe("member");
  });
});

describe("widgetRoleCanEdit / isWidgetReadOnly", () => {
  it("member can edit; anonymous cannot", () => {
    expect(widgetRoleCanEdit("member")).toBe(true);
    expect(widgetRoleCanEdit("anonymous")).toBe(false);
  });

  it("isWidgetReadOnly is the negation of widgetRoleCanEdit", () => {
    for (const role of ["anonymous", "member"] as const) {
      expect(isWidgetReadOnly(role)).toBe(!widgetRoleCanEdit(role));
    }
    expect(isWidgetReadOnly("anonymous")).toBe(true);
    expect(isWidgetReadOnly("member")).toBe(false);
  });
});

describe("widgetScopeSchema", () => {
  it("parses every ContentScope shape", () => {
    const bucket: ContentScope = { type: "bucket", bucketId: 28454 };
    const group: ContentScope = { type: "group", groupId: 7 };
    const docs: ContentScope = {
      type: "documents",
      documentIds: ["c3bfff49-6640-4213-822b-e81c3a771e45"],
    };
    expect(widgetScopeSchema.parse(bucket)).toEqual(bucket);
    expect(widgetScopeSchema.parse(group)).toEqual(group);
    expect(widgetScopeSchema.parse(docs)).toEqual(docs);
    // Carries the composable filter through.
    const filtered: ContentScope = {
      type: "bucket",
      bucketId: 28454,
      filter: { project: "utility" },
    };
    expect(widgetScopeSchema.parse(filtered)).toEqual(filtered);
  });

  it('parses the { type: "none" } variant', () => {
    expect(widgetScopeSchema.parse({ type: "none" })).toEqual({ type: "none" });
  });

  it("rejects junk", () => {
    expect(widgetScopeSchema.safeParse({ type: "nope" }).success).toBe(false);
    expect(widgetScopeSchema.safeParse({ type: "bucket" }).success).toBe(false);
    expect(widgetScopeSchema.safeParse(null).success).toBe(false);
    expect(widgetScopeSchema.safeParse({}).success).toBe(false);
  });

  it('"none" lives ONLY in widgetScopeSchema, NOT in contentScopeSchema', () => {
    expect(contentScopeSchema.safeParse({ type: "none" }).success).toBe(false);
  });

  it("type compiles for both arms of the union", () => {
    const a: WidgetScope = { type: "none" };
    const b: WidgetScope = { type: "documents", documentIds: ["x"] };
    expect(a.type).toBe("none");
    expect(b.type).toBe("documents");
  });
});
