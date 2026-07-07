import { describe, it, expect } from "vitest";

import {
  extractToInstances,
  flattenInstanceFields,
  instancesToJson,
  manifestToInstances,
} from "./extractInstances";

// Fixture mirroring the LIVE utility output shape (verified 2026-07-07):
// statement scalars hoisted to root, meters[] each with nested meter_charges,
// a synthesized top-level account_charges, and a {value,confidence} dict case.
const OUTPUT = {
  bill_account_id: "10295809",
  balance_payable: 7613.2,
  addressee: "KWIK TRIP (1147)",
  // a confidence-bearing field (dict form) — exercises the shipped band rule
  utility_company: { value: "City of Windom", confidence: 0.96 },
  account_charges: [],
  meters: [
    {
      meter_id: "A12345",
      usage_amount: 1842,
      meter_charges: [
        { line_amount: 55.0, line_currency: "USD", line_label: "Electric" },
        { line_amount: 12.5, line_currency: "USD", line_label: "Franchise Fee" },
      ],
    },
    { meter_id: "B67890", usage_amount: 900, meter_charges: [] },
  ],
};

describe("extractToInstances — output-first recursive parse", () => {
  const { root } = extractToInstances(OUTPUT);

  it("hoists statement scalars to root fields", () => {
    expect(root.fields.bill_account_id.value).toBe("10295809");
    expect(root.fields.balance_payable.value).toBe(7613.2);
    expect(root.fields.addressee.value).toBe("KWIK TRIP (1147)");
  });

  it("unwraps a {value,confidence} dict, and leaves bare scalars without confidence", () => {
    expect(root.fields.utility_company).toEqual({ value: "City of Windom", confidence: 0.96 });
    expect(root.fields.bill_account_id.confidence).toBeUndefined();
  });

  it("yields one instance per meter, each recursing into its nested meter_charges", () => {
    expect(root.groups.meters).toHaveLength(2);
    const [m0, m1] = root.groups.meters;
    expect(m0.fields.meter_id.value).toBe("A12345");
    expect(m0.groups.meter_charges).toHaveLength(2);
    expect(m0.groups.meter_charges[0].fields.line_amount.value).toBe(55.0);
    expect(m1.groups.meter_charges).toHaveLength(0); // empty nested group → count 0
  });

  it("keeps a synthesized empty top-level group (account_charges) as a 0-count group", () => {
    expect(root.groups.account_charges).toEqual([]);
    expect("account_charges" in root.fields).toBe(false);
  });

  it("distinct meter instances keep their own field values (no [0] flatten)", () => {
    expect(root.groups.meters[0].fields.usage_amount.value).toBe(1842);
    expect(root.groups.meters[1].fields.usage_amount.value).toBe(900);
  });

  it("empty / non-object input → empty root", () => {
    expect(extractToInstances(null).root).toEqual({ fields: {}, groups: {} });
  });
});

describe("extractToInstances — schema label join + hiding (§1.3)", () => {
  // A flat label dictionary keyed by field id, across groups (statement/meters/charges).
  const schema = {
    id: "wf",
    name: "Utility",
    categories: [
      {
        id: "statement",
        type: "statement",
        name: "Statement",
        fields: [
          { id: "bill_account_id", name: "Bill account id", type: "STRING" as const, description: "" },
          { id: "balance_payable", name: "Balance payable", type: "NUMBER" as const, description: "" },
          { id: "addressee", name: "Addressee", type: "STRING" as const, description: "" },
          { id: "utility_company", name: "Utility company", type: "STRING" as const, description: "" },
        ],
      },
      {
        id: "meters",
        type: "meters",
        name: "Meters",
        fields: [
          { id: "meter_id", name: "Meter id", type: "STRING" as const, description: "" },
          { id: "usage_amount", name: "Usage amount", type: "NUMBER" as const, description: "" },
        ],
      },
      {
        id: "charges",
        type: "charges",
        name: "Charges",
        fields: [
          { id: "line_amount", name: "Line amount", type: "NUMBER" as const, description: "" },
          { id: "line_label", name: "Line label", type: "STRING" as const, description: "" },
          { id: "line_currency", name: "Line currency", type: "STRING" as const, description: "" },
        ],
      },
    ],
  };

  it("attaches label + type from the schema, joined by field id/name", () => {
    const { root } = extractToInstances(OUTPUT, schema);
    expect(root.fields.balance_payable).toMatchObject({ value: 7613.2, label: "Balance payable", type: "NUMBER" });
    expect(root.fields.addressee).toMatchObject({ label: "Addressee", type: "STRING" });
    // a charge field (nested under meter_charges) joins to the charges group's def by name
    expect(root.groups.meters[0].groups.meter_charges[0].fields.line_label).toMatchObject({
      label: "Line label",
      type: "STRING",
    });
  });

  it("HIDES a scalar output key that has no matching schema field", () => {
    const withNoise = { ...OUTPUT, __debug_trace: "internal", secret_score: 0.9 };
    const { root } = extractToInstances(withNoise, schema);
    expect("__debug_trace" in root.fields).toBe(false);
    expect("secret_score" in root.fields).toBe(false);
    expect(root.fields.bill_account_id.value).toBe("10295809"); // real field kept
  });

  it("keeps structure containers (array groups) even though they aren't schema leaf fields", () => {
    const { root } = extractToInstances(OUTPUT, schema);
    expect(root.groups.meters).toHaveLength(2);
    expect(root.groups.account_charges).toEqual([]);
  });

  it("without a schema, keeps all scalar keys (pure structural walk — no hiding)", () => {
    const withNoise = { ...OUTPUT, __debug_trace: "internal" };
    const { root } = extractToInstances(withNoise);
    expect("__debug_trace" in root.fields).toBe(true);
    expect(root.fields.balance_payable.label).toBeUndefined();
  });
});

describe("manifestToInstances — degenerate fixture tree (manifest fallback)", () => {
  const schema = {
    id: "utility",
    name: "Utility",
    categories: [
      {
        id: "statement",
        type: "statement",
        name: "Statement",
        fields: [
          { id: "account_number", name: "Account number", type: "STRING" as const, description: "acct" },
          { id: "amount_due", name: "Amount due", type: "NUMBER" as const, description: "due" },
        ],
      },
      {
        id: "meters",
        type: "meters",
        name: "Meters",
        fields: [{ id: "meter_kwh", name: "kWh consumed", type: "NUMBER" as const, description: "kwh" }],
      },
    ],
  };
  const values = [
    { fieldId: "account_number", value: "1023456", citations: [{ documentId: "d", page: 1 }] },
    { fieldId: "amount_due", value: 18742.16, citations: [], confidence: 0.94 },
    { fieldId: "meter_kwh", value: 4128, citations: [{ documentId: "d", page: 2 }] },
  ];

  it("first category's fields land at root; later categories become single-instance groups", () => {
    const { root } = manifestToInstances(schema, values);
    expect(root.fields.account_number).toMatchObject({ value: "1023456", label: "Account number" });
    expect(root.groups.meters).toHaveLength(1);
    expect(root.groups.meters[0].fields.meter_kwh.value).toBe(4128);
  });

  it("carries per-value confidence; fields with no sample value render as null", () => {
    const { root } = manifestToInstances(schema, [values[1]]);
    expect(root.fields.amount_due.confidence).toBe(0.94);
    expect(root.fields.account_number.value).toBeNull();
  });
});

describe("instancesToJson — tree-shaped JSON render", () => {
  it("emits fields as values and groups as arrays, recursively", () => {
    const { root } = extractToInstances(OUTPUT);
    const json = instancesToJson(root) as Record<string, unknown>;
    expect(json.bill_account_id).toBe("10295809");
    const meters = json.meters as Array<Record<string, unknown>>;
    expect(meters).toHaveLength(2);
    expect((meters[0].meter_charges as unknown[]).length).toBe(2);
    expect(json.account_charges).toEqual([]);
  });
});

describe("flattenInstanceFields — instance-path keys (§1.4)", () => {
  const { root } = extractToInstances(OUTPUT);
  const entries = flattenInstanceFields(root);
  const byPath = new Map(entries.map((e) => [e.path, e]));

  it("root scalars key by bare field name", () => {
    expect(byPath.get("bill_account_id")?.value).toBe("10295809");
    expect(byPath.get("bill_account_id")?.fieldId).toBe("bill_account_id");
  });

  it("two meter instances' SAME field get DISTINCT instance-path keys with their own values", () => {
    expect(byPath.get("meters/0/usage_amount")?.value).toBe(1842);
    expect(byPath.get("meters/1/usage_amount")?.value).toBe(900);
  });

  it("nested charges key through both group levels", () => {
    expect(byPath.get("meters/0/meter_charges/0/line_amount")?.value).toBe(55.0);
    expect(byPath.get("meters/0/meter_charges/1/line_label")?.value).toBe("Franchise Fee");
    // meter 1 has no charges → no such paths
    expect(entries.some((e) => e.path.startsWith("meters/1/meter_charges/"))).toBe(false);
  });

  it("every entry carries its fieldId so labels/geometry can join by name", () => {
    for (const e of entries) expect(e.path.endsWith(e.fieldId)).toBe(true);
  });
});
