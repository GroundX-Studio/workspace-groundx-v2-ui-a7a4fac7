import type { NextFunction, Request, Response } from "express";

import type { AppEnv } from "../config/env.js";
import type { AppRepository, SessionRecord } from "../types.js";
import { decryptSecret, randomId, signValue, unsignValue } from "../lib/crypto.js";

export const SESSION_COOKIE = "gx_app_session";
const SESSION_DURATION_DAYS = 30;

export interface SessionContext {
  id: string;
  groundxUsername: string;
  groundxApiKey?: string;
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

    req.session = {
      id: session.id,
      groundxUsername: session.groundxUsername,
      groundxApiKey: session.groundxApiKeyEnc ? decryptSecret(session.groundxApiKeyEnc, env.SESSION_SECRET) : undefined,
    };
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
  if (!req.session.groundxUsername) {
    res.status(401).json({ error: "Sign-in required", code: "ANONYMOUS_SESSION" });
    return;
  }
  next();
}
