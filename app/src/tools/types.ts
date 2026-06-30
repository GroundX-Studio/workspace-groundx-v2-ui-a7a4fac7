/**
 * App tool metadata contract.
 *
 * Co-located declaration shape per design.md §D/§I: every
 * LLM-drivable widget ships a sibling `<Name>.tools.ts` that
 * exports `tools: WidgetTool[]`.
 *
 * These app declarations are declarative metadata for widget descriptors,
 * quality checks, and app/server parity tests. Middleware `ServerTool`
 * declarations own executable production intent building.
 */
import type { ZodTypeAny } from "zod";

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
 * Declarative LLM-callable tool metadata. One per widget action.
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
   * against its mirrored `ServerTool` schema. Every field SHALL
   * carry a `.describe(...)` call (Phase 5b's quality script enforces).
   */
  input: TSchema;
  /**
   * Modes that expose this tool (design.md §J). Default: both.
   */
  availableIn?: ToolMode[];
  /**
   * `ViewerStep["kind"]` values the tool is relevant to
   * (design.md §E). Default: every step.
   */
  availableSteps?: ViewerStep["kind"][];
  /**
   * 2026-05-31-core-data-followups §5 — chat-widget reachability binding.
   *
   * For a TOOL-triggered CHAT card (a widget that mounts imperatively in the
   * chat column when a tool fires — not a `CanvasKind`-registered VIEWER widget),
   * names the chat widget this tool's result RENDERS as, in
   * `"<slot>/<WidgetName>"` form (e.g. `"chat-widgets/ProposeSchemaFieldCard"`).
   *
   * The reachability coverage test (riding the app↔server parity guard) asserts
   * every binding resolves to a REAL mounted chat widget dir. Viewer-widget
   * canvas-dispatch tools (resolved through the `ScopedViewerWidget` registry)
   * and always-on chat widgets (ThinkingStream / input bar / GateChatRail) do NOT
   * set this — they are covered by the registry + ChatColumn render tests
   * respectively. Optional by design; only the enumerated card-triggering tools
   * carry it.
   */
  rendersWidget?: string;
}

/** The shape every `<Name>.tools.ts` exports for metadata collection. */
export interface WidgetToolModule {
  tools: WidgetTool[];
}
