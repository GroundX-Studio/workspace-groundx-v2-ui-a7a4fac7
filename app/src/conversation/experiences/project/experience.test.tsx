/**
 * 2026-05-31-onboarding-experiences — the Project `ChatExperience`.
 *
 * Same shape as the Workspace experience (steady: Intro + NO Choreography),
 * id `project`, closing over a `ContentScope` whose `filter` carries the
 * project field/value (project == doc-filter value within a workspace bucket).
 */
import { describe, expect, it } from "vitest";
import type { ContentScope } from "@groundx/shared";

import { makeProjectExperience, experience } from "./experience";
import { chatExperienceRegistry } from "@/conversation/chatExperienceRegistry";

const PROJECT_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

describe("makeProjectExperience", () => {
  it("returns a ChatExperience with an Intro and NO Choreography (steady)", () => {
    const exp = makeProjectExperience({ scope: PROJECT_SCOPE });
    expect(typeof exp.Intro).toBe("function");
    expect(exp.Choreography).toBeUndefined();
  });

  it("threads the closed-over scope's project filter into the grounding scopeHint", () => {
    const exp = makeProjectExperience({ scope: PROJECT_SCOPE });
    // The project filter field/value must round-trip onto the grounding hint.
    expect(exp.scopeHint?.scenarioTitle).toContain("utility");
  });
});

describe("project experience catalog entry", () => {
  it("has id 'project'", () => {
    expect(experience.id).toBe("project");
  });

  it("configSchema parses a filter-bearing ContentScope and create() yields a ChatExperience", () => {
    const exp = experience.create({ scope: PROJECT_SCOPE });
    expect(typeof exp.Intro).toBe("function");
  });

  it("configSchema rejects a non-scope arg", () => {
    expect(() => experience.create({ scope: { type: "nonsense" } })).toThrow();
    expect(() => experience.create({})).toThrow();
  });

  it("is glob-discovered by chatExperienceRegistry under id 'project'", () => {
    const entry = chatExperienceRegistry.byId("project");
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("project");
    const exp = entry!.create({ scope: PROJECT_SCOPE });
    expect(typeof exp.Intro).toBe("function");
  });

  it("the workspace and project entries have distinct ids", () => {
    const ids = chatExperienceRegistry.all().map((e) => e.id);
    expect(ids).toContain("workspace");
    expect(ids).toContain("project");
    expect(ids).toContain("onboarding");
    // Unique-id invariant: no collision among the three.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
