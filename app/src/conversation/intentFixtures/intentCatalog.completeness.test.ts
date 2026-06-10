import { describe, expect, it } from "vitest";

import { canvasIntentSchema } from "@groundx/shared";
import { intentCatalog } from "@groundx/shared/intent-catalog";

import { intentFixtures } from "./fixtures";

/**
 * Completeness guard — the spine of the intent-coverage change.
 *
 * Derives the kind list from `canvasIntentSchema` at RUNTIME (never a
 * hand-maintained copy), so a newly added intent kind cannot ship green without
 * (a) a catalog entry and (b) an FE replay fixture.
 */
const schemaKinds = canvasIntentSchema.options
  .map((option) => option.shape.kind.value as string)
  .sort();

describe("intent catalog completeness", () => {
  it("every canvasIntentSchema kind has a catalog entry (and vice-versa)", () => {
    const catalogKinds = intentCatalog.map((entry) => entry.kind).sort();
    expect(catalogKinds).toEqual(schemaKinds);
  });

  it("every catalog entry has an FE replay fixture", () => {
    const fixtureKinds = new Set(intentFixtures.map((fixture) => fixture.kind));
    const missing = intentCatalog.map((entry) => entry.kind).filter((kind) => !fixtureKinds.has(kind));
    // RED until T3 fans out fixtures to all 30 kinds (T2 ships highlightCitation only).
    expect(missing).toEqual([]);
  });
});
