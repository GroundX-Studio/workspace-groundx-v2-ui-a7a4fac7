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

import type { Catalog } from "@groundx/shared";

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
 *
 * Satisfies the shared `Catalog<WidgetTool>` read contract
 * (`@groundx/shared`): `all()` enumerates, `byId(name)` looks up. A tool's
 * id IS its `name`, so `byId` is a documented alias of `byName` (kept for
 * back-compat / call-site clarity). `forStep(...)` + the unique-name
 * invariant are tool-specific extensions, not part of the shared contract.
 *
 * ⚠️ ORPHAN (audit 2026-05-30, RCC Phase 2): the production `toolRegistry`
 * singleton + every widget `handler` currently have ZERO production
 * importers — the live LLM catalog is the middleware `SERVER_TOOL_CATALOG`
 * (`toolsForStep`, `chatRouter.ts`), and the app dispatches server-built
 * `reply.intents`. Recommendation: DELETE this app-side registry + the dead
 * `category`/`handler` duplication of the server `intentBuilder`. The delete
 * is DEFERRED — `toolRegistry` is shared by four in-flight changes (RCC,
 * core-data, widget-role-access, wf04) and a half-done removal across them is
 * forbidden (cross-plan conflict map). A coordinated follow-up owns the
 * delete. This Catalog alignment is harmless non-destructive plumbing in the
 * meantime. See proposal.md / design.md "toolRegistry orphan".
 */
export interface ToolRegistry extends Catalog<WidgetTool> {
  /** Every tool, in stable insertion order. (Catalog<T>.all) */
  all(): readonly WidgetTool[];
  /**
   * Lookup by id (`Catalog<T>.byId`). A tool's id IS its `name`, so this is
   * an exact alias of `byName`.
   */
  byId(id: string): WidgetTool | undefined;
  /** Lookup by `name`. Documented alias of `byId`. Returns `undefined` if no such tool exists. */
  byName(name: string): WidgetTool | undefined;
  /**
   * Tools available at the given ViewerStep kind. Optional `mode`
   * additionally filters by `availableIn`.
   */
  forStep(stepKind: ViewerStep["kind"], mode?: ToolMode): readonly WidgetTool[];
}
