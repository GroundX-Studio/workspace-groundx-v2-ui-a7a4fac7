import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/csrfFetch", () => ({ csrfFetch: vi.fn() }));
import { csrfFetch } from "@/api/csrfFetch";

import { fetchFieldGeometry } from "./fieldGeometry";

afterEach(() => {
  vi.mocked(csrfFetch).mockReset();
});

describe("fetchFieldGeometry (WF-05)", () => {
  it("posts the fields and returns each field's FULL region set (multi-region P1.3b)", async () => {
    // The endpoint returns per-field REGIONS (`{page,bbox}[]`); the client now
    // returns the whole set per field so the grid lights every occurrence.
    vi.mocked(csrfFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        geometry: [
          [
            { page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
            { page: 2, bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
          ],
          [],
        ],
      }),
    } as Response);

    const out = await fetchFieldGeometry("c3bfff49", [
      { value: 7613.2, label: "balance_payable" },
      { value: "", label: "bill_account_id" },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2); // both regions kept
    expect(out[0][0]).toEqual({ page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
    expect(out[0][1]).toEqual({ page: 2, bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } });
    expect(out[1]).toEqual([]); // no match → empty
    const [url, init] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toBe("/api/documents/c3bfff49/field-geometry");
    expect(JSON.parse((init as RequestInit).body as string).fields).toHaveLength(2);
  });

  it("drops malformed region entries (missing page/bbox)", async () => {
    vi.mocked(csrfFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ geometry: [[{ page: 1, bbox: { x: 0, y: 0, w: 1, h: 1 } }, { page: 2 }, "garbage"]] }),
    } as Response);
    const out = await fetchFieldGeometry("c3bfff49", [{ value: 1, label: "a" }]);
    expect(out[0]).toHaveLength(1);
  });

  it("degrades to all-empty on a non-ok response", async () => {
    vi.mocked(csrfFetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    expect(await fetchFieldGeometry("c3bfff49", [{ value: 1, label: "a" }])).toEqual([[]]);
  });

  it("degrades to all-empty when the request throws", async () => {
    vi.mocked(csrfFetch).mockRejectedValue(new Error("network"));
    expect(await fetchFieldGeometry("c3bfff49", [{ value: 1, label: "a" }])).toEqual([[]]);
  });

  it("makes no request for an empty field list", async () => {
    expect(await fetchFieldGeometry("c3bfff49", [])).toEqual([]);
    expect(csrfFetch).not.toHaveBeenCalled();
  });
});
