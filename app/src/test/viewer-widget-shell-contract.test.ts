/**
 * Viewer widget shell contract drift guard.
 *
 * The viewer host owns pane chrome through ViewerWidgetFrame. Widgets own
 * content only: document controls, editors, forms, embeds, and content-level
 * events. This guard keeps the README policy, runtime frame descriptors, and
 * stable close handle ownership aligned.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ViewerWidgetFrame } from "@/components/layout/ViewerWidgetFrame/ViewerWidgetFrame";
import { scopedViewerWidgetRegistry } from "@/widgets/scopedViewerWidgetRegistryProduction";
import { viewerOverlayFrameDescriptors } from "@/views/Onboarding/viewerOverlayFrameDescriptors";
import type {
  ViewerChromePolicy,
  ViewerContentMode,
  ViewerFrameDescriptor,
} from "@/components/layout/ViewerWidgetFrame/viewerFrameDescriptor";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const PROJECT_ROOT = resolve(SRC, "..", "..");
const VIEWER_WIDGET_DIR = join(SRC, "components", "viewer-widgets");

const ALLOWED_README_POLICIES = [
  "framed",
  "edge-to-edge inside ViewerWidgetFrame",
  "hostless-exception",
] as const;

type ReadmePolicy = (typeof ALLOWED_README_POLICIES)[number];

interface ViewerChromeReadme {
  policy: ReadmePolicy;
  contentMode: ViewerContentMode;
  section: string;
  owner?: string;
  hostProofPath?: string;
}

const readmePolicyToChromePolicy: Record<ReadmePolicy, ViewerChromePolicy> = {
  framed: "framed",
  "edge-to-edge inside ViewerWidgetFrame": "edge-to-edge",
  "hostless-exception": "hostless-exception",
};

const registryDescriptorsByWidget = new Map<string, ViewerFrameDescriptor>(
  scopedViewerWidgetRegistry.all().map((mount) => {
    const byId: Record<string, string> = {
      "pdf-viewer": "PdfViewer",
      "extract-workbench": "Extract",
      "smart-report-render": "SmartReportRender",
      "smart-report-builder": "SmartReportBuilder",
      integrate: "Integrate",
    };
    return [byId[mount.descriptor.id], mount.descriptor.viewerFrame];
  }),
);

const runtimeDescriptorsByWidget = new Map<string, ViewerFrameDescriptor>([
  ...registryDescriptorsByWidget.entries(),
  ["SignUpWidget", viewerOverlayFrameDescriptors["sign-up"]],
  ["BookCallView", viewerOverlayFrameDescriptors["book-call"]],
]);

function listViewerWidgetNames(): string[] {
  return readdirSync(VIEWER_WIDGET_DIR)
    .filter((entry) => {
      const abs = join(VIEWER_WIDGET_DIR, entry);
      return statSync(abs).isDirectory() && !entry.startsWith("_");
    })
    .sort();
}

function parseViewerChromeSection(src: string): ViewerChromeReadme | null {
  const headerMatch = /^##\s+Viewer chrome\b.*$/m.exec(src);
  if (!headerMatch || headerMatch.index === undefined) return null;
  const afterHeader = src.slice(headerMatch.index + headerMatch[0].length);
  const nextHeaderIndex = afterHeader.search(/^##\s+/m);
  const section = nextHeaderIndex >= 0 ? afterHeader.slice(0, nextHeaderIndex) : afterHeader;
  const policy = /Policy:\s*`([^`]+)`/.exec(section)?.[1];
  const contentMode = /Content mode:\s*`([^`]+)`/.exec(section)?.[1];
  if (!policy || !contentMode) {
    throw new Error("Viewer chrome section must declare Policy and Content mode.");
  }
  if (!ALLOWED_README_POLICIES.includes(policy as ReadmePolicy)) {
    throw new Error(`Unsupported viewer chrome policy: ${policy}`);
  }
  if (!["centered-panel", "padded-scroll", "edge-to-edge", "embed"].includes(contentMode)) {
    throw new Error(`Unsupported viewer content mode: ${contentMode}`);
  }
  if (policy === "hostless-exception" && !/^Owner:\s+\S+/m.test(section)) {
    throw new Error("hostless-exception viewer chrome policy must name an Owner.");
  }
  const owner = /^Owner:\s+(.+)$/m.exec(section)?.[1]?.trim();
  const hostProofPath = /^Host proof:\s+`([^`]+)`/m.exec(section)?.[1]?.trim();
  if (policy === "hostless-exception" && !hostProofPath) {
    throw new Error("hostless-exception viewer chrome policy must name a Host proof file.");
  }
  return {
    policy: policy as ReadmePolicy,
    contentMode: contentMode as ViewerContentMode,
    section,
    owner,
    hostProofPath,
  };
}

function listProductionSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...listProductionSourceFiles(abs));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(abs);
  }
  return out;
}

describe("viewer widget shell contract", () => {
  it("fixture parser rejects a missing Viewer chrome section", () => {
    expect(parseViewerChromeSection("# Widget\n\n## Props\n")).toBeNull();
  });

  it("fixture parser rejects unsupported README policies", () => {
    expect(() =>
      parseViewerChromeSection(
        "## Viewer chrome\n\nPolicy: `floating-card`\nContent mode: `padded-scroll`\n",
      ),
    ).toThrow(/unsupported viewer chrome policy/i);
  });

  it("fixture parser accepts documented internal content close controls", () => {
    const parsed = parseViewerChromeSection(
      "## Viewer chrome\n\nPolicy: `framed`\nContent mode: `padded-scroll`\nAllowed content controls: row editor close.\n",
    );
    expect(parsed?.section).toContain("row editor close");
  });

  it("fixture parser requires hostless exceptions to name the owning host", () => {
    expect(() =>
      parseViewerChromeSection(
        "## Viewer chrome\n\nPolicy: `hostless-exception`\nContent mode: `padded-scroll`\n",
      ),
    ).toThrow(/hostless-exception.*owner/i);
  });

  it("fixture parser requires hostless exceptions to name a host proof file", () => {
    expect(() =>
      parseViewerChromeSection(
        "## Viewer chrome\n\nPolicy: `hostless-exception`\nContent mode: `padded-scroll`\nOwner: OnboardingShell\n",
      ),
    ).toThrow(/hostless-exception.*host proof/i);
  });

  it("every viewer widget README declares a valid Viewer chrome section", () => {
    const missing: string[] = [];
    const invalid: string[] = [];
    for (const name of listViewerWidgetNames()) {
      const readme = join(VIEWER_WIDGET_DIR, name, "README.md");
      if (!existsSync(readme)) continue;
      try {
        const parsed = parseViewerChromeSection(readFileSync(readme, "utf8"));
        if (!parsed) missing.push(readme);
      } catch (error) {
        invalid.push(`${readme}: ${(error as Error).message}`);
      }
    }
    expect(missing, `Missing ## Viewer chrome section:\n${missing.join("\n")}`).toEqual([]);
    expect(invalid, `Invalid ## Viewer chrome section:\n${invalid.join("\n")}`).toEqual([]);
  });

  it("README viewer chrome policy agrees with runtime frame descriptors", () => {
    const mismatches: string[] = [];
    for (const [name, descriptor] of runtimeDescriptorsByWidget.entries()) {
      const readme = join(VIEWER_WIDGET_DIR, name, "README.md");
      const parsed = parseViewerChromeSection(readFileSync(readme, "utf8"));
      if (!parsed) {
        mismatches.push(`${name}: missing README policy`);
        continue;
      }
      const expectedPolicy = readmePolicyToChromePolicy[parsed.policy];
      if (expectedPolicy !== descriptor.chromePolicy) {
        mismatches.push(
          `${name}: README policy ${parsed.policy} -> ${expectedPolicy}, descriptor ${descriptor.chromePolicy}`,
        );
      }
      if (parsed.contentMode !== descriptor.contentMode) {
        mismatches.push(
          `${name}: README content mode ${parsed.contentMode}, descriptor ${descriptor.contentMode}`,
        );
      }
    }
    expect(mismatches, `Viewer chrome descriptor mismatches:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("hostless exceptions name the owning host", () => {
    const missingOwners: string[] = [];
    const missingProofs: string[] = [];
    for (const name of listViewerWidgetNames()) {
      const readme = join(VIEWER_WIDGET_DIR, name, "README.md");
      if (!existsSync(readme)) continue;
      const parsed = parseViewerChromeSection(readFileSync(readme, "utf8"));
      if (parsed?.policy === "hostless-exception" && !/^Owner:\s+\S+/m.test(parsed.section)) {
        missingOwners.push(readme);
      }
      if (
        parsed?.policy === "hostless-exception" &&
        (!parsed.hostProofPath || !existsSync(resolve(PROJECT_ROOT, parsed.hostProofPath)))
      ) {
        missingProofs.push(readme);
      }
    }
    expect(
      missingOwners,
      `hostless-exception widgets must name the owning host:\n${missingOwners.join("\n")}`,
    ).toEqual([]);
    expect(
      missingProofs,
      `hostless-exception widgets must name an existing Host proof file:\n${missingProofs.join("\n")}`,
    ).toEqual([]);
  });

  it("hostless legacy GateValueProp is not mounted by the live onboarding shell", () => {
    const shell = readFileSync(join(SRC, "views", "Onboarding", "OnboardingShell.tsx"), "utf8");
    expect(shell).not.toContain("GateValueProp");
    expect(shell).toContain("SignUpWidget");
    expect(shell).toContain("ViewerWidgetFrame");
  });

  it("authenticated product route shells import neutral app nav, not onboarding nav", () => {
    const offenders: string[] = [];
    for (const rel of [
      join("views", "Scoped", "ScopedConversationShell.tsx"),
      join("views", "Steady", "SteadyShell", "SteadyShell.tsx"),
    ]) {
      const file = join(SRC, rel);
      const src = readFileSync(file, "utf8");
      if (src.includes("@/components/layout/OnboardingNav/OnboardingNav")) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `Authenticated product shells must use the neutral AppNav wrapper:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("top-level widget README examples route ScopedViewerWidgets through ScopedCanvas", () => {
    const directExamples: string[] = [];
    for (const name of registryDescriptorsByWidget.keys()) {
      const readme = join(VIEWER_WIDGET_DIR, name, "README.md");
      const src = readFileSync(readme, "utf8");
      if (/import\s+\{?\s*\w+.*viewer-widgets/.test(src)) {
        directExamples.push(readme);
      }
    }
    expect(
      directExamples,
      `ScopedViewerWidget README examples must show <ScopedCanvas>, not direct widget imports:\n${directExamples.join("\n")}`,
    ).toEqual([]);
  });

  it("legacy widget-owned host close handles are absent from production viewer widgets", () => {
    const offenders: string[] = [];
    for (const file of listProductionSourceFiles(VIEWER_WIDGET_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const handle of ["sign-up-viewer-close", "book-call-close"]) {
        if (src.includes(handle)) offenders.push(`${file}: ${handle}`);
      }
    }
    expect(offenders, `Widget-owned host close handles found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("ViewerWidgetFrame is the only production component that owns viewer-frame-close", () => {
    expect(ViewerWidgetFrame).toBeTypeOf("function");
    const files = listProductionSourceFiles(SRC).filter((file) =>
      readFileSync(file, "utf8").includes("viewer-frame-close"),
    );
    const allowed = join(SRC, "components", "layout", "ViewerWidgetFrame", "ViewerWidgetFrame.tsx");
    expect(
      files,
      `Only ViewerWidgetFrame may export the stable viewer-frame-close handle.`,
    ).toEqual([allowed]);
  });
});
