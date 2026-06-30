/**
 * 2026-05-31-onboarding-experiences — the Workspace `ChatExperience`.
 *
 * Steady variant of `makeOnboardingExperience`: an Intro (scope summary +
 * pick-view pills, NO scripted ThinkingStream) and NO Choreography (steady —
 * no f3/f5 frame auto-advance). The factory closes over a `ContentScope` whose
 * `bucket` arm identifies the workspace; the catalog entry's `configSchema`
 * parses a `ContentScope` and rejects a non-scope arg.
 */
import { describe, expect, it } from "vitest";
import type { ContentScope } from "@groundx/shared";

import { makeWorkspaceExperience, experience } from "./experience";
import { chatExperienceRegistry } from "@/conversation/chatExperienceRegistry";

const WORKSPACE_SCOPE: ContentScope = { type: "bucket", bucketId: 28454 };

describe("makeWorkspaceExperience", () => {
  it("returns a ChatExperience with an Intro and NO Choreography (steady — no frame auto-advance)", () => {
    const exp = makeWorkspaceExperience({ scope: WORKSPACE_SCOPE });
    expect(typeof exp.Intro).toBe("function");
    // Steady experiences do not own engine-lifecycle frame advances.
    expect(exp.Choreography).toBeUndefined();
  });

  it("threads the closed-over scope's bucket into the grounding scopeHint", () => {
    const exp = makeWorkspaceExperience({ scope: WORKSPACE_SCOPE });
    // The workspace bucket id must be discoverable on the grounding hint so the
    // grounded LLM knows what corpus the user is looking at.
    expect(exp.scopeHint?.scenarioTitle).toContain("28454");
  });

  it("does NOT render a scripted ThinkingStream in its Intro", () => {
    // The onboarding experience hardcodes a `thinkingScript`; the workspace
    // experience must not — it is a steady summary, not a scripted reading beat.
    const exp = makeWorkspaceExperience({ scope: WORKSPACE_SCOPE });
    // A ChatExperience never exposes a thinkingScript field; absence is the
    // contract. (This guards against accidentally porting the scripted intro.)
    expect((exp as Record<string, unknown>).thinkingScript).toBeUndefined();
  });
});

describe("workspace experience catalog entry", () => {
  it("has id 'workspace'", () => {
    expect(experience.id).toBe("workspace");
  });

  it("configSchema parses a ContentScope-bearing config and create() yields a ChatExperience", () => {
    const exp = experience.create({ scope: WORKSPACE_SCOPE });
    expect(typeof exp.Intro).toBe("function");
  });

  it("configSchema rejects a non-scope arg", () => {
    expect(() => experience.create({ scope: { type: "nonsense" } })).toThrow();
    expect(() => experience.create({})).toThrow();
  });

  it("is glob-discovered by chatExperienceRegistry under id 'workspace'", () => {
    const entry = chatExperienceRegistry.byId("workspace");
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("workspace");
    // create() validates via the entry's own configSchema.
    const exp = entry!.create({ scope: WORKSPACE_SCOPE });
    expect(typeof exp.Intro).toBe("function");
  });
});
