import { describe, expect, it } from "vitest";

/**
 * harden-citation-emission T1b — the merged MUST-cite citations contract
 * (RED first: `citationsContract` does not exist yet; dynamic import keeps
 * the failure a test failure, not a module-load failure).
 *
 * Assertions are scoped to the CONTRACT FRAGMENT — not the assembled system
 * prompt, whose skill-knowledge / tool-notes sections may legitimately embed
 * fences of their own.
 */
describe("citationsContract (merged MUST-cite contract)", () => {
  const load = async () => {
    const mod = (await import("./fragments.js")) as Record<string, unknown>;
    return mod.citationsContract as ((hasExtraction: boolean) => string) | undefined;
  };

  it("exports the citationsContract(hasExtraction) builder", async () => {
    const citationsContract = await load();
    expect(typeof citationsContract).toBe("function");
  });

  it("requires the block for content claims and scopes the skip license to non-content turns", async () => {
    const citationsContract = (await load())!;
    const c = citationsContract(true);
    // MUST-cite for content claims…
    expect(c).toMatch(/MUST end .*citations/is);
    // …skip license names non-content turns only, and the permissive MAY is gone.
    expect(c).toMatch(/greeting|small talk|product question/i);
    expect(c).not.toContain("MAY append");
  });

  it("shows exactly ONE example fence with BOTH entry forms when extraction is present", async () => {
    const citationsContract = (await load())!;
    const c = citationsContract(true);
    expect((c.match(/```json/gi) ?? []).length).toBe(1);
    expect(c).toContain('"quote"');
    expect(c).toContain('"field"');
    // The truncation marker is never citable.
    expect(c).toContain("_truncated");
  });

  it("shows exactly ONE example fence with only the quote form without extraction", async () => {
    const citationsContract = (await load())!;
    const c = citationsContract(false);
    expect((c.match(/```json/gi) ?? []).length).toBe(1);
    expect(c).toContain('"quote"');
    expect(c).not.toContain('"field"');
  });

  it("frames verification as confidence tiers, not threats of dropping", async () => {
    const citationsContract = (await load())!;
    for (const hasExtraction of [true, false]) {
      const c = citationsContract(hasExtraction);
      expect(c).not.toMatch(/dropped|drops the rest/i);
      expect(c).toMatch(/lower confidence/i);
    }
  });
});
