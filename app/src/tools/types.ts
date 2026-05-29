/**
 * widget-llm-integration Phase 3 — `WidgetTool` type contract.
 *
 * Co-located declaration shape per design.md §D/§I: every
 * LLM-drivable widget ships a sibling `<Name>.tools.ts` that
 * exports `tools: WidgetTool[]`. The central registry
 * (`registry.ts`) auto-discovers those modules at boot and
 * composes the LLM-facing catalog.
 *
 * Keep this file flat. The widgets read it (compile-time), the
 * registry reads it (runtime), and the middleware-side bridge
 * (Phase 5) will read it (build-time, via a generated manifest).
 */
import type { ZodTypeAny, infer as zInfer } from "zod";

import type { CanvasIntent } from "@/contexts/CanvasOrchestratorContext";
import type { ViewerStep } from "@/contexts/ChatStoreContext";

/** Mode locks parallel to the widget-contract `mode` prop. */
export type ToolMode = "onboarding" | "steady";

/**
 * Tool category — drives the confirmation model (design.md §C).
 *
 *   • `read`  → may auto-execute. Navigation / focus / highlight.
 *   • `mutate`→ requires user confirmation. Schema change, save,
 *               send, ingest, delete. Surfaces as a chip / card.
 */
export type ToolCategory = "read" | "mutate";

/**
 * Declarative LLM-callable tool. One per widget action.
 *
 * Generic over the Zod input schema so callers get inferred-typed
 * handler args. Catalog consumers that don't care about types use
 * the default `WidgetTool` alias (no generic).
 */
export interface WidgetTool<TSchema extends ZodTypeAny = ZodTypeAny> {
  /**
   * Globally unique snake_case identifier. The LLM-facing name —
   * what the model emits as `tool_calls[].name`.
   *
   * Convention enforced by Phase 5b's quality script:
   *   ^[a-z][a-z0-9_]*$ AND starts with an allowlisted action verb.
   */
  name: string;
  /**
   * Human + LLM-facing description. Phase 5b's quality script
   * requires ≥ 40 chars AND a `Use when` / `Triggers when` clause —
   * this is the single most impactful field for tool-selection
   * accuracy.
   */
  description: string;
  /** Drives auto-execute vs. user-confirm dispatch (design.md §C). */
  category: ToolCategory;
  /**
   * Zod input schema. The middleware validates LLM-emitted arguments
   * against this before invoking the handler. Every field SHALL
   * carry a `.describe(...)` call (Phase 5b's quality script enforces).
   */
  input: TSchema;
  /**
   * Bridge from validated input → `CanvasIntent` the orchestrator
   * dispatches. Return `null` for mutate-category tools whose
   * intent is "raise a chip and wait" rather than "dispatch now".
   */
  handler: (input: zInfer<TSchema>) => CanvasIntent | null;
  /**
   * Modes that expose this tool (design.md §J). Default: both.
   */
  availableIn?: ToolMode[];
  /**
   * `ViewerStep["kind"]` values the tool is relevant to
   * (design.md §E). Default: every step.
   */
  availableSteps?: ViewerStep["kind"][];
}

/**
 * The shape every `<Name>.tools.ts` exports. The registry walks
 * `import.meta.glob` modules and picks up the `tools` array.
 */
export interface WidgetToolModule {
  tools: WidgetTool[];
}

/**
 * Read surface returned by `createRegistry`. Kept narrow so future
 * consumers (Phase 5 middleware bridge, Phase 5b runtime checker)
 * compose against it without leaking implementation details.
 */
export interface ToolRegistry {
  /** Every tool, in stable insertion order. */
  all(): readonly WidgetTool[];
  /** Lookup by `name`. Returns `undefined` if no such tool exists. */
  byName(name: string): WidgetTool | undefined;
  /**
   * Tools available at the given ViewerStep kind. Optional `mode`
   * additionally filters by `availableIn`.
   */
  forStep(stepKind: ViewerStep["kind"], mode?: ToolMode): readonly WidgetTool[];
}
