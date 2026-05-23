/**
 * Tests for the dev-mode demo state URL parser.
 *
 * These tests assume vitest's default DEV=true. In production builds the
 * parser returns null for everything (a separate prod-mode test could
 * stub import.meta.env.DEV, but the behavior is symmetric).
 */

import { describe, expect, it } from "vitest";

import { readRegistryDemoOverride } from "./demoState";

describe("readRegistryDemoOverride", () => {
  it("returns null when no demo param is present", () => {
    expect(readRegistryDemoOverride("")).toBeNull();
    expect(readRegistryDemoOverride("?foo=bar")).toBeNull();
  });

  it("returns null for unknown registry values", () => {
    expect(readRegistryDemoOverride("?registry=banana")).toBeNull();
  });

  it("returns the empty state for ?registry=empty", () => {
    const result = readRegistryDemoOverride("?registry=empty");
    expect(result).toEqual({ status: "ready", scenarios: [], error: null });
  });

  it("returns the loading state for ?registry=loading", () => {
    const result = readRegistryDemoOverride("?registry=loading");
    expect(result).toEqual({ status: "loading", scenarios: [], error: null });
  });

  it("returns the error state with a default message for ?registry=error", () => {
    const result = readRegistryDemoOverride("?registry=error");
    expect(result).toMatchObject({ status: "error", scenarios: [] });
    expect(result?.error).toMatch(/demo/i);
  });

  it("uses a custom error message when ?error=... is provided", () => {
    const result = readRegistryDemoOverride("?registry=error&error=Bucket+unreachable");
    expect(result).toEqual({ status: "error", scenarios: [], error: "Bucket unreachable" });
  });

  it("handles URL-encoded spaces in custom error messages", () => {
    const result = readRegistryDemoOverride("?registry=error&error=Middleware%20down");
    expect(result?.error).toBe("Middleware down");
  });
});
