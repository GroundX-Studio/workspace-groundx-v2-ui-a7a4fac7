import { assertUniqueIds } from "@groundx/shared";

import type { WidgetTool, WidgetToolModule } from "./types";

export const TOOL_GLOB_PATTERNS = [
  "../components/chat-widgets/*/*.tools.ts",
  "../components/viewer-widgets/*/*.tools.ts",
  "../views/**/*.tools.ts",
  "../components/primitives/**/*.tools.ts",
] as const;

function isWidgetToolModule(value: unknown): value is WidgetToolModule {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { tools?: unknown }).tools),
  );
}

export function collectAppToolSpecs(
  modules: Record<string, unknown>,
): readonly WidgetTool[] {
  const located: { tool: WidgetTool; path: string }[] = [];
  for (const path of Object.keys(modules).sort()) {
    const mod = modules[path];
    if (!isWidgetToolModule(mod)) continue;
    for (const tool of mod.tools) located.push({ tool, path });
  }
  assertUniqueIds(
    located,
    (entry) => entry.tool.name,
    (entry) => entry.path,
  );
  return located.map((entry) => entry.tool);
}
