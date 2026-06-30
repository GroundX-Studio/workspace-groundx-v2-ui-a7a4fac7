import { describe, expect, it } from "vitest";

import {
  extractBodySchema,
  parseTemplate,
  templateSchema,
  templateSaveInputSchema,
  type Template,
  type TemplateSaveInput,
} from "@groundx/shared";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { TemplateRecord } from "../types.js";

/**
 * Shared Template contract (shared-template-lifecycle Phase 1). One Template
 * type across the app↔middleware boundary, discriminated on `kind`
 * (`extract` | `report`), with the wire shape + `parseTemplate` sanitizer in
 * `@groundx/shared` (schema-as-source-of-truth, like `Citation`/`ContentScope`).
 *
 * Key invariants:
 *  - The legacy persisted extract blob `{id,name,categories}` parses (the body
 *    is `.passthrough()`), so the verbatim copy-migration is sound.
 *  - A new field prop parses (addition-tolerant → no server-coupling on
 *    frontend field-shape additions).
 *  - `TemplateSaveInput` carries NO `ownerUsername`/timestamps; an injected
 *    owner is stripped on parse (🔒 ownership is server-assigned, never trusted).
 */

const validExtract: Template = {
  id: "es-1",
  kind: "extract",
  name: "Utility",
  ownerUsername: "user-a",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
  body: {
    categories: [
      {
        id: "statement",
        name: "Statement",
        type: "statement",
        fields: [{ id: "amount_due", name: "Amount Due", type: "NUMBER", description: "Total due" }],
      },
    ],
  },
};

describe("Template — shared contract", () => {
  it("parses a valid extract-kind Template", () => {
    expect(templateSchema.safeParse(validExtract).success).toBe(true);
  });

  it("parses a valid report-kind Template (sections reserved arm)", () => {
    const report = {
      ...validExtract,
      kind: "report" as const,
      body: { sections: [{ name: "summary", question: "Summarize the bill." }] },
    };
    expect(templateSchema.safeParse(report).success).toBe(true);
  });

  it("parses the LEGACY extract blob — redundant body {id,name} + an unknown field prop (passthrough)", () => {
    const legacy = {
      ...validExtract,
      body: {
        // legacy schema_json carried id+name at the body level (redundant with the row)
        id: "es-1",
        name: "Utility",
        categories: [
          {
            id: "statement",
            name: "Statement",
            type: "statement",
            fields: [
              {
                id: "amount_due",
                name: "Amount Due",
                type: "NUMBER",
                description: "Total due",
                identifiers: ["Amount Due", "Acct #"],
                futureProp: "tolerated", // a not-yet-modeled field prop must NOT fail
              },
            ],
          },
        ],
      },
    };
    expect(templateSchema.safeParse(legacy).success).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(parseTemplate(null)).toBeNull();
    expect(parseTemplate("nope")).toBeNull();
    expect(parseTemplate({ ...validExtract, kind: "bogus" })).toBeNull();
    expect(parseTemplate({ ...validExtract, kind: undefined })).toBeNull();
    expect(parseTemplate({ ...validExtract, name: 123 })).toBeNull();
  });

  it("parseTemplate returns the typed, kind-narrowed object on valid input", () => {
    const t = parseTemplate(validExtract);
    expect(t).not.toBeNull();
    if (t && t.kind === "extract") {
      expect(t.body.categories[0].fields[0].name).toBe("Amount Due");
    }
  });

  // Parse the ACTUAL persisted body shape, not an invented one. This is the
  // real `app/src/test/scenarioFixtures.ts` Utility extractionSchema (which IS
  // the legacy `schema_json` / migrated `body_json`): `{id,name,categories}`
  // with the redundant body-level id/name. Locks the copy-migration soundness
  // against real data.
  it("accepts the REAL Utility extractionSchema as an extract body", () => {
    const realUtilityBody = {
      id: "utility-schema-v1",
      name: "Utility Bill",
      categories: [
        {
          id: "statement",
          type: "statement",
          name: "Statement",
          fields: [
            { id: "account_number", name: "Account number", type: "STRING", description: "The account number printed in the statement header." },
            { id: "amount_due", name: "Amount due", type: "NUMBER", description: "Total amount due across all meters and charges, USD." },
          ],
        },
        {
          id: "meters",
          type: "meters",
          name: "Meters",
          fields: [
            { id: "meter_kwh", name: "kWh consumed", type: "NUMBER", description: "kWh consumed by the meter during the billing period." },
          ],
        },
      ],
    };
    expect(extractBodySchema.safeParse(realUtilityBody).success).toBe(true);
    expect(parseTemplate({ ...validExtract, body: realUtilityBody })).not.toBeNull();
  });

  // The LIVE GroundX-workflow→schema path (`extractLiveData.fieldFromPrompt`)
  // defaults an absent `description` to "" — an empty string must be accepted,
  // else live-derived templates would be rejected at the boundary.
  it("accepts a field with an empty-string description (live-path default)", () => {
    const body = {
      categories: [{ id: "g", type: "statement", name: "G", fields: [{ id: "f", name: "F", type: "STRING", description: "" }] }],
    };
    expect(extractBodySchema.safeParse(body).success).toBe(true);
  });

  // Body validation is REAL, not just envelope — these must be rejected.
  it("rejects a malformed extract body", () => {
    expect(parseTemplate({ ...validExtract, body: { categories: "not-an-array" } })).toBeNull();
    expect(parseTemplate({ ...validExtract, body: {} })).toBeNull(); // categories required
    // a field missing the required `description`
    expect(
      parseTemplate({
        ...validExtract,
        body: { categories: [{ id: "g", type: "statement", name: "G", fields: [{ id: "f", name: "F", type: "STRING" }] }] },
      }),
    ).toBeNull();
    // a field with an out-of-enum type
    expect(
      parseTemplate({
        ...validExtract,
        body: { categories: [{ id: "g", type: "statement", name: "G", fields: [{ id: "f", name: "F", type: "FLOAT", description: "x" }] }] },
      }),
    ).toBeNull();
  });
});

describe("TemplateSaveInput — client wire shape (no owner/timestamps)", () => {
  it("accepts {id,kind,name,body}", () => {
    const input: TemplateSaveInput = {
      id: "es-1",
      kind: "extract",
      name: "Utility",
      body: validExtract.body,
    };
    expect(templateSaveInputSchema.safeParse(input).success).toBe(true);
  });

  it("🔒 strips an injected ownerUsername / timestamps (server assigns them)", () => {
    const parsed = templateSaveInputSchema.parse({
      id: "es-1",
      kind: "extract",
      name: "Utility",
      body: validExtract.body,
      ownerUsername: "attacker", // must NOT survive
      createdAt: "1999-01-01T00:00:00.000Z",
    });
    expect("ownerUsername" in parsed).toBe(false);
    expect("createdAt" in parsed).toBe(false);
  });
});

/**
 * shared-template-lifecycle Phase 5 — proof of the READ half of the lifecycle,
 * the foundation API smart-report's report-render consumes: a row → a full
 * validated `Template`. Exercises `saveTemplate` → `getTemplate` → assemble →
 * `parseTemplate` for BOTH kinds, so no Extract-specific assumption leaked and
 * the `getTemplate`/`parseTemplate` API is test-proven (not just defined).
 */
describe("Template lifecycle — read half (saveTemplate → getTemplate → parseTemplate)", () => {
  /** Assemble a wire `Template` from a stored row, exactly as a read route would. */
  function rowToFullTemplate(rec: TemplateRecord): unknown {
    return {
      id: rec.id,
      kind: rec.kind,
      name: rec.name,
      ownerUsername: rec.groundxUsername,
      createdAt: rec.createdAt.toISOString(),
      updatedAt: rec.updatedAt.toISOString(),
      body: JSON.parse(rec.bodyJson),
    };
  }

  it("round-trips an EXTRACT template through persistence + parseTemplate", async () => {
    const repo = new MemoryAppRepository();
    await repo.saveTemplate({
      id: "es-1",
      kind: "extract",
      groundxUsername: "user-a",
      name: "Utility",
      bodyJson: JSON.stringify({ categories: [{ id: "s", type: "statement", name: "S", fields: [{ id: "amount_due", name: "Amount due", type: "NUMBER", description: "d" }] }] }),
      createdAt: new Date(1),
      updatedAt: new Date(2),
    });
    const rec = await repo.getTemplate("es-1");
    expect(rec).not.toBeNull();
    const template = parseTemplate(rowToFullTemplate(rec!));
    expect(template).not.toBeNull();
    expect(template!.kind).toBe("extract");
    expect(template!.ownerUsername).toBe("user-a");
    if (template!.kind === "extract") {
      expect(template!.body.categories[0].fields[0].name).toBe("Amount due");
    }
  });

  it("round-trips a REPORT template — proves no Extract-specific assumption leaked", async () => {
    const repo = new MemoryAppRepository();
    await repo.saveTemplate({
      id: "rpt-1",
      kind: "report",
      groundxUsername: "user-a",
      name: "Billing summary",
      bodyJson: JSON.stringify({ sections: [{ name: "summary", question: "Summarize the bill." }] }),
      createdAt: new Date(1),
      updatedAt: new Date(2),
    });
    const rec = await repo.getTemplate("rpt-1");
    expect(rec?.kind).toBe("report");
    const template = parseTemplate(rowToFullTemplate(rec!));
    expect(template).not.toBeNull();
    expect(template!.kind).toBe("report");
  });
});
