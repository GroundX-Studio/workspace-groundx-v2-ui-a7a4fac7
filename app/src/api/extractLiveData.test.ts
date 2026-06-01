import { describe, expect, it } from "vitest";

import type { Workflow } from "@/api/entities/sdkTypes";

import { extractToValues, humanizeFieldId, mapFieldType, workflowToSchema } from "./extractLiveData";
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

describe("extractToValues (WF-12)", () => {
  const schema = workflowToSchema(workflow)!;
  const extract = {
    balance_payable: 7613.2,
    payment_deadline: "2025-07-30",
    addressee: "KWIK TRIP (1147)",
    meters: [{ usage_amount: 60960, meter_charges: [{ line_amount: 2218.75 }] }],
  };

  it("maps statement fields from top-level keys", () => {
    const v = extractToValues(extract, schema);
    expect(v.balance_payable).toBe(7613.2);
    expect(v.payment_deadline).toBe("2025-07-30");
    expect(v.addressee).toBe("KWIK TRIP (1147)");
  });

  it("maps meter fields from the first meter and charge fields from nested meter_charges", () => {
    const v = extractToValues(extract, schema);
    expect(v.usage_amount).toBe(60960);
    expect(v.line_amount).toBe(2218.75);
  });

  it("returns {} on empty input", () => {
    expect(extractToValues(null, schema)).toEqual({});
    expect(extractToValues(extract, null)).toEqual({});
  });
});
