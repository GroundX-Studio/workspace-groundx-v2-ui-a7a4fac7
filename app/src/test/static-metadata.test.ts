import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const readAppFile = (path: string) => readFileSync(new URL(path, `file://${process.cwd()}/`), "utf8");

describe("static metadata", () => {
  it("publishes a concise app description in the document head", () => {
    const indexHtml = readAppFile("index.html");
    const description = indexHtml.match(/<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/i)?.[1];
    const faviconHref = indexHtml.match(/<link\s+rel="icon"\s+type="image\/png"\s+href="([^"]+)"\s*\/?>/i)?.[1];

    expect(description).toBeDefined();
    expect(description).toMatch(/GroundX Studio/);
    expect(description?.length).toBeGreaterThanOrEqual(50);
    expect(description?.length).toBeLessThanOrEqual(160);

    expect(faviconHref).toBe("/assets/logos/groundx-studio-color.png");
    expect(existsSync(new URL(`public${faviconHref}`, `file://${process.cwd()}/`))).toBe(true);
  });

  it("publishes crawler and AI-assistant guidance without deploy-specific hosts", () => {
    const robotsTxt = readAppFile("public/robots.txt");
    const llmsTxt = readAppFile("public/llms.txt");

    expect(robotsTxt).toMatch(/^User-agent:\s*\*/m);
    expect(robotsTxt).toMatch(/^Allow:\s*\/$/m);
    expect(robotsTxt).not.toMatch(/localhost|127\.0\.0\.1|https?:\/\//i);

    expect(llmsTxt).toMatch(/^# GroundX Studio$/m);
    expect(llmsTxt).toMatch(/GroundX Studio is a document AI workspace/i);
    expect(llmsTxt).toMatch(/## Notes for AI assistants/);
    expect(llmsTxt).toMatch(/\[[^\]]+\]\(\/[^)]+\)/);
    expect(llmsTxt).not.toMatch(/localhost|127\.0\.0\.1|https?:\/\//i);
  });
});
