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
    it("takes no arguments and declares its suggested-action renderer", () => {
      expect(t.input.parse({})).toEqual({});
      expect(t.rendersWidget).toBe("chat-widgets/SuggestedActionChips");
    });
    it("is exposed on the analysis surfaces where a user saves mid-flow", () => {
      expect(t.availableSteps).toEqual(expect.arrayContaining(["doc-viewer", "interact-chat"]));
    });
  });

  describe("commit_gate", () => {
    const t = byName("commit_gate");
    it("accepts a register method", () => {
      expect(t.input.parse({ method: "register" })).toEqual({ method: "register" });
    });
    it("accepts sso + engineer-call", () => {
      expect(t.input.parse({ method: "sso" })).toEqual({ method: "sso" });
      expect(t.input.parse({ method: "engineer-call" })).toEqual({ method: "engineer-call" });
    });
    it("rejects unknown methods", () => {
      expect(t.input.safeParse({ method: "magic" }).success).toBe(false);
    });
  });

  describe("dismiss_gate", () => {
    const t = byName("dismiss_gate");
    it("takes no arguments", () => {
      expect(t.input.parse({})).toEqual({});
    });
  });

  it("descriptions meet Phase 5b quality bar", () => {
    for (const t of tools) {
      expect(/use when|triggers when/i.test(t.description)).toBe(true);
      expect(t.description.length).toBeGreaterThanOrEqual(40);
    }
  });
});
