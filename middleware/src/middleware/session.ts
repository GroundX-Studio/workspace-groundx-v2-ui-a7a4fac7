import type { NextFunction, Request, Response } from "express";

import type { AppEnv } from "../config/env.js";
import type { AppRepository, SessionRecord } from "../types.js";
import { decryptSecret, randomId, signValue, unsignValue } from "../lib/crypto.js";

export const SESSION_COOKIE = "gx_app_session";
const SESSION_DURATION_DAYS = 30;

/**
 * 2026-05-31-core-data-followups §4 #20 — the in-memory request session is a
 * discriminated union, NOT an empty-string `groundxUsername` sentinel. The
 * `kind` discriminant is the single source of truth for "is this caller
 * signed in?": an anon session has NO `groundxUsername` field at all, so an
 * empty-string sentinel is unrepresentable. The persistence shape
 * (`SessionRecord`) still stores `groundx_username` as a column (`""` = anon);
 * `sessionMiddleware` is the ONE conversion boundary (DB row → this union).
 */
export interface AnonSession {
  id: string;
  kind: "anon";
}

export interface AuthedSession {
  id: string;
  kind: "authed";
  groundxUsername: string;
  groundxApiKey?: string;
}

export type SessionContext = AnonSession | AuthedSession;

/** Type guard: narrows a session to the authed arm. */
export function isAuthedSession(session: SessionContext): session is AuthedSession {
  return session.kind === "authed";
}

/**
 * The signed-in GroundX username, or `null` for an anon session. This is the
 * single accessor that replaces the scattered empty-string `groundxUsername`
 * reads — a reader that wants "the username if signed in, else absent" calls
 * this instead of branching on `""`.
 */
export function sessionUsername(session: SessionContext): string | null {
  return session.kind === "authed" ? session.groundxUsername : null;
}

/**
 * The decrypted GroundX API key on an authed session, or `undefined` (anon, or
 * authed-without-key). Single accessor replacing `session.groundxApiKey` reads
 * that used the partner-key env fallback when absent.
 */
export function sessionApiKey(session: SessionContext): string | undefined {
  return session.kind === "authed" ? session.groundxApiKey : undefined;
}

declare global {
  namespace Express {
    interface Request {
      session?: SessionContext;
    }
  }
}

export function setSessionCookie(res: Response, env: AppEnv, sessionId: string): void {
  res.cookie(SESSION_COOKIE, signValue(sessionId, env.SESSION_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function createSessionRecord(groundxUsername: string, groundxApiKeyEnc?: string | null, id?: string): SessionRecord {
  return {
    id: id ?? randomId(),
    groundxUsername,
    groundxApiKeyEnc,
    expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function sessionMiddleware(env: AppEnv, repository: AppRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const signed = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!signed) {
      next();
      return;
    }

    const sessionId = unsignValue(signed, env.SESSION_SECRET);
    if (!sessionId) {
      next();
      return;
    }

    const session = await repository.getSession(sessionId);
    if (!session || session.expiresAt <= new Date()) {
      if (session) await repository.deleteSession(session.id);
      next();
      return;
    }

    // §4 #20 — map the persistence shape onto the discriminated union HERE
    // (the one conversion boundary). An empty-string DB `groundx_username` is
    // an anon session; a non-empty one is authed and carries the decrypted key.
    req.session = session.groundxUsername
      ? {
          id: session.id,
          kind: "authed",
          groundxUsername: session.groundxUsername,
          groundxApiKey: session.groundxApiKeyEnc
            ? decryptSecret(session.groundxApiKeyEnc, env.SESSION_SECRET)
            : undefined,
        }
      : { id: session.id, kind: "anon" };
    next();
  };
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Tighter guard for routes that need a *signed-in* GroundX customer (Partner
 * resource endpoints, auth/me, /api/v1 with the user's API key). Two failure
 * modes get distinct 401 shapes so the app can branch on them:
 *   - No session cookie at all → `Authentication required` (matches the
 *     `requireSession` shape; the user needs to log in from scratch).
 *   - Cookie present but anonymous → `Sign-in required` + `ANONYMOUS_SESSION`
 *     code (the user already has an onboarding session; the app should open
 *     the F6 gate inline, not redirect to the login page).
 */
export function requireAuthenticatedUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.session.kind !== "authed") {
    res.status(401).json({ error: "Sign-in required", code: "ANONYMOUS_SESSION" });
    return;
  }
  next();
}
