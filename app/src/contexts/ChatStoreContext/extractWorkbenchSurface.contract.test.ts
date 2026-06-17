import { describe, expect, it } from "vitest";

import type { ViewerStep } from "./types";

/**
 * standardized-viewer-control T2 (R7, steady-first) — the `extract-workbench`
 * ViewerStep carries an optional `surface: "fields" | "design"` sub-position,
 * MIRRORING the `report` step's `surface: "render" | "builder"` (NOT a new
 * `mode` field — Extract/Report share the meta-pattern and `mode` is already
 * the widget-contract prop name).
 *
 * This makes the schema DESIGN surface (old frame f3a) an experience-agnostic
 * sub-position reachable for AUTHENTICATED users (a production bug today —
 * `editSchema` only no-ops via `advanceFrame("f3a")`). The carrier lands here;
 * the real `editSchema` outcome that pushes/mutates `surface:"design"` is T5,
 * and `Extract.isDesignSurface` re-sources off this prop in T6.
 *
 * The real assertions are the compile-time type narrowings below; the runtime
 * `it` keeps vitest happy and documents the invariant.
 */
type ExtractWorkbenchStep = Extract<ViewerStep, { kind: "extract-workbench" }>;
type Surface = NonNullable<ExtractWorkbenchStep["surface"]>;

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
// `surface` is exactly the two-valued union, mirroring report's render|builder.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertSurfaceUnion = Assert<Eq<Surface, "fields" | "design">>;

describe("extract-workbench.surface sub-position (T2 carrier)", () => {
  it("accepts surface omitted, 'fields', or 'design' on the extract-workbench step", () => {
    const noSurface: ExtractWorkbenchStep = { kind: "extract-workbench", scenarioId: "utility" };
    const fields: ExtractWorkbenchStep = { kind: "extract-workbench", scenarioId: "utility", surface: "fields" };
    const design: ExtractWorkbenchStep = { kind: "extract-workbench", scenarioId: "utility", surface: "design" };

    expect(noSurface.surface).toBeUndefined();
    expect(fields.surface).toBe("fields");
    expect(design.surface).toBe("design");
  });
});
