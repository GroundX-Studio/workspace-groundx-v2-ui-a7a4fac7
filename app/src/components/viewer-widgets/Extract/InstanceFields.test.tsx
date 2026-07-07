import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { extractToInstances } from "@/api/extractInstances";
import type { FieldRegion } from "@/api/fieldGeometry";
import type { ExtractionSchemaDef } from "@/types/scenarios";

import { InstanceFields } from "./InstanceFields";

/**
 * analyze-and-chat-ux §2.1 — the recursive instance render. An object level =
 * a tab bar (scalars tab + one tab per array group in the OUTPUT); an array
 * group tab = instance pills recursing into each instance's own level. No
 * hardcoded group names — labels join from the schema by field name.
 */

const schema: ExtractionSchemaDef = {
  id: "wf",
  name: "Utility",
  categories: [
    {
      id: "statement",
      type: "statement",
      name: "Statement",
      fields: [
        { id: "bill_account_id", name: "Bill account id", type: "STRING", description: "the account" },
        { id: "utility_company", name: "Utility company", type: "STRING", description: "the issuer" },
      ],
    },
    {
      id: "meters",
      type: "meters",
      name: "Meters",
      fields: [
        { id: "meter_id", name: "Meter id", type: "STRING", description: "meter id" },
        { id: "usage_amount", name: "Usage amount", type: "NUMBER", description: "usage" },
      ],
    },
    {
      id: "charges",
      type: "charges",
      name: "Charges",
      fields: [
        { id: "line_amount", name: "Line amount", type: "NUMBER", description: "amount" },
        { id: "line_label", name: "Line label", type: "STRING", description: "label" },
      ],
    },
  ],
};

const output = {
  bill_account_id: "10295809",
  utility_company: "City of Windom",
  account_charges: [],
  meters: [
    {
      meter_id: "M-100",
      usage_amount: 60960,
      meter_charges: [
        { line_amount: 55, line_label: "Electric" },
        { line_amount: 12.5, line_label: "Franchise Fee" },
      ],
    },
    { meter_id: "M-200", usage_amount: 900, meter_charges: [] },
  ],
};

const geometry = new Map<string, FieldRegion[]>([
  ["meters/0/usage_amount", [{ page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 } }]],
  ["meters/1/usage_amount", [{ page: 3, bbox: { x: 0.1, y: 0.5, w: 0.3, h: 0.02 } }]],
]);

function renderTree(overrides: Partial<Parameters<typeof InstanceFields>[0]> = {}) {
  const onFieldHover = vi.fn();
  const onFieldPin = vi.fn();
  const { root } = extractToInstances(output, schema);
  const utils = render(
    <InstanceFields
      root={root}
      schema={schema}
      geometry={geometry}
      pinnedPath={null}
      onFieldHover={onFieldHover}
      onFieldPin={onFieldPin}
      {...overrides}
    />,
  );
  return { ...utils, onFieldHover, onFieldPin };
}

describe("InstanceFields — recursive tab bar (§2.1)", () => {
  it("root level: scalars tab (schema-joined label) + one tab per output array group with counts", () => {
    renderTree();
    expect(screen.getByTestId("instance-tab-__fields")).toHaveTextContent(/Statement/);
    expect(screen.getByTestId("instance-tab-meters")).toHaveTextContent(/Meters/);
    expect(screen.getByTestId("instance-tab-meters")).toHaveTextContent(/2/);
    // account_charges: empty array still gets a tab, count 0, charge-label join
    expect(screen.getByTestId("instance-tab-account_charges")).toHaveTextContent(/Charges/);
    expect(screen.getByTestId("instance-tab-account_charges")).toHaveTextContent(/0/);
  });

  it("scalars tab shows root field rows with schema labels", () => {
    renderTree();
    const row = screen.getByTestId("field-row-bill_account_id");
    expect(row).toHaveTextContent("bill_account_id");
    expect(row).toHaveTextContent("10295809");
    expect(row).toHaveTextContent("the account");
  });

  it("an empty array group renders an honest empty state (no fake instance)", () => {
    renderTree();
    fireEvent.click(screen.getByTestId("instance-tab-account_charges"));
    expect(screen.getByTestId("instance-group-empty")).toHaveTextContent(/no charges/i);
  });

  it("array group tab → instance pills labeled by the identifying field; selecting one shows ITS values", () => {
    renderTree();
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    const pill0 = screen.getByTestId("instance-pill-meters/0");
    const pill1 = screen.getByTestId("instance-pill-meters/1");
    expect(pill0).toHaveTextContent("M-100");
    expect(pill1).toHaveTextContent("M-200");
    // first instance selected by default → its own values
    expect(screen.getByTestId("field-row-meters/0/usage_amount")).toHaveTextContent("60960");
    // switch instance → the OTHER instance's values (no [0] flatten)
    fireEvent.click(pill1);
    expect(screen.getByTestId("field-row-meters/1/usage_amount")).toHaveTextContent("900");
    expect(screen.queryByTestId("field-row-meters/0/usage_amount")).toBeNull();
  });

  it("a selected meter recurses: its own tab bar with its nested charges (count per instance)", () => {
    renderTree();
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    // meter 0 (default): Charges · 2
    const meterLevelTab = screen.getByTestId("instance-tab-meters/0/meter_charges");
    expect(meterLevelTab).toHaveTextContent(/Charges/);
    expect(meterLevelTab).toHaveTextContent(/2/);
    fireEvent.click(meterLevelTab);
    expect(screen.getByTestId("field-row-meters/0/meter_charges/0/line_amount")).toHaveTextContent("55");
    // meter 1: Charges · 0
    fireEvent.click(screen.getByTestId("instance-pill-meters/1"));
    expect(screen.getByTestId("instance-tab-meters/1/meter_charges")).toHaveTextContent(/0/);
  });

  it("hover + focus drive onFieldHover with the instance path; leave/blur clear it", () => {
    const { onFieldHover } = renderTree();
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    const row = screen.getByTestId("field-row-meters/0/usage_amount");
    fireEvent.mouseEnter(row);
    expect(onFieldHover).toHaveBeenLastCalledWith("meters/0/usage_amount");
    fireEvent.mouseLeave(row);
    expect(onFieldHover).toHaveBeenLastCalledWith(null);
    fireEvent.focus(row);
    expect(onFieldHover).toHaveBeenLastCalledWith("meters/0/usage_amount");
    fireEvent.blur(row);
    expect(onFieldHover).toHaveBeenLastCalledWith(null);
  });

  it("click asks the parent to pin the row's path (§3.2b)", () => {
    const { onFieldPin } = renderTree();
    const row = screen.getByTestId("field-row-bill_account_id");
    fireEvent.click(row);
    expect(onFieldPin).toHaveBeenCalledWith("bill_account_id");
  });

  it("ARBITRARY output shape recurses with name-joined labels (anti-hardcode §4.2)", () => {
    const arbSchema: ExtractionSchemaDef = {
      id: "wf-a",
      name: "Fleet",
      categories: [
        {
          id: "assets",
          type: "assets",
          name: "Assets",
          fields: [{ id: "serial_number", name: "Serial number", type: "STRING", description: "sn" }],
        },
        {
          id: "warranties",
          type: "warranties",
          name: "Warranties",
          fields: [{ id: "expires_on", name: "Expires on", type: "DATE", description: "expiry" }],
        },
      ],
    };
    const arbOutput = {
      assets: [
        { serial_number: "SN-1", warranties: [{ expires_on: "2027-01-01" }, { expires_on: "2028-02-02" }] },
      ],
    };
    const { root } = extractToInstances(arbOutput, arbSchema);
    render(
      <InstanceFields
        root={root}
        schema={arbSchema}
        geometry={new Map()}
        pinnedPath={null}
        onFieldHover={() => undefined}
        onFieldPin={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId("instance-tab-assets"));
    expect(screen.getByTestId("field-row-assets/0/serial_number")).toHaveTextContent("SN-1");
    const nested = screen.getByTestId("instance-tab-assets/0/warranties");
    expect(nested).toHaveTextContent(/Warranties/);
    expect(nested).toHaveTextContent(/2/);
    fireEvent.click(nested);
    // pills select one instance at a time — pick the 2nd warranty, then read it
    fireEvent.click(screen.getByTestId("instance-pill-assets/0/warranties/1"));
    expect(screen.getByTestId("field-row-assets/0/warranties/1/expires_on")).toHaveTextContent("2028-02-02");
  });

  it("focusedGroupId preselects the matching root tab", () => {
    renderTree({ focusedGroupId: "meters" });
    // meters tab content visible without a click
    expect(screen.getByTestId("instance-pill-meters/0")).toBeInTheDocument();
  });

  it("a source chip appears for rows with geometry", () => {
    renderTree();
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    const row = screen.getByTestId("field-row-meters/0/usage_amount");
    expect(within(row).getByTestId("field-source-chip")).toHaveTextContent("p.2");
  });
});
