/**
 * Dev-mode demo-state URL overrides.
 *
 * These let you preview any non-default UI state by visiting a URL with a
 * `?demo=...` query parameter. The overrides are gated behind
 * `import.meta.env.DEV` so production builds ignore them entirely — the
 * URL params silently no-op.
 *
 * Pattern: each subsystem that has multiple states (registry fetch,
 * session bootstrap, gate lifecycle, etc.) exports a `read<X>Override(search?)`
 * function. Each function reads a small set of query params and returns
 * either a forced state value or null. The owning context/provider reads
 * the override on mount and, if non-null, uses it instead of the real
 * runtime state — skipping network fetches in demo mode.
 *
 * Today: `?registry=<empty|error|loading>` for the ScenarioRegistry.
 * Future: `?session=error`, `?gate=open&trigger=byo`, etc. — add a
 * `read<X>Override(search?)` and wire it into the relevant Provider.
 *
 * Custom error text:
 *   ?registry=error&error=Your+custom+message+here
 * Spaces in `error=` are URL-encoded as `+` or `%20`; both work.
 */

import type { ScenarioRegistryState } from "@/contexts/ScenarioRegistryContext/types";

const ALLOWED_REGISTRY_MODES = new Set(["empty", "error", "loading"]);

function getSearch(search?: string): string {
  if (search !== undefined) return search;
  if (typeof window === "undefined") return "";
  return window.location.search;
}

function isDemoEnabled(): boolean {
  // Vitest sets import.meta.env.DEV to true. Vite production builds compile
  // this to `false` and tree-shake the URL-parsing code.
  return Boolean(import.meta.env?.DEV);
}

/**
 * Parse a search string (defaults to `window.location.search`) and return
 * a forced ScenarioRegistry state if a recognized demo override is
 * present. Returns null otherwise — and always null in production.
 */
export function readRegistryDemoOverride(search?: string): ScenarioRegistryState | null {
  if (!isDemoEnabled()) return null;
  const params = new URLSearchParams(getSearch(search));
  const mode = params.get("registry");
  if (!mode || !ALLOWED_REGISTRY_MODES.has(mode)) return null;
  if (mode === "empty") {
    return { status: "ready", scenarios: [], error: null };
  }
  if (mode === "loading") {
    return { status: "loading", scenarios: [], error: null };
  }
  // mode === "error"
  const errorMessage = params.get("error") ?? "Demo: registry forced into error state.";
  return { status: "error", scenarios: [], error: errorMessage };
}
