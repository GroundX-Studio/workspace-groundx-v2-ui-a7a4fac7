import { describe, expect, it } from "vitest";

import { parseCanvasIntent, canvasIntentSchema, offerAsSchema } from "@groundx/shared";

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

  it("round-trips showInteract (scope-only, mirroring showIntegrate)", () => {
    // standardized-viewer-control T2 — the new `showInteract` kind carries only
    // a `scope` (same shape as `showIntegrate`); the orchestrator resolves the
    // document for the interact-chat canvas from that scope (T5).
    const showInteract = { kind: "showInteract", scope: { type: "bucket", bucketId: 28454 } };
    expect(parseCanvasIntent(showInteract)).toEqual(showInteract);
    // A `showInteract` missing its required `scope` must coerce to null.
    expect(parseCanvasIntent({ kind: "showInteract" })).toBeNull();
  });

  it("round-trips presentExperienceBeat (the generic, llm:false overlay-internal viewer beat)", () => {
    // standardized-viewer-control deletion-phase — ONE generic, NOT-LLM-emittable
    // intent for experience/overlay-internal scripted viewer beats (the MECHANISM);
    // the typed, extensible `beat` discriminator is the VALUES, so future overlay
    // scenarios add a beat variant rather than a new intent kind.
    const ingestPickerBeat = { kind: "presentExperienceBeat", beat: { kind: "ingest-picker" } };
    expect(parseCanvasIntent(ingestPickerBeat)).toEqual(ingestPickerBeat);
    const ingestPickerWithSchema = {
      kind: "presentExperienceBeat",
      beat: { kind: "ingest-picker", attachedSchema: { schemaId: "tmpl-1", name: "Utility (custom)" } },
    };
    expect(parseCanvasIntent(ingestPickerWithSchema)).toEqual(ingestPickerWithSchema);
    const scanningBeat = { kind: "presentExperienceBeat", beat: { kind: "understand-scanning" } };
    expect(parseCanvasIntent(scanningBeat)).toEqual(scanningBeat);
    // A bogus beat variant must coerce to null (the beat is a closed discriminated set).
    expect(parseCanvasIntent({ kind: "presentExperienceBeat", beat: { kind: "not-a-beat" } })).toBeNull();
    // The `beat` field is required.
    expect(parseCanvasIntent({ kind: "presentExperienceBeat" })).toBeNull();
  });

  it("the schema is the intent discriminator — distinct from the surface-kind enum", () => {
    // `canvasIntentSchema` discriminates on `kind` across intent variants.
    expect(canvasIntentSchema.safeParse({ kind: "wizardNext" }).success).toBe(true);
    // A canvas SURFACE kind value ("doc-viewer") is NOT a valid intent kind —
    // proves the two contracts do not collide.
    expect(canvasIntentSchema.safeParse({ kind: "doc-viewer" }).success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// standardized-viewer-control T2 — `offerAsSchema` is the ONE shared Zod
// constant for the navigation tools' optional `offerAs` disposition. Declared
// ONCE here so the app `*.tools.ts` and the middleware `toolCatalog.ts` import
// the IDENTICAL shape (the full-shape JSON-Schema parity holds by
// construction; the per-tool wiring + routing-to-`suggestedActions` is T7).
// ────────────────────────────────────────────────────────────────────
describe("offerAsSchema (shared navigation-tool offer disposition)", () => {
  it("requires `label`, allows an optional `anchor`", () => {
    expect(offerAsSchema.safeParse({ label: "→ edit this schema" }).success).toBe(true);
    expect(
      offerAsSchema.safeParse({ label: "→ open the report", anchor: "the report" }).success,
    ).toBe(true);
    // `label` is required.
    expect(offerAsSchema.safeParse({ anchor: "x" }).success).toBe(false);
    expect(offerAsSchema.safeParse({}).success).toBe(false);
  });
});
