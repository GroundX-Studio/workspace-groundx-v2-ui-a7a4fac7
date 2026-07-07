import { describe, expect, it } from "vitest";

import type { Workflow } from "@/api/entities/sdkTypes";

import {
  confidenceBucket,
  entriesToFieldValues,
  humanizeFieldId,
  mapFieldType,
  workflowToSchema,
} from "./extractLiveData";
import type { GroundXWorkflowDefinition } from "./extractLiveData";

/**
 * Item-1 typed-boundary guard (2026-06-01-data-model-tail).
 *
 * `workflowToSchema` must take a NAMED GroundX-workflow shape, not
 * `Record<string, unknown>` — and the GroundX SDK `Workflow` (what
 * `getGroundXWorkflow(...).workflow` actually is) must be assignable to that
 * parameter WITHOUT the old `as unknown as Record<string, unknown>` double-cast
 * at `Extract.tsx`. These compile-time asserts are the real RED→GREEN guard
 * under `tsc --noEmit` / `npm run build`; the runtime block below documents the
 * defensive branches still fire for a typed-but-malformed workflow.
 */
type Assert<T extends true> = T;
// `Workflow` (SDK) must flow into the parameter type with no cast.
type _assertSdkWorkflowAssignable = Assert<
  Workflow extends GroundXWorkflowDefinition ? true : false
>;
// The named type must NOT be a `Record<string, unknown>` alias in disguise:
// a bare empty object is NOT a valid `Record<string, unknown>` index? — instead
// prove the type carries the named optional `extract` field the transform reads.
type _assertNamedShape = Assert<
  GroundXWorkflowDefinition extends { extract?: unknown } ? true : false
>;

// Shapes mirror the REAL live workflow (9910308e) + getDocumentExtract
// responses for c3bfff49 (verified 2026-05-29 — MCP == middleware): field
// ids are `addressee`/`balance_payable`/`payment_deadline`/`usage_amount`/
// `line_amount`, NOT `amount_due`/`recipient_name` (that was a stale
// tool-result artifact — see gotchas.md).
const workflow = {
  workflowId: "wf-1",
  name: "Utility Bill",
  extract: {
    statement: {
      fields: {
        balance_payable: { prompt: { description: "the numeric amount the customer owes", type: ["int", "float"], identifiers: ["Amount Due"] } },
        payment_deadline: { prompt: { description: "the date payment is due", type: "date", instructions: "- ISO 8601\n- on the stub" } },
        addressee: { prompt: { description: "the recipient name", type: "str" } },
      },
    },
    meters: {
      prompt: { instructions: "meter-detection rules" },
      fields: { usage_amount: { prompt: { description: "metered usage", type: ["int", "float"] } } },
    },
    charges: {
      prompt: { instructions: "charge-detection rules" },
      fields: { line_amount: { prompt: { description: "charge amount", type: ["int", "float"] } } },
    },
  },
};

describe("workflowToSchema (WF-12)", () => {
  it("builds categories in statement→meters→charges order with the group types", () => {
    const schema = workflowToSchema(workflow)!;
    expect(schema).not.toBeNull();
    expect(schema.id).toBe("wf-1");
    expect(schema.name).toBe("Utility Bill");
    expect(schema.categories.map((c) => c.type)).toEqual(["statement", "meters", "charges"]);
  });

  it("emits label defs for an ARBITRARY-named group (anti-hardcode: not just statement/meters/charges)", () => {
    // analyze-and-chat-ux §1.2 — the schema is a label dictionary joined to the
    // output BY NAME; group NAMES are not a fixed allow-list. A loan/solar/any
    // workflow with a group ∉ {statement,meters,charges} must still yield its
    // field defs so the output-first render can label those fields.
    const arbitrary: GroundXWorkflowDefinition = {
      workflowId: "wf-arb",
      name: "Arbitrary",
      extract: {
        assets: {
          fields: {
            serial_number: { prompt: { description: "the asset serial", type: "str" } },
          },
        },
      },
    };
    const schema = workflowToSchema(arbitrary)!;
    expect(schema).not.toBeNull();
    const assets = schema.categories.find((c) => c.id === "assets");
    expect(assets, "arbitrary group 'assets' must survive").toBeDefined();
    expect(assets!.fields.map((f) => f.id)).toContain("serial_number");
    expect(assets!.name).toBe("Assets");
  });

  it("maps a field's prompt → SchemaFieldDef (name, type, description, identifiers, instructions)", () => {
    const schema = workflowToSchema(workflow)!;
    const statement = schema.categories.find((c) => c.type === "statement")!;
    const amount = statement.fields.find((f) => f.id === "balance_payable")!;
    expect(amount.name).toBe("Balance payable");
    expect(amount.type).toBe("NUMBER");
    expect(amount.description).toBe("the numeric amount the customer owes");
    expect(amount.identifiers).toEqual(["Amount Due"]);
    const due = statement.fields.find((f) => f.id === "payment_deadline")!;
    expect(due.type).toBe("DATE");
    expect(due.instructions).toEqual(["ISO 8601", "on the stub"]);
  });

  it("returns null when there is no extract block", () => {
    expect(workflowToSchema({ workflowId: "x" })).toBeNull();
    expect(workflowToSchema(null)).toBeNull();
  });

  it("accepts a typed GroundX SDK Workflow with no cast and returns its schema", () => {
    // `wf.workflow` from `getGroundXWorkflow` is typed as the SDK `Workflow`.
    // Passing it directly (no `as unknown as`) must type-check AND behave.
    const sdkWorkflow: Workflow = {
      workflowId: "wf-typed",
      name: "Typed Utility",
      extract: {
        statement: { fields: { addressee: { prompt: { description: "name", type: "str" } } } },
      },
    };
    const schema = workflowToSchema(sdkWorkflow)!;
    expect(schema.id).toBe("wf-typed");
    expect(schema.categories.map((c) => c.type)).toEqual(["statement"]);
  });

  it("handles a typed-but-malformed workflow (extract present, no usable groups) → null", () => {
    // `extract` is the loose `Metadata` leaf at runtime — a garbage group must
    // still fall through the defensive guards to `null`, not throw.
    const malformed: GroundXWorkflowDefinition = {
      workflowId: "wf-bad",
      extract: { statement: 42, meters: "nope", charges: null } as unknown as Record<string, unknown>,
    };
    expect(workflowToSchema(malformed)).toBeNull();
  });
});

describe("mapFieldType / humanizeFieldId", () => {
  it("maps types", () => {
    expect(mapFieldType("str")).toBe("STRING");
    expect(mapFieldType(["int", "float"])).toBe("NUMBER");
    expect(mapFieldType("date")).toBe("DATE");
    expect(mapFieldType("bool")).toBe("BOOLEAN");
    expect(mapFieldType(undefined)).toBe("STRING");
  });
  it("humanizes ids", () => {
    expect(humanizeFieldId("amount_due")).toBe("Amount due");
    expect(humanizeFieldId("meter_kwh")).toBe("Meter kwh");
  });
});

// (analyze-and-chat-ux §2.3 — `extractToValues`/`extractToConfidences` are
// REPLACED by the output-first `extractToInstances` walk; its structural,
// dict-unwrap, and confidence coverage lives in `extractInstances.test.ts`.)

describe("confidenceBucket (0–1 → Low/Medium/High)", () => {
  it("High at ≥ 0.8", () => {
    expect(confidenceBucket(0.94)).toBe("High");
    expect(confidenceBucket(0.8)).toBe("High");
  });
  it("Medium in [0.5, 0.8)", () => {
    expect(confidenceBucket(0.79)).toBe("Medium");
    expect(confidenceBucket(0.5)).toBe("Medium");
  });
  it("Low below 0.5 (incl. 0)", () => {
    expect(confidenceBucket(0.49)).toBe("Low");
    expect(confidenceBucket(0)).toBe("Low");
  });
});

describe("entriesToFieldValues — first-instance samples for the design surface (§2.3)", () => {
  const entries = [
    { path: "balance_payable", fieldId: "balance_payable", value: 7613.2, confidence: 0.94 },
    { path: "addressee", fieldId: "addressee", value: "KWIK TRIP (1147)" },
    { path: "meters/0/usage_amount", fieldId: "usage_amount", value: 60960 },
    { path: "meters/1/usage_amount", fieldId: "usage_amount", value: 900 },
  ];

  it("keeps the FIRST instance per fieldId and attaches confidence only when present", () => {
    const values = entriesToFieldValues("doc-1", entries, new Map());
    const byId = new Map(values.map((v) => [v.fieldId, v]));
    expect(byId.get("usage_amount")!.value).toBe(60960); // first instance wins
    expect(values.filter((v) => v.fieldId === "usage_amount")).toHaveLength(1);
    expect(byId.get("balance_payable")!.confidence).toBe(0.94);
    expect("confidence" in byId.get("addressee")!).toBe(false);
  });

  it("attaches the entry's OWN instance regions as one multi-region citation", () => {
    const geometry = new Map([
      ["meters/0/usage_amount", [{ page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 } }]],
    ]);
    const values = entriesToFieldValues("doc-1", entries, geometry);
    const usage = values.find((v) => v.fieldId === "usage_amount")!;
    expect(usage.citations).toHaveLength(1);
    expect(usage.citations[0].page).toBe(2);
    const noGeo = values.find((v) => v.fieldId === "addressee")!;
    expect(noGeo.citations).toEqual([]);
  });
});
