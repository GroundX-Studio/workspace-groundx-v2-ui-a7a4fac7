import { describe, expect, it } from "vitest";

import { SAMPLE_SCENARIOS } from "./sampleScenarios.js";

/**
 * The onboarding "reading …" thinking script narrates what the parser found in
 * the sample document. Those values must MATCH the real bill — a placeholder
 * number reads as a bug to anyone comparing the script to the open document.
 * The City of Windom utility bill's header identifier is invoice 10295809
 * (its "Account Number:" field is blank on the printed statement).
 */
describe("SAMPLE_SCENARIOS utility thinkingScript", () => {
  const utility = SAMPLE_SCENARIOS.find((s) => s.id === "utility");

  it("narrates the real bill invoice number, never a placeholder", () => {
    expect(utility).toBeDefined();
    const script = utility!.manifest.thinkingScript;
    const headerLine = script.find((line) => line.includes("header"));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain("10295809");
    expect(script.join(" ")).not.toContain("1023456");
  });
});
