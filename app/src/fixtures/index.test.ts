import { describe, expect, it } from "vitest";

import { getScenarioFixture, scenarioFixtures } from "./index";

describe("scenario fixtures (placeholders, shape locked)", () => {
  it("provides all three required scenarios", () => {
    expect(Object.keys(scenarioFixtures).sort()).toEqual(["loan", "solar", "utility"]);
  });

  it("utility fixture: 1 doc, schema with statement + meters", () => {
    const fixture = getScenarioFixture("utility");
    expect(fixture.docs).toHaveLength(1);
    expect(fixture.schema).toBeDefined();
    expect(fixture.schema?.categories.map((c) => c.type).sort()).toEqual(["meters", "statement"]);
    // E badge only for utility
    expect(fixture.hero.badges).toEqual(["E"]);
  });

  it("loan fixture: 12 docs, schema with income + debt + anomalies", () => {
    const fixture = getScenarioFixture("loan");
    expect(fixture.docs).toHaveLength(12);
    expect(fixture.schema?.categories.map((c) => c.id)).toEqual(["income", "debt", "anomalies"]);
    expect(fixture.hero.badges).toEqual(["E", "I"]);
  });

  it("solar fixture: 142 docs, no schema (interact + report), has report", () => {
    const fixture = getScenarioFixture("solar");
    expect(fixture.docs).toHaveLength(142);
    expect(fixture.schema).toBeUndefined();
    expect(fixture.report).toBeDefined();
    expect(fixture.report?.sections).toHaveLength(4);
    expect(fixture.hero.badges).toEqual(["I", "R"]);
  });

  it("every fixture has a chat script with at least one user + assistant pair", () => {
    for (const scenario of ["utility", "loan", "solar"] as const) {
      const fixture = getScenarioFixture(scenario);
      const roles = fixture.chatScript.map((t) => t.role);
      expect(roles).toContain("user");
      expect(roles).toContain("assistant");
    }
  });

  it("citations reference doc ids that exist in the same fixture", () => {
    for (const scenario of ["utility", "loan", "solar"] as const) {
      const fixture = getScenarioFixture(scenario);
      const docIds = new Set(fixture.docs.map((d) => d.id));
      const allCitations = [
        ...fixture.chatScript.flatMap((t) => t.citations ?? []),
        ...(fixture.schema?.categories.flatMap((c) => c.fields.flatMap((f) => f.citations)) ?? []),
      ];
      for (const cite of allCitations) {
        expect(docIds.has(cite.documentId), `${scenario}: citation ${cite.documentId} not in docs`).toBe(true);
      }
    }
  });
});
