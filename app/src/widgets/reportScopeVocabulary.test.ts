import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

const guarded = [
  "api/smartReport.test.ts",
  "components/viewer-widgets/SmartReportBuilder/README.md",
  "components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx",
  "components/viewer-widgets/SmartReportRender/README.md",
  "components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx",
  "test/makeFakeApi.ts",
  "test/makeFakeApi.test.ts",
  "views/Onboarding/OnboardingShell.tsx",
  "widgets/reportFixtures.ts",
  "widgets/reportFixtures.test.ts",
];

describe("Smart Report product scope vocabulary", () => {
  it("uses filter.projectId, not filter.project, in product report scopes", () => {
    const offenders = guarded.filter((rel) => {
      const source = readFileSync(resolve(ROOT, rel), "utf8");
      return /filter\s*:\s*\{\s*project\s*:|filter\?\.project\b|filter\.project\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
