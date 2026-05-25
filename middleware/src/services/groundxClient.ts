import type { AppEnv } from "../config/env.js";
import type { GroundXClient } from "../types.js";
import { ensureJsonHeaders, fetchWithTimeout } from "./http.js";

export class FetchGroundXClient implements GroundXClient {
  constructor(private env: AppEnv) {}

  async forward(path: string, init: RequestInit & { apiKey: string }): Promise<Response> {
    const headers = ensureJsonHeaders(init);
    headers.set("X-API-Key", init.apiKey);
    return fetchWithTimeout(
      `${this.env.GROUNDX_BASE_URL}${path}`,
      { ...init, headers },
      { timeoutMs: this.env.UPSTREAM_TIMEOUT_MS, label: "groundx" },
    );
  }
}
