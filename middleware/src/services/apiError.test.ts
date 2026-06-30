/**
 * 2026-05-31-core-data-followups §2 — shared `ApiError` base.
 *
 * One error contract across app + middleware: a single base
 * `ApiError extends Error` carrying `status` + `detail`. Every hand-rolled
 * `*Error` extends it; none re-declares its own `status`/`detail` field.
 *
 * This is the failing-first test that locks the base's existence + shape.
 * The seven subclasses' own behavior (instanceof + `.status`/`.statusCode`/
 * `.mode`/`.upstreamStatus`) stays asserted by their existing suites
 * (extractField.test / templates.test / chatSessions.test / chatHandler.test
 * / upstreamClients.test), which must remain green + unchanged — that is the
 * proof the client-facing error envelope is preserved.
 */

import { describe, expect, it } from "vitest";
import { ApiError } from "@groundx/shared";

import { ChatRouteNotImplementedError } from "./chatRouterTypes.js";
import { ChatHandlerError } from "./chatHandler.js";
import { UpstreamHttpError, UpstreamTimeoutError } from "./http.js";

describe("ApiError base (@groundx/shared)", () => {
  it("is an Error subclass carrying status + detail", () => {
    const err = new ApiError("boom", 418, { reason: "teapot" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(418);
    expect(err.detail).toEqual({ reason: "teapot" });
    expect(err.message).toBe("boom");
  });

  it("detail is optional (defaults to undefined)", () => {
    const err = new ApiError("no detail", 500);
    expect(err.detail).toBeUndefined();
    expect(err.status).toBe(500);
  });

  it("every middleware *Error extends the base ApiError", () => {
    expect(new ChatHandlerError("nope", 400)).toBeInstanceOf(ApiError);
    expect(new ChatRouteNotImplementedError("structured")).toBeInstanceOf(ApiError);
    expect(new UpstreamHttpError("groundx", 503)).toBeInstanceOf(ApiError);
    expect(new UpstreamTimeoutError("llm", 30_000)).toBeInstanceOf(ApiError);
  });

  it("subclasses preserve their observable envelope fields via the base", () => {
    // ChatHandlerError exposes `.statusCode` (route reads it) backed by base `.status`.
    const h = new ChatHandlerError("nope", 418);
    expect(h.statusCode).toBe(418);
    expect(h.status).toBe(418);
    expect(h.name).toBe("ChatHandlerError");
    // Upstream errors expose `.upstreamStatus` (global handler reads it) + `.status`.
    const u = new UpstreamHttpError("groundx", 503);
    expect(u.status).toBe(503);
    expect(u.upstreamStatus).toBe(503);
    const t = new UpstreamTimeoutError("llm", 30_000);
    expect(t.status).toBe(504);
    expect(t.upstreamStatus).toBe(504);
    // Not-implemented carries `.mode`.
    const n = new ChatRouteNotImplementedError("hybrid");
    expect(n.mode).toBe("hybrid");
  });
});
