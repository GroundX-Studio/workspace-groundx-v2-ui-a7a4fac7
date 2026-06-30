import { ApiError } from "@groundx/shared";

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export class UpstreamHttpError extends ApiError {
  /** Mirrors `status` for the global error handler's `upstreamStatus` payload field. */
  readonly upstreamStatus: number;

  constructor(label: string, status: number, detail?: string) {
    super(detail ? `${label}: ${detail}` : `${label}: HTTP ${status}`, status);
    this.name = "UpstreamHttpError";
    this.upstreamStatus = status;
  }
}

export async function upstreamError(response: Response, label: string): Promise<UpstreamHttpError> {
  const data = await readJson(response);
  let detail: string | undefined;
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    if (typeof body.error === "string") detail = body.error;
    else if (typeof body.message === "string") detail = body.message;
    else if (typeof body.raw === "string") detail = body.raw.slice(0, 240);
  }
  return new UpstreamHttpError(label, response.status, detail);
}

export async function sendUpstreamResponse(response: Response, res: import("express").Response): Promise<void> {
  const data = await readJson(response);
  res.status(response.status).json(data);
}

export function basicAuth(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

export function ensureJsonHeaders(init: RequestInit = {}): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  return headers;
}

/**
 * Default upstream-call timeout. Capped at 30s because the slowest legit
 * call we make is a grounded LLM completion (5–15s P95). Anything past
 * 30s is a hung connection or an API outage; failing fast prevents the
 * request handler from holding a DB pool connection indefinitely.
 *
 * Configurable via UPSTREAM_TIMEOUT_MS env var (1s–120s). Tests pin a
 * tighter value via the optional `timeoutMs` arg.
 */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;

export class UpstreamTimeoutError extends ApiError {
  /** Mirrors `status` for the global error handler's `upstreamStatus` payload field. */
  readonly upstreamStatus = 504;
  constructor(label: string, timeoutMs: number) {
    super(`${label}: upstream timed out after ${timeoutMs}ms`, 504);
    this.name = "UpstreamTimeoutError";
  }
}

/**
 * fetch() with a hard timeout. Aborts via AbortController so the
 * underlying socket is released. Throws UpstreamTimeoutError on expiry
 * so the error handler can map cleanly to HTTP 504.
 *
 * Callers that already pass a `signal` on the init get it composed with
 * the timeout signal — both an external abort AND the timer cancel the
 * request.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; label?: string } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const label = options.label ?? "upstream";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Compose with any caller-supplied signal so both sources of abort
  // are honored.
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
      // Distinguish "external caller aborted" from "we timed out".
      if (callerSignal?.aborted) throw err;
      throw new UpstreamTimeoutError(label, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
