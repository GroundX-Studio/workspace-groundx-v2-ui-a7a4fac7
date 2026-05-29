/**
 * widget-llm-integration follow-up B.1 — ProposeSchemaFieldCard tools.
 *
 * Pins the three tools the card owns:
 *
 *   • `propose_schema_field` — the LLM proposes adding a field
 *     (replaces the fenced-JSON `proposedSchemaField` path)
 *   • `accept_proposal` — agent auto-accept (mutate)
 *   • `reject_proposal` — agent auto-reject (mutate)
 *
 * All three are mutate-category, so the chat router surfaces them
 * on `reply.suggestedActions[]` (key `tool:<name>`) for the user to
 * confirm via chip click. The `propose_schema_field` also gets a
 * back-compat mirror onto `reply.proposedSchemaField` so the
 * existing inline card render keeps working through the A.4
 * migration window.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./ProposeSchemaFieldCard.tools";

const byName = (name: string) => tools.find((t) => t.name === name)!;

describe("ProposeSchemaFieldCard tools", () => {
  it("declares the three expected tools", () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["accept_proposal", "propose_schema_field", "reject_proposal"]);
  });

  it("every tool is mutate-category (state-changing; user-confirmed)", () => {
    for (const tool of tools) {
      expect(tool.category, `${tool.name} should be mutate`).toBe("mutate");
    }
  });

  describe("propose_schema_field", () => {
    const tool = byName("propose_schema_field");

    it("accepts a valid payload + builds a proposeSchemaField intent", () => {
      const parsed = tool.input.parse({
        categoryId: "statement",
        name: "total_tax",
        type: "NUMBER",
        description: "Total tax line item on the bill.",
      });
      expect(tool.handler(parsed)).toEqual({
        kind: "proposeSchemaField",
        categoryId: "statement",
        name: "total_tax",
        type: "NUMBER",
        description: "Total tax line item on the bill.",
      });
    });

    it("rejects an invalid type", () => {
      expect(
        tool.input.safeParse({
          categoryId: "c",
          name: "x",
          type: "FLOAT",
          description: "no",
        }).success,
      ).toBe(false);
    });
  });

  describe("accept_proposal", () => {
    const tool = byName("accept_proposal");

    it("accepts a proposalId + builds an acceptSchemaField intent", () => {
      const parsed = tool.input.parse({ proposalId: "prop_123" });
      expect(tool.handler(parsed)).toEqual({
        kind: "acceptSchemaField",
        proposalId: "prop_123",
      });
    });

    it("requires a non-empty proposalId", () => {
      expect(tool.input.safeParse({ proposalId: "" }).success).toBe(false);
    });
  });

  describe("reject_proposal", () => {
    const tool = byName("reject_proposal");

    it("accepts a proposalId + builds a rejectSchemaField intent", () => {
      const parsed = tool.input.parse({ proposalId: "prop_123" });
      expect(tool.handler(parsed)).toEqual({
        kind: "rejectSchemaField",
        proposalId: "prop_123",
      });
    });
  });

  it("every Zod field carries .describe() (Phase 5b quality rule)", () => {
    for (const tool of tools) {
      const shape = (tool.input as { _def: { shape: () => Record<string, { _def: { description?: string } }> } })._def.shape();
      for (const [field, spec] of Object.entries(shape)) {
        expect(
          spec._def.description?.length ?? 0,
          `${tool.name}.${field} is missing .describe()`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("every description has Use when / Triggers when (Phase 5b quality rule)", () => {
    for (const tool of tools) {
      expect(
        /use when|triggers when/i.test(tool.description),
        `${tool.name} missing "Use when" clause`,
      ).toBe(true);
      expect(tool.description.length).toBeGreaterThanOrEqual(40);
    }
  });
});
