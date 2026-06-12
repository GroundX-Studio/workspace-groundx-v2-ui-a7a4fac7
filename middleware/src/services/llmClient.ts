import type { AppEnv } from "../config/env.js";
import type { LlmClient } from "../types.js";
import { ensureJsonHeaders, fetchWithTimeout } from "./http.js";

/**
 * CF-16 — `FetchLlmClient` supports three profiles:
 *
 *   "chat"       — reads `LLM_BASE_URL / LLM_API_KEY / LLM_AUTH_*`. Used for
 *                  the grounded RAG completion and anything that needs the
 *                  quality/large-context model.
 *   "light"      — reads `LLM_LIGHT_BASE_URL / LLM_LIGHT_API_KEY /
 *                  LLM_LIGHT_AUTH_*`. Used for cheap/fast tasks (compression
 *                  summarization, the turn router). Auth header + scheme fall
 *                  back to the chat-side equivalents when not explicitly set.
 *   "embeddings" — reads `EMBEDDINGS_BASE_URL / EMBEDDINGS_API_KEY /
 *                  EMBEDDINGS_AUTH_*` (wire-embedding-verification). Two
 *                  deliberate deviations from chat/light: (1) only the BASE
 *                  URL is required — a missing API key is valid (keyless
 *                  self-hosted TEI/Ollama/vLLM), and the auth header is
 *                  attached only when a key is set; (2) the profile carries
 *                  its own tight `EMBEDDINGS_TIMEOUT_MS` abort budget,
 *                  because citation verification blocks the chat reply (a
 *                  dead provider must cost ~2s, not the 30s
 *                  `UPSTREAM_TIMEOUT_MS`).
 *
 * When a profile's required config is unset, the client reports 503 for
 * every forward — callers see this as "not configured" and degrade. `app.ts`
 * / `index.ts` make the degradation decision at boot, not per request, so
 * the 503 path is just defense-in-depth.
 */
export type LlmProfile = "chat" | "light" | "embeddings";

export class FetchLlmClient implements LlmClient {
  constructor(private env: AppEnv, private profile: LlmProfile = "chat") {}

  async forward(path: string, init: RequestInit): Promise<Response> {
    const baseUrl =
      this.profile === "embeddings"
        ? this.env.EMBEDDINGS_BASE_URL
        : this.profile === "light"
          ? this.env.LLM_LIGHT_BASE_URL
          : this.env.LLM_BASE_URL;
    const apiKey =
      this.profile === "embeddings"
        ? this.env.EMBEDDINGS_API_KEY
        : this.profile === "light"
          ? this.env.LLM_LIGHT_API_KEY
          : this.env.LLM_API_KEY;
    // Embeddings: keyless providers are valid — only the base URL gates.
    const missingConfig = this.profile === "embeddings" ? !baseUrl : !baseUrl || !apiKey;
    if (missingConfig) {
      return Response.json(
        { error: `LLM provider (${this.profile}) is not configured` },
        { status: 503 },
      );
    }
    const authHeaderName =
      (this.profile === "embeddings"
        ? this.env.EMBEDDINGS_AUTH_HEADER_NAME
        : this.profile === "light"
          ? this.env.LLM_LIGHT_AUTH_HEADER_NAME
          : undefined) ?? this.env.LLM_AUTH_HEADER_NAME;
    const authScheme =
      (this.profile === "embeddings"
        ? this.env.EMBEDDINGS_AUTH_SCHEME
        : this.profile === "light"
          ? this.env.LLM_LIGHT_AUTH_SCHEME
          : undefined) ?? this.env.LLM_AUTH_SCHEME;
    const headers = ensureJsonHeaders(init);
    if (apiKey) {
      const value = authScheme ? `${authScheme} ${apiKey}` : apiKey;
      headers.set(authHeaderName, value);
    }
    const timeoutMs =
      this.profile === "embeddings" ? this.env.EMBEDDINGS_TIMEOUT_MS : this.env.UPSTREAM_TIMEOUT_MS;
    return fetchWithTimeout(
      `${baseUrl}${path}`,
      { ...init, headers },
      { timeoutMs, label: `llm:${this.profile}` },
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

/**
 * Returns true when the embeddings provider is wired (base_url + model_id —
 * the API key is deliberately NOT checked; keyless self-hosted providers are
 * first-class). When false, citation verification degrades to lexical-only
 * and the composition root logs a warning.
 */
export function isEmbeddingsConfigured(env: AppEnv): boolean {
  return Boolean(env.EMBEDDINGS_BASE_URL && env.EMBEDDINGS_MODEL_ID);
}
