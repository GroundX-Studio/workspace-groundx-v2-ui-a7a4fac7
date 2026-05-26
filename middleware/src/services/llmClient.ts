import type { AppEnv } from "../config/env.js";
import type { LlmClient } from "../types.js";
import { ensureJsonHeaders, fetchWithTimeout } from "./http.js";

/**
 * CF-16 — `FetchLlmClient` now supports two profiles:
 *
 *   "chat"  — reads `LLM_BASE_URL / LLM_API_KEY / LLM_AUTH_*`. Used for
 *             the grounded RAG completion and anything that needs the
 *             quality/large-context model.
 *   "light" — reads `LLM_LIGHT_BASE_URL / LLM_LIGHT_API_KEY /
 *             LLM_LIGHT_AUTH_*`. Used for cheap/fast tasks (compression
 *             summarization today; classifiers + suggested-prompts in
 *             the future). Auth header + scheme fall back to the chat-
 *             side equivalents when not explicitly set.
 *
 * When the light profile's base_url or api_key is unset, the client
 * reports 503 for every forward — callers see this as "light client not
 * configured" and fall back to the chat client. `app.ts` makes the
 * fallback decision at boot, not per request, so the 503 path is just
 * defense-in-depth.
 */
export type LlmProfile = "chat" | "light";

export class FetchLlmClient implements LlmClient {
  constructor(private env: AppEnv, private profile: LlmProfile = "chat") {}

  async forward(path: string, init: RequestInit): Promise<Response> {
    const baseUrl =
      this.profile === "light" ? this.env.LLM_LIGHT_BASE_URL : this.env.LLM_BASE_URL;
    const apiKey =
      this.profile === "light" ? this.env.LLM_LIGHT_API_KEY : this.env.LLM_API_KEY;
    if (!baseUrl || !apiKey) {
      return Response.json(
        { error: `LLM provider (${this.profile}) is not configured` },
        { status: 503 },
      );
    }
    const authHeaderName =
      (this.profile === "light" ? this.env.LLM_LIGHT_AUTH_HEADER_NAME : undefined) ??
      this.env.LLM_AUTH_HEADER_NAME;
    const authScheme =
      (this.profile === "light" ? this.env.LLM_LIGHT_AUTH_SCHEME : undefined) ??
      this.env.LLM_AUTH_SCHEME;
    const headers = ensureJsonHeaders(init);
    const value = authScheme ? `${authScheme} ${apiKey}` : apiKey;
    headers.set(authHeaderName, value);
    return fetchWithTimeout(
      `${baseUrl}${path}`,
      { ...init, headers },
      { timeoutMs: this.env.UPSTREAM_TIMEOUT_MS, label: `llm:${this.profile}` },
    );
  }
}

/**
 * Returns true when the env has enough wired to build a real light
 * client (base_url + api_key + model_id). When false, callers should
 * reuse the chat client for both profiles.
 */
export function isLightLlmConfigured(env: AppEnv): boolean {
  return Boolean(env.LLM_LIGHT_BASE_URL && env.LLM_LIGHT_API_KEY && env.LLM_LIGHT_MODEL_ID);
}
