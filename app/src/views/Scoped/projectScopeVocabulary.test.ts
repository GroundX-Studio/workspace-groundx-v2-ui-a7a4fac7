import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");
const guarded = [
  "views/Scoped/ScopedConversationShell.tsx",
  "views/Scoped/ScopedConversationShell.test.tsx",
  "conversation/experiences/scopedChatExperience.tsx",
  "conversation/experiences/project/experience.test.tsx",
];

describe("project scoped route vocabulary", () => {
  it("uses filter.projectId, not filter.project, in scoped project surfaces", () => {
    const offenders = guarded.filter((rel) => {
      const source = readFileSync(resolve(ROOT, rel), "utf8");
      return /filter\s*:\s*\{\s*project\s*:|filter\?\.project\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
