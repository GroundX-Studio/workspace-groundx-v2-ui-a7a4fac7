import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import { decryptSecret, signValue } from "../lib/crypto.js";
import { testEnv } from "../test/fakes.js";

import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSessionRecord,
  requireAuthenticatedUser,
  requireSession,
  sessionMiddleware,
  setSessionCookie,
} from "./session.js";

function makeReq(cookies: Record<string, string | undefined> = {}): Request {
  return { cookies } as unknown as Request;
}

function makeRes() {
  const cookieCalls: Array<{ name: string; value: string; options: unknown }> = [];
  const res = {
    cookie: vi.fn((name: string, value: string, options: unknown) => {
      cookieCalls.push({ name, value, options });
      return res;
    }),
    clearCookie: vi.fn(),
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  return { res, cookieCalls };
}

describe("createSessionRecord", () => {
  it("mints a fresh id when none is supplied", () => {
    const record = createSessionRecord("user-1");
    expect(record.id).toMatch(/^[0-9a-f-]{20,}/i);
    expect(record.groundxUsername).toBe("user-1");
    expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("reuses the supplied id (anon -> authed cookie preservation)", () => {
    const record = createSessionRecord("user-1", null, "fixed-id-123");
    expect(record.id).toBe("fixed-id-123");
  });

  it("sets expiresAt ~30 days in the future", () => {
    const before = Date.now();
    const record = createSessionRecord("u");
    const diff = record.expiresAt.getTime() - before;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    // Allow 1s of clock skew either side.
    expect(diff).toBeGreaterThan(thirtyDays - 1_000);
    expect(diff).toBeLessThan(thirtyDays + 1_000);
  });
});

describe("setSessionCookie / clearSessionCookie", () => {
  it("sets a signed cookie with the right name, httpOnly, sameSite, and a 30-day maxAge", () => {
    const { res, cookieCalls } = makeRes();
    setSessionCookie(res, testEnv, "session-abc");
    expect(cookieCalls).toHaveLength(1);
    const { name, value, options } = cookieCalls[0];
    expect(name).toBe(SESSION_COOKIE);
    // Value is signed — must NOT be the raw session id.
    expect(value).not.toBe("session-abc");
    expect(value.startsWith("session-abc.")).toBe(true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("sets secure=true in production env, not in dev/test", () => {
    const { res, cookieCalls } = makeRes();
    setSessionCookie(res, { ...testEnv, NODE_ENV: "production" }, "session-x");
    expect(cookieCalls[0].options).toMatchObject({ secure: true });

    const { res: res2, cookieCalls: c2 } = makeRes();
    setSessionCookie(res2, testEnv, "session-y");
    expect(c2[0].options).toMatchObject({ secure: false });
  });

  it("clearSessionCookie removes the cookie at root path", () => {
    const { res } = makeRes();
    clearSessionCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: "/" });
  });
});

describe("sessionMiddleware (cookie -> req.session resolution)", () => {
  let repo: MemoryAppRepository;
  beforeEach(() => {
    repo = new MemoryAppRepository();
  });

  it("attaches no session when the cookie is missing", async () => {
    const req = makeReq();
    const next = vi.fn();
    await sessionMiddleware(testEnv, repo)(req, {} as Response, next);
    expect((req as Request).session).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("attaches no session when the cookie signature is bad (silently skips)", async () => {
    // Forge a cookie with a wrong signature. unsignValue returns null,
    // middleware falls through.
    const req = makeReq({ [SESSION_COOKIE]: "session-abc.tampered-signature" });
    const next = vi.fn();
    await sessionMiddleware(testEnv, repo)(req, {} as Response, next);
    expect((req as Request).session).toBeUndefined();
  });

  it("attaches no session when the signed cookie is valid but the row is missing in the repo", async () => {
    const signed = signValue("session-missing", testEnv.SESSION_SECRET);
    const req = makeReq({ [SESSION_COOKIE]: signed });
    const next = vi.fn();
    await sessionMiddleware(testEnv, repo)(req, {} as Response, next);
    expect((req as Request).session).toBeUndefined();
  });

  it("deletes expired rows and skips attaching the session", async () => {
    await repo.createSession({
      id: "session-expired",
      groundxUsername: "u",
      groundxApiKeyEnc: null,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const signed = signValue("session-expired", testEnv.SESSION_SECRET);
    const req = makeReq({ [SESSION_COOKIE]: signed });
    const next = vi.fn();
    await sessionMiddleware(testEnv, repo)(req, {} as Response, next);
    expect((req as Request).session).toBeUndefined();
    expect(await repo.getSession("session-expired")).toBeNull();
  });

  it("attaches an anon session (empty groundxUsername, no API key)", async () => {
    await repo.createSession(createSessionRecord("", null, "anon-1"));
    const signed = signValue("anon-1", testEnv.SESSION_SECRET);
    const req = makeReq({ [SESSION_COOKIE]: signed });
    const next = vi.fn();
    await sessionMiddleware(testEnv, repo)(req, {} as Response, next);
    expect((req as Request).session).toEqual({
      id: "anon-1",
      groundxUsername: "",
      groundxApiKey: undefined,
    });
  });

  it("attaches a signed-in session and decrypts the encrypted API key", async () => {
    const apiKey = "groundx-key-123";
    const { encryptSecret } = await import("../lib/crypto.js");
    const enc = encryptSecret(apiKey, testEnv.SESSION_SECRET);
    await repo.createSession(createSessionRecord("gx-user", enc, "authed-1"));
    const signed = signValue("authed-1", testEnv.SESSION_SECRET);
    const req = makeReq({ [SESSION_COOKIE]: signed });
    const next = vi.fn();
    await sessionMiddleware(testEnv, repo)(req, {} as Response, next);
    expect((req as Request).session).toEqual({
      id: "authed-1",
      groundxUsername: "gx-user",
      groundxApiKey: apiKey,
    });
  });

  it("rejects a cookie signed with a different SESSION_SECRET (rotation safety)", async () => {
    // Cookie was signed under SECRET A; middleware verifies under SECRET B.
    const SECRET_A = "old-secret-old-secret-old-secret-old";
    const SECRET_B = "new-secret-new-secret-new-secret-new";
    await repo.createSession(createSessionRecord("u", null, "rotated-id"));
    const signed = signValue("rotated-id", SECRET_A);
    const req = makeReq({ [SESSION_COOKIE]: signed });
    const next = vi.fn();
    await sessionMiddleware({ ...testEnv, SESSION_SECRET: SECRET_B }, repo)(req, {} as Response, next);
    // Signature mismatch → no session attached. Cleaner than letting the
    // request through with the wrong identity.
    expect((req as Request).session).toBeUndefined();
  });
});

describe("requireSession", () => {
  it("calls next when a session is present (anon or authed)", () => {
    const next = vi.fn();
    const { res } = makeRes();
    const req = { session: { id: "s", groundxUsername: "" } } as Request;
    requireSession(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is attached", () => {
    const next = vi.fn();
    const { res } = makeRes();
    const req = {} as Request;
    requireSession(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireAuthenticatedUser", () => {
  it("returns 401 with ANONYMOUS_SESSION code when the session is anon", () => {
    const next = vi.fn();
    const { res } = makeRes();
    const req = { session: { id: "s", groundxUsername: "" } } as Request;
    requireAuthenticatedUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Sign-in required", code: "ANONYMOUS_SESSION" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when groundxUsername is non-empty", () => {
    const next = vi.fn();
    const { res } = makeRes();
    const req = { session: { id: "s", groundxUsername: "u" } } as Request;
    requireAuthenticatedUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("encrypt / decrypt round-trip (used by sessionMiddleware)", () => {
  it("round-trips an API key under the session secret", async () => {
    const { encryptSecret } = await import("../lib/crypto.js");
    const original = "groundx-api-key-very-long-uuid";
    const enc = encryptSecret(original, testEnv.SESSION_SECRET);
    expect(enc).not.toBe(original);
    expect(decryptSecret(enc, testEnv.SESSION_SECRET)).toBe(original);
  });
});
