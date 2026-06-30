import { describe, expect, it } from "vitest";

import { assertUniqueIds, type Catalog } from "@groundx/shared";

/**
 * Shared `Catalog<T>` read contract + `assertUniqueIds` unique-id invariant
 * (registry/catalog-consistency Phase 1). `Catalog<T>` is the read API every
 * data catalog satisfies (`all()` + `byId(id)`); `assertUniqueIds` is the ONE
 * mechanism local (static/glob) catalogs use to enforce that ids are unique at
 * build/boot — it throws naming the duplicate id, and (when a `sourceOf` is
 * supplied) also names the colliding source modules. The contract governs the
 * data-access API, not delivery/sourcing.
 */

interface Tool {
  id: string;
  module?: string;
}

describe("Catalog<T> — shared read contract", () => {
  it("compiles: a plain object satisfies Catalog<T> (all() + byId(id))", () => {
    const tools: Tool[] = [{ id: "a" }, { id: "b" }];
    const catalog: Catalog<Tool> = {
      all: () => tools,
      byId: (id) => tools.find((t) => t.id === id),
    };
    expect(catalog.all()).toEqual(tools);
    expect(catalog.byId("a")).toEqual({ id: "a" });
    expect(catalog.byId("missing")).toBeUndefined();
  });
});

describe("assertUniqueIds", () => {
  it("passes a unique list (returns without throwing)", () => {
    const items: Tool[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(() => assertUniqueIds(items, (x) => x.id)).not.toThrow();
  });

  it("throws naming the duplicate id", () => {
    const items: Tool[] = [{ id: "a" }, { id: "a" }];
    expect(() => assertUniqueIds(items, (x) => x.id)).toThrow(/a/);
  });

  it("with a sourceOf, the error ALSO names the colliding sources", () => {
    const items: Tool[] = [
      { id: "dup", module: "modules/first.ts" },
      { id: "dup", module: "modules/second.ts" },
    ];
    let message = "";
    try {
      assertUniqueIds(
        items,
        (x) => x.id,
        (x) => x.module ?? "",
      );
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("dup");
    expect(message).toContain("modules/first.ts");
    expect(message).toContain("modules/second.ts");
  });
});
