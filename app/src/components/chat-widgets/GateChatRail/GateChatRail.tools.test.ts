/**
 * widget-llm-integration follow-up B.2 — GateChatRail tools.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./GateChatRail.tools";

const byName = (n: string) => tools.find((t) => t.name === n)!;

describe("GateChatRail tools", () => {
  it("declares commit_gate + dismiss_gate + save_to_account (all mutate)", () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      "commit_gate",
      "dismiss_gate",
      "save_to_account",
    ]);
    for (const t of tools) expect(t.category).toBe("mutate");
  });

  describe("save_to_account", () => {
    const t = byName("save_to_account");
    it("takes no arguments and produces an openGate(save) intent", () => {
      expect(t.handler(t.input.parse({}))).toEqual({ kind: "openGate", trigger: "save" });
    });
    it("is exposed on the analysis surfaces where a user saves mid-flow", () => {
      expect(t.availableSteps).toEqual(expect.arrayContaining(["doc-viewer", "interact-chat"]));
    });
  });

  describe("commit_gate", () => {
    const t = byName("commit_gate");
    it("accepts a register method", () => {
      expect(t.handler(t.input.parse({ method: "register" }))).toEqual({
        kind: "commitGate",
        method: "register",
      });
    });
    it("accepts sso + engineer-call", () => {
      expect(t.handler(t.input.parse({ method: "sso" }))).toMatchObject({ method: "sso" });
      expect(t.handler(t.input.parse({ method: "engineer-call" }))).toMatchObject({
        method: "engineer-call",
      });
    });
    it("rejects unknown methods", () => {
      expect(t.input.safeParse({ method: "magic" }).success).toBe(false);
    });
  });

  describe("dismiss_gate", () => {
    const t = byName("dismiss_gate");
    it("takes no arguments and produces dismissGate intent", () => {
      expect(t.handler(t.input.parse({}))).toEqual({ kind: "dismissGate" });
    });
  });

  it("descriptions meet Phase 5b quality bar", () => {
    for (const t of tools) {
      expect(/use when|triggers when/i.test(t.description)).toBe(true);
      expect(t.description.length).toBeGreaterThanOrEqual(40);
    }
  });
});
