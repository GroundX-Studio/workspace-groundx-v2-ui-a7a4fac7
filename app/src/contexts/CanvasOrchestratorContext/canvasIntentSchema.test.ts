import { describe, expect, it } from "vitest";

import { parseCanvasIntent, canvasIntentSchema } from "@groundx/shared";

// ────────────────────────────────────────────────────────────────────
// 2026-05-31-canvas-intent-schema-shared §1 — the ONE shared CanvasIntent
// schema. `parseCanvasIntent` is the safe-parse boundary helper (mirrors
// `parseCitations` / `parseTemplate`): a malformed/legacy persisted intent
// coerces to `null` rather than masquerading as a typed intent. The same
// schema is the single source of truth the app `CanvasIntent` type derives
// from and that BOTH read boundaries (app hydration + middleware row mapper)
// validate against.
//
// `canvasKindSchema` (the canvas SURFACE kind) is DISTINCT from this intent
// discriminator and is asserted to remain a separate export.
// ────────────────────────────────────────────────────────────────────

describe("parseCanvasIntent (shared §1)", () => {
  it("parses a well-formed intent and round-trips equal", () => {
    const intent = { kind: "openDocument", documentId: "util-1", page: 2 };
    const parsed = parseCanvasIntent(intent);
    expect(parsed).toEqual(intent);
  });

  it("coerces a malformed variant (real `kind`, missing required field) to null", () => {
    // `openDocument` requires `documentId`; the OLD structural guard accepts
    // this (non-empty string `kind`) but the schema must reject it.
    expect(parseCanvasIntent({ kind: "openDocument" })).toBeNull();
  });

  it("coerces a bogus `kind` (not a real discriminant) to null", () => {
    expect(parseCanvasIntent({ kind: "notARealKind" })).toBeNull();
  });

  it("coerces a primitive / array / empty object to null", () => {
    expect(parseCanvasIntent(42)).toBeNull();
    expect(parseCanvasIntent("openDocument")).toBeNull();
    expect(parseCanvasIntent(null)).toBeNull();
    expect(parseCanvasIntent([{ kind: "openDocument", documentId: "x" }])).toBeNull();
    expect(parseCanvasIntent({})).toBeNull();
  });

  it("parses a no-payload variant (closeDialog) and a nested-scope variant (showExtract)", () => {
    expect(parseCanvasIntent({ kind: "closeDialog" })).toEqual({ kind: "closeDialog" });
    const showExtract = {
      kind: "showExtract",
      scope: { type: "bucket", bucketId: 28454 },
      schemaId: "s-1",
    };
    expect(parseCanvasIntent(showExtract)).toEqual(showExtract);
  });

  it("the schema is the intent discriminator — distinct from the surface-kind enum", () => {
    // `canvasIntentSchema` discriminates on `kind` across intent variants.
    expect(canvasIntentSchema.safeParse({ kind: "wizardNext" }).success).toBe(true);
    // A canvas SURFACE kind value ("doc-viewer") is NOT a valid intent kind —
    // proves the two contracts do not collide.
    expect(canvasIntentSchema.safeParse({ kind: "doc-viewer" }).success).toBe(false);
  });
});
