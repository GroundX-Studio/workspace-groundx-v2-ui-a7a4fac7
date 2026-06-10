import { describe, expect, it } from "vitest";

import type { ViewerStepKind } from "@groundx/shared";
import type { ViewerStep } from "./types";

/**
 * `ViewerStepKind` single-source guard. The middleware `toolCatalog.ts` used to
 * HAND-MIRROR the app's `ViewerStep["kind"]` ("to avoid a cross-workspace
 * import"). Now both sides import one `ViewerStepKind` from `@groundx/shared`.
 *
 * This is a COMPILE-TIME exact-equality assertion between the app's
 * payload-bearing `ViewerStep` discriminated union and the shared kind enum: if
 * someone adds/removes a `ViewerStep` arm without updating the shared enum (or
 * vice versa), `_assertExactlyEqual` fails to compile. Keeps the kind set
 * single-sourced even though the app union carries per-kind payloads.
 */
type AppViewerStepKind = ViewerStep["kind"];
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
 
type _assertExactlyEqual = Assert<Eq<AppViewerStepKind, ViewerStepKind>>;

describe("ViewerStepKind — single source (@groundx/shared)", () => {
  it("the app ViewerStep['kind'] set exactly equals the shared ViewerStepKind", () => {
    // The real assertion is the compile-time `_assertExactlyEqual` above; this
    // keeps vitest happy and documents the invariant at runtime.
    const kinds: ViewerStepKind[] = [
      "ingest-picker",
      "doc-viewer",
      "extract-workbench",
      "interact-chat",
      "report",
      "integrate",
    ];
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
