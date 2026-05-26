/**
 * SC-01 — client-side CSRF helper. Reads the `csrf_token` cookie set
 * by the middleware (`csrfMiddleware` issues one on every response)
 * and adds it as an `X-CSRF-Token` header on state-changing fetches.
 *
 * The cookie is intentionally non-HttpOnly so the client can read it
 * here. A cross-site attacker can't read this cookie (Same-Origin
 * Policy blocks `document.cookie` from `evil.com`), so they can't
 * forge the header — that's the actual defense.
 *
 * Usage:
 *   await csrfFetch("/api/chat/messages", {
 *     method: "POST",
 *     credentials: "include",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify(payload),
 *   });
 *
 * If the cookie hasn't been issued yet (first-touch flow), this
 * function calls `GET /api/csrf/token` to bootstrap it before the
 * outgoing request. Idempotent — subsequent calls reuse the cookie.
 */

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie ?? "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${CSRF_COOKIE_NAME}=`)) {
      const value = trimmed.slice(CSRF_COOKIE_NAME.length + 1);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

async function bootstrapCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/csrf/token", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { token?: string } | null;
    return body?.token ?? readCsrfCookie();
  } catch {
    return null;
  }
}

export async function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return fetch(input, init);
  }
  let token = readCsrfCookie();
  if (!token) {
    token = await bootstrapCsrfToken();
  }
  const headers = new Headers(init?.headers);
  if (token) headers.set(CSRF_HEADER_NAME, token);
  return fetch(input, { ...init, headers, credentials: init?.credentials ?? "include" });
}
