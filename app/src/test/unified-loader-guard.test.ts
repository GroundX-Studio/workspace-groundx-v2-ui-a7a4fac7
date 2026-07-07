import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * unified-loader §1.9 — universality drift guard (mirrors the
 * widget-contract guard style). One loading treatment, app-wide:
 *
 * 1. `LoadingDots` is RETIRED — the directory is gone and no source file
 *    references it (comments included: stale docs re-seed forks).
 * 2. Every ENUMERATED loading surface consumes the shared primitive
 *    (`Loading` boundary in place of content, or the bare `BreathingMark`
 *    alongside content) — a bespoke loader re-appearing here turns RED.
 */

const SRC = join(__dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("unified-loader — one loading treatment (§1.9)", () => {
  it("LoadingDots no longer exists (directory + references)", () => {
    expect(existsSync(join(SRC, "components/primitives/LoadingDots"))).toBe(false);
    const offenders = walk(SRC)
      .filter((p) => !p.endsWith("unified-loader-guard.test.ts"))
      .filter((p) => readFileSync(p, "utf8").includes("LoadingDots"));
    expect(offenders, `LoadingDots references survive in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("every enumerated loading surface uses the shared primitive", () => {
    const surfaces: Array<[string, RegExp]> = [
      // viewer blocking loads → the boundary
      ["components/viewer-widgets/PdfViewer/PdfViewerWidget.tsx", /from "@\/components\/primitives\/Loading\/Loading"/],
      ["components/viewer-widgets/Extract/Extract.tsx", /from "@\/components\/primitives\/Loading\/Loading"/],
      ["components/viewer-widgets/SmartReportRender/SmartReportRender.tsx", /from "@\/components\/primitives\/Loading\/Loading"/],
      ["components/viewer-widgets/BookCallView/BookCallView.tsx", /from "@\/components\/primitives\/Loading\/Loading"/],
      // alongside-content placements → the bare mark
      ["components/layout/ViewerWidgetFrame/ViewerWidgetFrame.tsx", /from "@\/components\/primitives\/Loading\/BreathingMark"/],
      ["components/chat-widgets/GateChatPanel/GateChatPanel.tsx", /from "@\/components\/primitives\/Loading\/BreathingMark"/],
      ["components/chat-widgets/GateChatRail/GateChatRail.tsx", /from "@\/components\/primitives\/Loading\/BreathingMark"/],
      ["conversation/chatPrimitives.tsx", /from "@\/components\/primitives\/Loading\/BreathingMark"/],
    ];
    for (const [rel, pattern] of surfaces) {
      const content = readFileSync(join(SRC, rel), "utf8");
      expect(pattern.test(content), `${rel} must use the shared loading primitive`).toBe(true);
    }
  });

  it("Integrate renders no loading mark (no load to wait on)", () => {
    const integrateDir = join(SRC, "components/viewer-widgets/Integrate");
    if (!existsSync(integrateDir)) return; // surface not built yet
    for (const p of walk(integrateDir)) {
      const content = readFileSync(p, "utf8");
      expect(content.includes("BreathingMark") || content.includes("primitives/Loading/Loading")).toBe(false);
    }
  });
});
