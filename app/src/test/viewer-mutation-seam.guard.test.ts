/**
 * standardized-viewer-control T10 — structural guard for the viewer-mutation
 * seam AND the retired onboarding-frame vocabulary.
 *
 * Two invariants, one forcing function:
 *
 *   (A) The viewer-step MUTATORS (`pushStep`, `mutateActiveStep`,
 *       `gotoDocViewer`, `showCitationRegions`, `clearCitationHighlight`,
 *       `clearCitationRegions`) AND the journey mutators (`pickScenario`,
 *       `returnToIngestPicker`) are reachable ONLY from the orchestration core
 *       — the orchestrator's `dispatch` plus the session-state core it drives.
 *       NO component, view, or chat-experience module may CALL a mutator or
 *       destructure one out of `useChatStore()`. Design §3.3: "Bypass is made
 *       unrepresentable, not merely tested." This test is the structural backstop
 *       behind the (near-true) boundary.
 *
 *   (B) The retired frame machine leaves ZERO vocabulary in production code OR
 *       comments: no `advanceFrame` / `currentFrame` / `switchFrame` /
 *       `completedFrames` / `lastFrame` / `frameToStepStandalone` / `suggest_intent`
 *       / `frame-advanced` symbol; no bare frame literal (`"f1"`…`"f7"`, incl.
 *       `"f3a"`/`"f4a"`); no `onboarding-frame-` / `advance-to-f` test-id; no
 *       "(frame f…" prose. A new contributor cannot re-introduce the vocabulary
 *       without turning this test red.
 *
 * Scope: every non-test `.ts`/`.tsx` under `app/src` + `middleware/src`,
 * EXCLUDING (1) `*.test.ts`/`*.test.tsx`, (2) the whole `app/src/test/` harness
 * directory (which legitimately carries the `initialFrame`/`testFrameToStep`
 * test conveniences — `frameToStep.ts` is the documented test-only exception,
 * and `replayIntent.tsx` (the replay harness) lives here too), and (3) any
 * module that statically imports `vitest` / `@testing-library` (other
 * test-infrastructure). The exclusion is by the "imports a test runner"
 * SIGNAL, not a brittle per-file path allowlist.
 *
 * Per TDD discipline: the guard ships with meta self-tests proving every
 * detector matches a known-bad sample, so it provably fails on a planted
 * violation rather than passing on vibes.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SRC = resolve(HERE, ".."); // app/src
const MIDDLEWARE_SRC = resolve(APP_SRC, "..", "..", "middleware", "src");

/**
 * The mutators that must stay behind the seam:
 *  • viewer-step mutators (ChatStore) — push/replace the active ViewerStep
 *    and its citation overlays.
 *  • journey mutators (OnboardingSession) — activate / deactivate the sample
 *    entity (`pickScenario` / `returnToIngestPicker`). The orchestrator drives
 *    them from its `showSample` / `presentExperienceBeat` handlers ONLY; no
 *    view (incl. the deep-link URL effect) calls them directly any more.
 */
const MUTATORS = [
  // viewer-step mutators (ChatStore)
  "pushStep",
  "mutateActiveStep",
  "gotoDocViewer",
  "showCitationRegions",
  "clearCitationHighlight",
  "clearCitationRegions",
  // journey mutators (OnboardingSession) — orchestrator-only
  "pickScenario",
  "returnToIngestPicker",
] as const;

/**
 * The orchestration core — the only modules permitted to reach a mutator.
 * Paths are POSIX-relative to `app/src`. The orchestrator's `dispatch` calls
 * the mutators directly; the ChatStore module DEFINES the viewer-step mutators;
 * the OnboardingSession context DEFINES + performs the journey/sample-activation
 * mutations the orchestrator drives (`pickScenario` / `returnToIngestPicker`).
 */
const ORCHESTRATION_CORE = new Set<string>([
  "contexts/ChatStoreContext/ChatStoreContext.tsx",
  "contexts/ChatStoreContext/types.ts",
  "contexts/ChatStoreContext/selectors.ts",
  "contexts/ChatStoreContext/index.ts",
  "contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx",
  "contexts/CanvasOrchestratorContext/types.ts",
  "contexts/OnboardingSessionContext/OnboardingSessionContext.tsx",
  "contexts/OnboardingSessionContext/types.ts",
]);

/** Retired frame symbols — banned in code AND comments, everywhere in scope. */
const FRAME_SYMBOLS = [
  "advanceFrame",
  "currentFrame",
  "switchFrame",
  "completedFrames",
  "lastFrame",
  "frameToStepStandalone",
  "suggest_intent",
  "frame-advanced",
] as const;

interface FramePattern {
  readonly name: string;
  readonly regex: RegExp;
}

const FRAME_PATTERNS: FramePattern[] = [
  ...FRAME_SYMBOLS.map((sym) => ({
    name: `frame symbol \`${sym}\``,
    // Word-bounded so `frame-advanced` (a kebab id) and the camelCase symbols
    // each match exactly. `[\b]` is unreliable around hyphens, so anchor on a
    // non-identifier/non-hyphen boundary.
    regex: new RegExp(`(?<![\\w-])${sym.replace(/[-]/g, "\\-")}(?![\\w-])`, "g"),
  })),
  {
    // A bare frame literal: "f1".."f7", optionally with a trailing letter
    // sub-frame (f3a/f4a). Quoted, so a stray `fields`/`f5` substring in prose
    // is not a false positive.
    name: 'bare frame literal ("fN")',
    regex: /["']f[1-7][a-z]?["']/g,
  },
  {
    name: "onboarding-frame- test-id",
    regex: /onboarding-frame-/g,
  },
  {
    name: "advance-to-f test-id",
    regex: /advance-to-f/g,
  },
  {
    name: '"(frame f" prose',
    regex: /\(frame f/g,
  },
];

function walkSource(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walkSource(abs, out);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(abs);
    }
  }
  return out;
}

/** A module is test-infrastructure if it statically imports a test runner. */
function isTestInfra(content: string): boolean {
  return /from\s+["']vitest["']/.test(content) || /from\s+["']@testing-library/.test(content);
}

/**
 * Strip `//` line comments and `/* *\/` block comments so the mutator-CALL
 * detector (A) does not false-positive on prose that names a mutator. The
 * frame-vocabulary detector (B) deliberately scans the RAW content (comments
 * included) — only (A) uses the stripped form.
 */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Mutator reached as a CALL `name(` or destructured from `useChatStore...()`. */
function mutatorReachesFor(stripped: string): string[] {
  const hits: string[] = [];
  for (const m of MUTATORS) {
    // Match a bare call `pushStep(` AND a member-access call
    // `chatStore.pushStep(` / `store.pushStep(` — a component could reach the
    // seam through a held store reference, not only a destructured binding. The
    // orchestration-core modules are skipped wholesale BEFORE this runs, so
    // their own `chatStore.pushStep(...)` calls never reach the detector.
    const callRe = new RegExp(`(?<![\\w])${m}\\s*\\(`, "g");
    if (callRe.test(stripped)) hits.push(`${m}(...) call`);
  }
  // Destructuring a mutator out of the chat store (`const { pushStep } =
  // useChatStore()`), even if not yet called, is a reach into the seam.
  const destructureBlocks = stripped.match(/(?:const|let)\s*\{[^}]*\}\s*=\s*useChatStore\w*\s*\(/g) ?? [];
  for (const block of destructureBlocks) {
    for (const m of MUTATORS) {
      if (new RegExp(`(?<![\\w])${m}(?![\\w])`).test(block)) hits.push(`${m} destructured from useChatStore`);
    }
  }
  return hits;
}

function frameViolationsFor(content: string): string[] {
  const violations: string[] = [];
  for (const { name, regex } of FRAME_PATTERNS) {
    regex.lastIndex = 0;
    const matches = content.match(regex);
    if (matches) for (const hit of matches) violations.push(`  ${name}: \`${hit.trim()}\``);
  }
  return violations;
}

const APP_FILES = walkSource(APP_SRC).filter((abs) => {
  const rel = relative(APP_SRC, abs).split(sep).join("/");
  if (rel.startsWith("test/")) return false; // the harness dir
  return !isTestInfra(readFileSync(abs, "utf8"));
});
const MIDDLEWARE_FILES = walkSource(MIDDLEWARE_SRC).filter(
  (abs) => !isTestInfra(readFileSync(abs, "utf8")),
);

describe("viewer-mutation seam + retired-frame-vocabulary guard (T10)", () => {
  // ── Meta self-tests: the detectors genuinely catch known-bad samples ──
  it("mutator-call detector catches bare-call, member-access call, AND destructure (self-test)", () => {
    expect(mutatorReachesFor("foo();\npushStep({ kind: 'integrate' });")).toContain("pushStep(...) call");
    // Member-access reach through a held store ref must also trip.
    expect(mutatorReachesFor("chatStore.pushStep({ kind: 'integrate' });")).toContain("pushStep(...) call");
    // Journey mutators (OnboardingSession) are equally orchestrator-only — a
    // view calling either directly must trip.
    expect(mutatorReachesFor("onboardingSession.pickScenario('utility');")).toContain("pickScenario(...) call");
    expect(mutatorReachesFor("returnToIngestPicker();")).toContain("returnToIngestPicker(...) call");
    expect(
      mutatorReachesFor("const { state, gotoDocViewer } = useChatStore();"),
    ).toContain("gotoDocViewer destructured from useChatStore");
    // A prose mention (after comment-stripping) must NOT trigger.
    expect(mutatorReachesFor(stripComments("// calls ChatStore.gotoDocViewer to re-render"))).toEqual([]);
  });

  it("frame-vocabulary detector catches every planted pattern (self-test)", () => {
    const samples: Array<[string, string]> = [
      ["advanceFrame('f3')", "frame symbol `advanceFrame`"],
      ["if (session.currentFrame === x)", "frame symbol `currentFrame`"],
      ["dispatch({ kind: 'switchFrame' })", "frame symbol `switchFrame`"],
      ["session.completedFrames", "frame symbol `completedFrames`"],
      ["snapshot.lastFrame", "frame symbol `lastFrame`"],
      ["frameToStepStandalone(f)", "frame symbol `frameToStepStandalone`"],
      ["tool === 'suggest_intent'", "frame symbol `suggest_intent`"],
      ["action: 'frame-advanced'", "frame symbol `frame-advanced`"],
      ['advanceFrame("f4a")', 'bare frame literal ("fN")'],
      ['testId="onboarding-frame-f2"', "onboarding-frame- test-id"],
      ['data-testid="advance-to-f3"', "advance-to-f test-id"],
      ["the canvas (frame f5) advances", '"(frame f" prose'],
    ];
    for (const [sample, expectedName] of samples) {
      const found = frameViolationsFor(sample);
      expect(
        found.some((v) => v.includes(expectedName)),
        `sample \`${sample}\` should trip "${expectedName}" — got ${JSON.stringify(found)}`,
      ).toBe(true);
    }
  });

  // Sanity: the scope actually contains files (a broken walk would silently
  // pass both invariants).
  it("scans a non-empty production scope (sanity)", () => {
    expect(APP_FILES.length).toBeGreaterThan(100);
    expect(MIDDLEWARE_FILES.length).toBeGreaterThan(10);
  });

  // Sanity: every orchestration-core path is a real file (a rename would
  // silently widen the allowlist into a non-existent path).
  it("ORCHESTRATION_CORE entries all reference real files (sanity)", () => {
    const present = new Set(APP_FILES.map((abs) => relative(APP_SRC, abs).split(sep).join("/")));
    for (const core of ORCHESTRATION_CORE) {
      expect(present.has(core), `ORCHESTRATION_CORE entry "${core}" matches no in-scope file`).toBe(true);
    }
  });

  // ── (A) mutator encapsulation ──
  it("no component/view/experience module reaches a viewer-step mutator", () => {
    const offenders: string[] = [];
    for (const abs of APP_FILES) {
      const rel = relative(APP_SRC, abs).split(sep).join("/");
      if (ORCHESTRATION_CORE.has(rel)) continue;
      const reaches = mutatorReachesFor(stripComments(readFileSync(abs, "utf8")));
      if (reaches.length) offenders.push(`${rel}\n    ${reaches.join("\n    ")}`);
    }
    expect(
      offenders,
      `Viewer-step mutators must be reached only from the orchestration core ` +
        `(${[...ORCHESTRATION_CORE].join(", ")}). Route the navigation through ` +
        `CanvasOrchestrator.dispatch(intent) instead.\n\n${offenders.join("\n\n")}`,
    ).toEqual([]);
  });

  // ── (B) retired frame vocabulary, code AND comments ──
  it("no production module names a retired frame symbol / literal / test-id (code or comments)", () => {
    const offenders: string[] = [];
    for (const [root, abs] of [
      ...APP_FILES.map((a) => [APP_SRC, a] as const),
      ...MIDDLEWARE_FILES.map((a) => [MIDDLEWARE_SRC, a] as const),
    ]) {
      const rel = relative(root, abs).split(sep).join("/");
      const v = frameViolationsFor(readFileSync(abs, "utf8"));
      if (v.length) offenders.push(`${rel}\n${v.join("\n")}`);
    }
    expect(
      offenders,
      `The onboarding frame machine is retired. Remove every frame symbol / bare ` +
        `frame literal / frame test-id from production code AND comments (the only ` +
        `permitted home is the test harness under app/src/test/).\n\n${offenders.join("\n\n")}`,
    ).toEqual([]);
  });
});
