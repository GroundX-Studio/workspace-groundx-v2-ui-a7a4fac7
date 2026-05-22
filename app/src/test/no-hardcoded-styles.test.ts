/**
 * Regression guard for token discipline.
 *
 * The F1 component graph went through multiple audits to lift hardcoded
 * `fontSize`, `fontWeight`, `borderRadius`, and viewport-unit literals
 * into brand or chrome tokens. This test fails if any of those literals
 * sneak back in.
 *
 * Per TDD discipline: if a test cannot be written for "no hardcoded
 * styles," there is no forcing function and the rule decays into vibes.
 * This is the forcing function.
 *
 * Scope: the F1 component graph plus the shared primitives created for
 * it. Other parts of the app may legitimately have inline literals
 * (e.g. third-party icon sizing). Extend the FILES list as the rule
 * propagates.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

const FILES = [
  "views/Onboarding/IngestView.tsx",
  "views/Onboarding/OnboardingShell.tsx",
  "shared/components/StepStrip/StepStrip.tsx",
  "shared/components/SampleScenarioCard.tsx",
  "shared/components/ByoTile.tsx",
  "shared/components/CapabilityBadge.tsx",
];

interface ForbiddenPattern {
  name: string;
  regex: RegExp;
  hint: string;
}

const FORBIDDEN: ForbiddenPattern[] = [
  {
    name: "numeric fontSize",
    regex: /fontSize:\s*[0-9]+(\.[0-9]+)?\s*[,}]/g,
    hint: "use a FONT_SIZE_* token from @/constants",
  },
  {
    name: "numeric fontWeight",
    regex: /fontWeight:\s*[0-9]+\s*[,}]/g,
    hint: "use FONT_WEIGHT_HEADLINE/LABEL/MEDIUM/BODY from @/constants",
  },
  {
    name: "numeric borderRadius",
    regex: /borderRadius:\s*[0-9]+(\.[0-9]+)?\s*[,}]/g,
    hint: "use a BORDER_RADIUS_* token or a chrome STEP_*_RADIUS token",
  },
  {
    name: "viewport-unit maxHeight/minHeight string literal",
    regex: /(maxHeight|minHeight):\s*["'][0-9]+(vh|vw)["']/g,
    hint: "extract to a chrome token (e.g. GATE_DRAWER_MAX_HEIGHT)",
  },
  {
    name: "hex color literal",
    regex: /["']#[0-9a-fA-F]{3,8}["']/g,
    hint: "use a brand color token from @/constants",
  },
];

describe("no hardcoded styles in F1 component graph", () => {
  // Meta-test: prove the FORBIDDEN regexes would catch known-bad samples.
  // Without this, a regex bug could silently make every file-check pass.
  it("FORBIDDEN regexes catch known-bad samples (self-test)", () => {
    const samples: Array<{ name: string; sample: string; expectMatch: number }> = [
      { name: "numeric fontSize", sample: "{ fontSize: 12, color: 'red' }", expectMatch: 1 },
      { name: "numeric fontWeight", sample: "{ fontWeight: 700 }", expectMatch: 1 },
      { name: "numeric borderRadius", sample: "{ borderRadius: 14 }", expectMatch: 1 },
      {
        name: "viewport-unit maxHeight/minHeight string literal",
        sample: "{ maxHeight: '90vh' }",
        expectMatch: 1,
      },
      { name: "hex color literal", sample: "{ color: '#ff0000' }", expectMatch: 1 },
    ];
    for (const { name, sample, expectMatch } of samples) {
      const rule = FORBIDDEN.find((p) => p.name === name);
      expect(rule, `no rule named ${name}`).toBeDefined();
      rule!.regex.lastIndex = 0;
      const matches = sample.match(rule!.regex) ?? [];
      expect(matches.length, `regex for ${name} should match ${expectMatch} time(s) in ${sample}`).toBe(expectMatch);
    }
  });

  for (const file of FILES) {
    it(`${file} contains no forbidden style literals`, () => {
      const content = readFileSync(resolve(SRC, file), "utf8");
      const violations: string[] = [];
      for (const { name, regex, hint } of FORBIDDEN) {
        regex.lastIndex = 0;
        const matches = content.match(regex);
        if (matches) {
          for (const m of matches) {
            violations.push(`  ${name}: \`${m.trim()}\` — ${hint}`);
          }
        }
      }
      if (violations.length > 0) {
        throw new Error(
          `Found ${violations.length} hardcoded style literal(s) in ${file}:\n${violations.join("\n")}`
        );
      }
    });
  }
});
