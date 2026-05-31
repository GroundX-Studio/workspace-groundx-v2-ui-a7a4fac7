/**
 * widget-llm-integration Phase 3 — central tool registry.
 *
 * Discovery model (design.md §I):
 *   • Each widget ships a sibling `<Name>.tools.ts`.
 *   • The production singleton (`toolRegistry`) wraps Vite's
 *     `import.meta.glob` over both widget slots and assembles
 *     the LLM-facing catalog at app boot.
 *   • Tests use `createRegistry(modules)` with synthetic modules
 *     so the merge + filter logic is exercised without writing
 *     real `.tools.ts` files into the slot directories.
 *
 * Invariants:
 *   • Tool `name` is globally unique. A duplicate at boot is a
 *     hard error — the registry constructor throws.
 *   • Module files with no `tools` export are tolerated (lets a
 *     widget land its file before the array is filled in).
 *
 * Phase 3 stops at the registry. Phase 4 lands the first real
 * `<Name>.tools.ts` (PdfViewer). Phase 5 wires the catalog into
 * the middleware function-calling boundary.
 */
import { assertUniqueIds } from "@groundx/shared";

import type { ToolMode, ToolRegistry, WidgetTool, WidgetToolModule } from "./types";
import type { ViewerStep } from "@/contexts/ChatStoreContext";

function isWidgetToolModule(value: unknown): value is WidgetToolModule {
  if (!value || typeof value !== "object") return false;
  const maybe = (value as { tools?: unknown }).tools;
  return Array.isArray(maybe);
}

/**
 * Build a registry from a module-path → module map. The map shape
 * matches what `import.meta.glob(..., { eager: true })` returns.
 */
export function createRegistry(
  modules: Record<string, unknown>,
): ToolRegistry {
  // Stable iteration: walk module paths in lexicographic order so
  // the catalog rendering for the LLM is deterministic. Carry each
  // tool's source module path so the unique-id invariant can name the
  // colliding modules (preserving the "declared in two modules" diagnostic).
  const sortedPaths = Object.keys(modules).sort();
  const located: { tool: WidgetTool; path: string }[] = [];
  for (const path of sortedPaths) {
    const mod = modules[path];
    if (!isWidgetToolModule(mod)) continue;
    for (const tool of mod.tools) {
      located.push({ tool, path });
    }
  }

  // ONE mechanism for the unique-id invariant: the shared
  // `assertUniqueIds` (a tool's id IS its `name`). `sourceOf` = the
  // module path, so a duplicate names both colliding modules.
  assertUniqueIds(
    located,
    (entry) => entry.tool.name,
    (entry) => entry.path,
  );

  const tools: WidgetTool[] = located.map((entry) => entry.tool);
  const lookup = new Map<string, WidgetTool>(tools.map((tool) => [tool.name, tool]));

  const inMode = (tool: WidgetTool, mode: ToolMode | undefined): boolean => {
    if (!mode) return true;
    if (!tool.availableIn || tool.availableIn.length === 0) return true;
    return tool.availableIn.includes(mode);
  };

  const inStep = (tool: WidgetTool, stepKind: ViewerStep["kind"]): boolean => {
    if (!tool.availableSteps || tool.availableSteps.length === 0) return true;
    return tool.availableSteps.includes(stepKind);
  };

  const byName = (name: string) => lookup.get(name);

  return {
    all: () => tools,
    // Catalog<T>.byId — a tool's id IS its name, so this aliases byName.
    byId: byName,
    byName,
    forStep: (stepKind, mode) =>
      tools.filter((t) => inStep(t, stepKind) && inMode(t, mode)),
  };
}

/**
 * The tool-discovery glob homes. The two widget slots (`chat-widgets/`,
 * `viewer-widgets/`) PLUS — added by 2026-05-31-tool-system-completion (BROAD
 * glob-home decision) — view-hosted (`views/**`) and primitive-hosted
 * (`components/primitives/**`) `*.tools.ts` files, so the `OnboardingWizard`
 * view and the `DialogTitle` primitive can own their tools in place.
 *
 * Exported as the single source of truth for the discovery shape: the two
 * companion walkers — `check-tool-quality`'s `collectToolFiles` and
 * `check-tool-references`'s `collectKnownToolNames` — restate the SAME homes,
 * and `registry.test.ts` asserts this list so the three walkers cannot drift.
 *
 * NOTE: `import.meta.glob` requires its pattern argument to be a literal array
 * (Vite static-analyzes it at build time), so the `eagerModules` call below
 * INLINES the identical list rather than spreading this const.
 */
export const TOOL_GLOB_PATTERNS = [
  "../components/chat-widgets/*/*.tools.ts",
  "../components/viewer-widgets/*/*.tools.ts",
  "../views/**/*.tools.ts",
  "../components/primitives/**/*.tools.ts",
] as const;

/**
 * Production singleton. Vite resolves the glob at build time; the
 * `eager: true` flag inlines every match's module so we don't pay
 * a dynamic-import roundtrip at first catalog read.
 */
const eagerModules = import.meta.glob(
  [
    "../components/chat-widgets/*/*.tools.ts",
    "../components/viewer-widgets/*/*.tools.ts",
    "../views/**/*.tools.ts",
    "../components/primitives/**/*.tools.ts",
  ],
  { eager: true },
);

export const toolRegistry: ToolRegistry = createRegistry(eagerModules);
