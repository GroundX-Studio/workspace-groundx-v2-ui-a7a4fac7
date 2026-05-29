/**
 * widget-llm-integration Phase 5 — hand-rolled zod → JSON Schema
 * converter, scoped to the shapes used by the server tool catalog.
 *
 * Why hand-rolled: the `zod-to-json-schema` npm package would do
 * this, but the catalog uses a tiny surface (z.object with string +
 * number primitives, `.int`, `.positive`, `.min`, `.max`, `.optional`,
 * `.describe`). A 60-line converter is easier to audit + maintain
 * than a third-party dep, and the failure mode of an unsupported
 * Zod feature is a clear throw (vs. a silent partial conversion).
 *
 * If the catalog ever needs richer shapes (arrays, enums, unions,
 * discriminated unions), extend `convertNode` rather than swapping
 * to a library — the contract surface stays the same.
 */
import { z } from "zod";

import type { ServerTool } from "./toolCatalog.js";

/** Minimal subset of JSON Schema this converter emits. */
export interface JsonSchemaNode {
  type?: "string" | "number" | "integer" | "boolean" | "object";
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly string[];
}

/**
 * OpenAI function-calling tool entry. Anthropic's `tools` field uses
 * a parallel shape with `input_schema` instead of
 * `function.parameters` — we adapt at the request-builder boundary
 * (`callGroundedLlm`), not here.
 */
export interface OpenAiFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchemaNode;
  };
}

interface ZodDefLike {
  typeName: string;
  description?: string;
  checks?: { kind: string; value?: number }[];
  shape?: () => Record<string, z.ZodTypeAny>;
  innerType?: z.ZodTypeAny;
  values?: readonly string[];
}

function defOf(schema: z.ZodTypeAny): ZodDefLike {
  return schema._def as unknown as ZodDefLike;
}

function convertNode(schema: z.ZodTypeAny): JsonSchemaNode {
  const def = defOf(schema);
  switch (def.typeName) {
    case "ZodOptional": {
      const inner = convertNode(def.innerType!);
      // Optional wraps; description on the wrapper wins if set.
      if (def.description) inner.description = def.description;
      return inner;
    }
    case "ZodString": {
      const node: JsonSchemaNode = { type: "string" };
      for (const check of def.checks ?? []) {
        if (check.kind === "min" && typeof check.value === "number") node.minLength = check.value;
        if (check.kind === "max" && typeof check.value === "number") node.maxLength = check.value;
      }
      if (def.description) node.description = def.description;
      return node;
    }
    case "ZodNumber": {
      const checks = def.checks ?? [];
      const isInt = checks.some((c) => c.kind === "int");
      const node: JsonSchemaNode = { type: isInt ? "integer" : "number" };
      for (const check of checks) {
        if (check.kind === "min" && typeof check.value === "number") node.minimum = check.value;
        if (check.kind === "max" && typeof check.value === "number") node.maximum = check.value;
      }
      // `.positive()` translates to a strict `minimum: 0`; OpenAI's
      // JSON Schema doesn't support `exclusiveMinimum` reliably
      // across providers, so we represent it as `minimum: 1` for
      // integers and `minimum: 0` for floats (the runtime Zod parse
      // is the source of truth — JSON Schema is a hint to the LLM).
      if (checks.some((c) => c.kind === "min" && c.value === 0 && c.kind === "min")) {
        // already covered by min above
      }
      // detect `.positive()`: Zod emits a `kind: "min", value: 0`
      // entry with an inclusive flag we can't read here without
      // touching internals. Treat any min===0 on an integer as
      // positive-only → 1.
      if (isInt && checks.some((c) => c.kind === "min" && c.value === 0)) {
        node.minimum = 1;
      }
      if (def.description) node.description = def.description;
      return node;
    }
    case "ZodBoolean": {
      const node: JsonSchemaNode = { type: "boolean" };
      if (def.description) node.description = def.description;
      return node;
    }
    case "ZodEnum": {
      // ZodEnum stores the union members on `_def.values`.
      const node: JsonSchemaNode = {
        type: "string",
        enum: def.values ?? [],
      };
      if (def.description) node.description = def.description;
      return node;
    }
    case "ZodObject": {
      const shape = def.shape!();
      const properties: Record<string, JsonSchemaNode> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        properties[key] = convertNode(child);
        const childDef = defOf(child);
        if (childDef.typeName !== "ZodOptional") required.push(key);
      }
      const node: JsonSchemaNode = {
        type: "object",
        properties,
        additionalProperties: false,
      };
      if (required.length > 0) node.required = required;
      if (def.description) node.description = def.description;
      return node;
    }
    default:
      throw new Error(
        `zodToJsonSchema: unsupported Zod type "${def.typeName}". Extend convertNode if a tool needs it.`,
      );
  }
}

/**
 * Convert a `ServerTool[]` catalog into the OpenAI function-calling
 * `tools` array shape. Each tool becomes one `function` entry.
 */
export function toOpenAiTools(catalog: ServerTool[]): OpenAiFunctionTool[] {
  return catalog.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertNode(tool.inputSchema),
    },
  }));
}
