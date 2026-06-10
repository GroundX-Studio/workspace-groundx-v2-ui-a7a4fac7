import { describe, it } from "vitest";

import { intentFixtures } from "./fixtures";
import { replayIntentFixture } from "./replayIntent";

/**
 * Drives every FE intent fixture through the REAL derivation → dispatch → sink
 * pipeline with the LLM mocked (zero LLM calls). Each fixture asserts its own
 * sink state. T2 = `highlightCitation` only; T3 fans out to all 30.
 */
describe("intent fixtures — replay through the real pipeline (no LLM)", () => {
  for (const fixture of intentFixtures) {
    it(`${fixture.kind}: ${fixture.trigger.via}-trigger reaches its sink`, async () => {
      await replayIntentFixture(fixture);
    });
  }
});
