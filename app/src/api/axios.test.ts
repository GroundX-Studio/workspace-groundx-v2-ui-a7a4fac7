import { afterEach, describe, expect, it } from "vitest";

import axios from "@/api/axios";

describe("configured axios client", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("uses same-origin signed cookies instead of browser-managed GroundX headers", async () => {
    sessionStorage.setItem("n", btoa("acct-1"));
    sessionStorage.setItem("j", btoa("jwt-1"));

    const response = await axios.get("/protected", {
      adapter: async (config) => ({
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: "OK",
      }),
    });

    expect(response.config.withCredentials).toBe(true);
    expect(response.config.headers["X-Customer-Key"]).toBeUndefined();
    expect(response.config.headers["X-JWT-Token"]).toBeUndefined();
  });
});
