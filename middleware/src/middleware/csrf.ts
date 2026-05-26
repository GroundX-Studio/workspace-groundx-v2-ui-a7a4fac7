import type { NextFunction, Request, Response } from "express";
import { randomBytes } from "node:crypto";

import type { AppEnv } from "../config/env.js";

/**
 * SC-01 — CSRF defense via the double-submit cookie pattern.
 *
 * Why this pattern: it's the simplest scheme that doesn't require
 * server-side session storage (the synchronizer-token pattern would).
 * The server sets a `csrf_token` cookie readable by client JS (NOT
 * HttpOnly). On state-changing requests, the client reads that cookie
 * and echoes it in an `X-CSRF-Token` header. The server verifies the
 * header equals the cookie. A cross-site attacker can't read the
 * cookie value (Same-Origin Policy blocks `document.cookie` access
 * from `evil.com`), so they can't forge the header.
 *
 * SameSite=lax on the session cookie already blocks most CSRF for
 * top-level navigation, but does NOT block XHR/fetch from same-site
 * subdomains or any case where the attacker can host on the same
 * eTLD+1. This middleware is the actual defense.
 *
 * Exempt routes — `CSRF_EXEMPT_PATHS` — are the bootstrap touch
 * points that fire BEFORE the client has any cookie. These routes
 * are state-changing but the worst an attacker can do via CSRF is
 * mint a fresh anon session for the user (not a security boundary).
 */
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

/**
 * Paths that bypass CSRF validation. These are the very first
 * client→server touch points; the client doesn't yet have the
 * `csrf_token` cookie, so it can't send the header. Keep this list
 * minimal — any exempt route is a CSRF-attack-surface.
 */
export const CSRF_EXEMPT_PATHS = new Set<string>([
  "/api/onboarding/session",
  "/api/auth/login",
  "/api/auth/register",
  // Health/observability probes are GET-only so they skip via the
  // safe-method check, but list them here for documentation.
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_BYTES = 32;

function mintToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

function setCsrfCookie(res: Response, env: AppEnv, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // client JS must be able to read it
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // No explicit maxAge — tie the cookie to the browser session.
    // The server re-issues if the cookie is missing on any request.
  });
}

/**
 * Constant-time string comparison so a malicious client can't time
 * the response to brute-force the token byte by byte.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function csrfMiddleware(env: AppEnv) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Always ensure the cookie exists (even when enforcement is off
    // in test/dev). This makes the `/api/csrf/token` endpoint behave
    // identically across modes — only the validation step toggles.
    const existing = req.cookies?.[CSRF_COOKIE];
    let token = typeof existing === "string" && existing.length > 0 ? existing : null;
    if (!token) {
      token = mintToken();
      setCsrfCookie(res, env, token);
      req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
    }
    if (!env.CSRF_ENABLED) {
      // Enforcement off: cookie still issued (for /api/csrf/token),
      // but no header validation. Used in test suites that aren't
      // exercising CSRF and in dev when the env explicitly opts out.
      next();
      return;
    }
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (CSRF_EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    const headerToken = req.headers[CSRF_HEADER];
    const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    if (!headerValue || typeof headerValue !== "string") {
      res.status(403).json({ error: "csrf_token_missing" });
      return;
    }
    if (!timingSafeEqual(headerValue, token)) {
      res.status(403).json({ error: "csrf_token_mismatch" });
      return;
    }
    next();
  };
}
