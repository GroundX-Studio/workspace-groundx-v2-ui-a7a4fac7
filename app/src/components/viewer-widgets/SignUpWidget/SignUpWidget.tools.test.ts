/**
 * 2026-05-31-tool-system-completion (wf04 §1) — SignUpWidget tools.
 *
 * `submit_signup` replaces the widget's `no-llm.md` opt-out. It is a
 * mutate-category tool whose handler dispatches a `submitSignup` CanvasIntent
 * carrying the collected identity fields; the SignUpWidget registers a matching
 * adapter that runs its real register → claim → promote → commitGate sequence
 * (the SAME action the submit Button invokes).
 */
import { describe, expect, it } from "vitest";

import { tools } from "./SignUpWidget.tools";

describe("SignUpWidget tools", () => {
  it("declares submit_signup (mutate)", () => {
    expect(tools.map((t) => t.name)).toEqual(["submit_signup"]);
    expect(tools[0].category).toBe("mutate");
  });

  it("submit_signup produces a submitSignup intent from validated input", () => {
    const input = {
      first: "Ada",
      last: "Lovelace",
      email: "ada@example.com",
      password: "supersecret",
      confirmPassword: "supersecret",
    };
    expect(tools[0].handler(tools[0].input.parse(input))).toEqual({
      kind: "submitSignup",
      ...input,
    });
  });

  it("submit_signup rejects an empty email (real validation, no dormant tool)", () => {
    expect(
      tools[0].input.safeParse({
        first: "Ada",
        last: "Lovelace",
        email: "",
        password: "supersecret",
        confirmPassword: "supersecret",
      }).success,
    ).toBe(false);
  });

  it("description meets the Phase 5b quality bar", () => {
    expect(/use when|triggers when/i.test(tools[0].description)).toBe(true);
    expect(tools[0].description.length).toBeGreaterThanOrEqual(40);
  });
});
