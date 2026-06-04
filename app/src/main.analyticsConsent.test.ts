import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("frontend analytics bootstrap consent guard", () => {
  it("does not initialize PostHog or GA before React renders", () => {
    const source = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

    expect(source).not.toMatch(/\binitAnalytics\b/);
    expect(source).not.toMatch(/\binitGa\b/);
    expect(source).not.toMatch(/\bgaSetDefaults\b/);
    expect(source).not.toMatch(/VITE_POSTHOG_API_KEY|VITE_POSTHOG_HOST|VITE_GA_MEASUREMENT_ID|VITE_LLM_PROVIDER/);
  });
});
