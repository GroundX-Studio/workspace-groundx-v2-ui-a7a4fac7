/**
 * Regression guard for token discipline.
 *
 * Every file under `components/` + `views/` must resolve visible
 * styles through theme tokens — no inline `fontSize: 13`, no hex
 * literals, no raw `borderRadius: 6`, no numeric `fontWeight: 700`.
 *
 * Per TDD discipline: if a test cannot be written for "no hardcoded
 * styles," there is no forcing function and the rule decays into
 * vibes. This is the forcing function.
 *
 * Coverage history:
 *   - Original (2026-05-25): 6 F1-only files explicit in `FILES`.
 *   - ARCH-17 (2026-05-26): auto-discover every `.tsx` under
 *     `components/` + `views/`. Use `EXEMPT` for the 16 files with
 *     historical offenders pending ARCH-19/20 cleanup; use
 *     `ASSET_ALLOWLIST` for files where third-party brand colors
 *     are legitimately literal (e.g. ConnectorGlyph renders Box,
 *     Microsoft, Google logos at their actual brand hex values).
 *
 * Failure mode the test prevents: a new component lands with
 * `<Typography sx={{ fontSize: 13, color: "#29335c" }}>` instead of
 * `<BodyText>` or `<Heading level="h4">`. CI blocks the merge until
 * the contributor uses a primitive or extracts a token.
 *
 * Cleanup ladder for the EXEMPT list (run during ARCH-19/20 view
 * migrations): pick a file, replace inline literals with theme
 * tokens / primitives, remove from EXEMPT, watch the test still
 * pass. Repeat. When EXEMPT is empty, the rule is fully enforced.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

/**
 * Files where third-party brand hex literals are legitimate.
 * Reviewed manually 2026-05-26. Anything added here needs a comment
 * explaining what third-party brand the literals belong to.
 */
const ASSET_ALLOWLIST = new Set<string>([
  // Renders real third-party connector logos (Box, Microsoft, Google,
  // Dropbox, etc.) at their actual brand hex values. Those colors are
  // externally owned and can't be tokenized into the GroundX brand
  // palette.
  "components/brand/ConnectorGlyph/ConnectorGlyph.tsx",
]);

/**
 * Files with historical inline literals that ARCH-19/20 (view
 * migrations to new primitives) will clean up. Each row carries the
 * offender count at the time of ARCH-17 expansion (2026-05-26) so
 * the cleanup progress is visible. To remove a row: replace its
 * inline literals with theme tokens / primitives, ensure the test
 * still passes (it now exercises that file), and delete the row.
 *
 * INVARIANT: this list is monotonically shrinking. Never add a new
 * file here unless you can name the ARCH-19/20 sub-task that will
 * clean it.
 */
const EXEMPT_OFFENDER_COUNTS: Record<string, number> = {
  "components/layout/AppErrorBoundary/AppErrorBoundary.tsx": 14,
  "components/layout/AppShell/AppShell.tsx": 6,
  "components/layout/OnboardingNav/OnboardingNav.tsx": 7,
  "components/chat-widgets/BookingStatusCard/BookingStatusCard.tsx": 6,
  "components/brand/CiteChip/CiteChip.tsx": 3,
  "components/brand/DocThumb/DocThumb.tsx": 1,
  "components/viewer-widgets/PdfViewer/PdfViewerWidget.tsx": 1,
  "views/Auth/AuthLayout.tsx": 1,
  "views/Banned/Banned.tsx": 1,
  "views/Onboarding/NavDebugOverlay.tsx": 12,
  "views/Onboarding/OnboardingChatColumn.tsx": 8,
  "views/Onboarding/IntegrateView.tsx": 4,
  "views/Onboarding/ExtractView.tsx": 3,
  "views/Onboarding/InteractView.tsx": 2,
  "views/Steady/SteadyShell/SessionSwitcher.tsx": 3,
};
const EXEMPT = new Set(Object.keys(EXEMPT_OFFENDER_COUNTS));

interface ForbiddenPattern {
  name: string;
  regex: RegExp;
  hint: string;
}

const FORBIDDEN: ForbiddenPattern[] = [
  {
    name: "numeric fontSize",
    regex: /fontSize:\s*[0-9]+(\.[0-9]+)?\s*[,}]/g,
    hint: "use a FONT_SIZE_* token, an ONBOARDING_*_FONT_SIZE token, or a typography primitive (Heading / BodyText / Label / Caption)",
  },
  {
    name: "numeric fontWeight",
    regex: /fontWeight:\s*[0-9]+\s*[,}]/g,
    hint: "use FONT_WEIGHT_HEADLINE / LABEL / MEDIUM / BODY from @/constants",
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

function walkTsx(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(abs, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      out.push(abs);
    }
  }
  return out;
}

function countOffenders(content: string): number {
  let total = 0;
  for (const { regex } of FORBIDDEN) {
    regex.lastIndex = 0;
    const matches = content.match(regex);
    if (matches) total += matches.length;
  }
  return total;
}

function violationsFor(content: string): string[] {
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
  return violations;
}

describe("no hardcoded styles across components/ + views/", () => {
  // Meta: prove the regexes catch known-bad samples.
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
      expect(matches.length, `regex for ${name} should match ${expectMatch}× in ${sample}`).toBe(
        expectMatch,
      );
    }
  });

  const scope = [
    resolve(SRC, "components"),
    resolve(SRC, "views"),
  ];

  const allFiles = scope.flatMap((dir) => walkTsx(dir)).sort();
  expect(allFiles.length).toBeGreaterThan(0); // sanity

  // Sanity: every entry in EXEMPT_OFFENDER_COUNTS still exists in
  // the file tree. If a file is renamed / deleted, the exemption is
  // stale and must be removed.
  it("EXEMPT entries all reference real files (sanity)", () => {
    const found = new Set(
      allFiles.map((abs) => relative(SRC, abs)),
    );
    for (const exempt of EXEMPT) {
      expect(
        found.has(exempt),
        `EXEMPT entry "${exempt}" doesn't match any file in scope — has it been moved or deleted? Update the exemption list.`,
      ).toBe(true);
    }
  });

  // Sanity: every entry in ASSET_ALLOWLIST still exists too.
  it("ASSET_ALLOWLIST entries all reference real files (sanity)", () => {
    const found = new Set(
      allFiles.map((abs) => relative(SRC, abs)),
    );
    for (const asset of ASSET_ALLOWLIST) {
      expect(
        found.has(asset),
        `ASSET_ALLOWLIST entry "${asset}" doesn't match any file in scope — has it been moved or deleted? Update the allowlist.`,
      ).toBe(true);
    }
  });

  // Sanity: the EXEMPT_OFFENDER_COUNTS entries should monotonically
  // shrink. If an exempted file now has FEWER offenders than the
  // recorded count, the count needs to be updated downward. If MORE,
  // someone added drift to an exempt file (still bad — they should
  // have fixed instead of grown).
  it("EXEMPT offender counts are accurate (drift sentry)", () => {
    const drift: string[] = [];
    for (const [rel, expected] of Object.entries(EXEMPT_OFFENDER_COUNTS)) {
      const abs = resolve(SRC, rel);
      const content = readFileSync(abs, "utf8");
      const actual = countOffenders(content);
      if (actual !== expected) {
        drift.push(`  ${rel}: expected ${expected}, found ${actual}`);
      }
    }
    if (drift.length > 0) {
      throw new Error(
        `EXEMPT counts out of sync. Update EXEMPT_OFFENDER_COUNTS in this file to reflect the new totals, OR (preferably) clean up the inline literals and remove the entry. Drift:\n${drift.join("\n")}`,
      );
    }
  });

  for (const abs of allFiles) {
    const rel = relative(SRC, abs);
    if (ASSET_ALLOWLIST.has(rel)) continue;
    if (EXEMPT.has(rel)) continue;

    it(`${rel} contains no forbidden style literals`, () => {
      const content = readFileSync(abs, "utf8");
      const violations = violationsFor(content);
      if (violations.length > 0) {
        throw new Error(
          `Found ${violations.length} hardcoded style literal(s) in ${rel}:\n${violations.join("\n")}\n\n` +
            `If this file is mid-migration to primitives, you may add it to EXEMPT_OFFENDER_COUNTS in ` +
            `app/src/test/no-hardcoded-styles.test.ts with its offender count and a TODO(ARCH-19) or TODO(ARCH-20) ` +
            `reference. Prefer fixing over exempting.`,
        );
      }
    });
  }
});
