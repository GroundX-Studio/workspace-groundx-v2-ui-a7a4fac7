import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/csrfFetch", () => ({ csrfFetch: vi.fn() }));
import { csrfFetch } from "@/api/csrfFetch";

import { fetchFieldGeometry } from "./fieldGeometry";

afterEach(() => {
  vi.mocked(csrfFetch).mockReset();
});

describe("fetchFieldGeometry (WF-05)", () => {
  it("posts the fields and returns the parallel geometry array", async () => {
    vi.mocked(csrfFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ geometry: [{ page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }, null] }),
    } as Response);

    const out = await fetchFieldGeometry("c3bfff49", [
      { value: 7613.2, label: "balance_payable" },
      { value: "", label: "bill_account_id" },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ page: 1, bbox: { x: 0.1 } });
    expect(out[1]).toBeNull();
    const [url, init] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toBe("/api/documents/c3bfff49/field-geometry");
    expect(JSON.parse((init as RequestInit).body as string).fields).toHaveLength(2);
  });

  it("degrades to all-nulls on a non-ok response", async () => {
    vi.mocked(csrfFetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    expect(await fetchFieldGeometry("c3bfff49", [{ value: 1, label: "a" }])).toEqual([null]);
  });

  it("degrades to all-nulls when the request throws", async () => {
    vi.mocked(csrfFetch).mockRejectedValue(new Error("network"));
    expect(await fetchFieldGeometry("c3bfff49", [{ value: 1, label: "a" }])).toEqual([null]);
  });

  it("makes no request for an empty field list", async () => {
    expect(await fetchFieldGeometry("c3bfff49", [])).toEqual([]);
    expect(csrfFetch).not.toHaveBeenCalled();
  });
});
