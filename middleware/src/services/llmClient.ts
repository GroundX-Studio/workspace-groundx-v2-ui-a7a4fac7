import type { AppEnv } from "../config/env.js";
import type { LlmClient } from "../types.js";
import { ensureJsonHeaders } from "./http.js";

export class FetchLlmClient implements LlmClient {
  constructor(private env: AppEnv) {}

  async forward(path: string, init: RequestInit): Promise<Response> {
    if (!this.env.LLM_BASE_URL || !this.env.LLM_API_KEY) {
      return Response.json({ error: "LLM provider is not configured" }, { status: 503 });
    }
    const headers = ensureJsonHeaders(init);
    const value = this.env.LLM_AUTH_SCHEME
      ? `${this.env.LLM_AUTH_SCHEME} ${this.env.LLM_API_KEY}`
      : this.env.LLM_API_KEY;
    headers.set(this.env.LLM_AUTH_HEADER_NAME, value);
    return fetch(`${this.env.LLM_BASE_URL}${path}`, { ...init, headers });
  }
}
