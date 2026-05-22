import { z } from "zod";

/**
 * AgentToolBus — registry of typed tools the LLM agent can invoke.
 *
 * Every tool has:
 *   - `name`: stable identifier sent over the wire
 *   - `description`: prompt-facing description (passed through to the LLM)
 *   - `parameters`: a Zod schema validated on both sides of the boundary
 *   - `handler`: the actual implementation that runs in the app
 *
 * Middleware mirrors the same registry server-side (a separate copy keyed by
 * name) so it can validate streamed tool calls before they reach the app.
 * The browser bus is the dispatch surface the views consume.
 */

export interface AgentTool<TParams = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams) => Promise<unknown> | unknown;
}

export interface AgentToolInvocation {
  name: string;
  params: unknown;
  result?: unknown;
  error?: { code: string; message: string };
  ts: number;
}

export interface AgentToolBusApi {
  /** List of registered tool definitions (descriptor only, no handler). */
  list: () => Array<Pick<AgentTool, "name" | "description"> & { parametersJsonSchema: unknown }>;
  /** Register a tool. Returns an unregister function. */
  register: <T>(tool: AgentTool<T>) => () => void;
  /** Invoke a tool by name. Validates params; returns the handler result or throws. */
  invoke: (name: string, params: unknown) => Promise<unknown>;
  /** History of recent invocations (capped, for telemetry + debug). */
  recent: () => AgentToolInvocation[];
}
