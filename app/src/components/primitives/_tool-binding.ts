/**
 * widget-llm-integration Phase 5b — shared tool-binding contract for
 * every interactive primitive (Button / IconButton / TextField /
 * future Switch / Slider / etc.).
 *
 * Every interactive primitive SHALL require exactly one of:
 *
 *   • `tool: string` — name of an LLM-callable tool declared in some
 *     widget's `<Name>.tools.ts`. Lands on the DOM as `data-tool`.
 *   • `noTool: string` — short justification for opting out. Lands as
 *     `data-no-tool`. Use for external redirects, decorative buttons,
 *     legacy / pre-Phase-7 callers that haven't been backfilled yet.
 *
 * The discriminated union with `never` slots is what lets TypeScript
 * reject `<Button>x</Button>` (no prop) AND `<Button tool="x" noTool="y">`
 * (both props). Without the `never`s, an untyped extra prop would
 * collapse the union and let bare invocations through.
 *
 * Phase 7 backfill is the proper home for upgrading `noTool="legacy …"`
 * to a real `tool="…"` reference per widget. Until then, the gate
 * just ensures every interactive call site has signalled intent.
 */

export type ToolBindingProps =
  | {
      /** Name of an LLM-callable tool registered in some widget's `tools.ts`. */
      tool: string;
      noTool?: never;
    }
  | {
      /** Short justification — "external redirect", "decorative", etc. */
      noTool: string;
      tool?: never;
    };

/**
 * Resolve a `ToolBindingProps` value into the matching DOM data
 * attribute. Returns one of `{ "data-tool": tool }`,
 * `{ "data-no-tool": noTool }`. Callers spread this onto the
 * underlying MUI element so the binding is auditable in the rendered
 * DOM (Playwright snapshot, e2e tests, runtime drift guard).
 */
export function resolveToolAttribute(
  binding: ToolBindingProps,
): Record<string, string> {
  if ("tool" in binding && binding.tool) {
    return { "data-tool": binding.tool };
  }
  if ("noTool" in binding && binding.noTool) {
    return { "data-no-tool": binding.noTool };
  }
  // Defensive — the type system makes this unreachable. If it fires
  // at runtime, treat as a logged opt-out for telemetry.
  return { "data-no-tool": "unknown" };
}
