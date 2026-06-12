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
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly string[];
  /** Element schema for `type: "array"`. */
  items?: JsonSchemaNode;
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
  /** `ZodArray` element type. */
  type?: z.ZodTypeAny;
  /** `ZodObject` unknown-key policy (`strip` | `strict` | `passthrough`). */
  unknownKeys?: string;
  /** `ZodDiscriminatedUnion` / `ZodUnion` member schemas. */
  options?: z.ZodTypeAny[];
  /** `ZodLiteral` value. */
  value?: unknown;
  /** `ZodRecord` value schema. */
  valueType?: z.ZodTypeAny;
}

function defOf(schema: z.ZodTypeAny): ZodDefLike {
  return schema._def as unknown as ZodDefLike;
}

/**
 * Exported for the cross-package full-shape parity guard
 * (app/src/tools/catalog-parity.test.ts) — both sides' Zod input schemas
 * are rendered through THIS converter and compared as JSON-Schema
 * (chat-architecture-hardening Task 7).
 */
export function convertNode(schema: z.ZodTypeAny): JsonSchemaNode {
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
      // `.positive()` is `kind: "min", value: 0, inclusive: false`;
      // `.min(0)` is the same with `inclusive: true` — read the flag so an
      // inclusive zero floor stays 0 (post-review hardening: the old
      // "any min===0 on an integer → 1" heuristic silently misread .min(0)).
      const exclusiveZero = checks.some(
        (c) => c.kind === "min" && c.value === 0 && (c as { inclusive?: boolean }).inclusive === false,
      );
      if (isInt && exclusiveZero) {
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
    case "ZodDiscriminatedUnion":
    case "ZodUnion": {
      // Task 7 (chat-architecture-hardening) - the shared `contentScopeSchema`
      // is a discriminated union; render as `anyOf` (OpenAI accepts it).
      const members = (def.options ?? []) as z.ZodTypeAny[];
      const node: JsonSchemaNode = { anyOf: members.map((m) => convertNode(m)) } as JsonSchemaNode;
      if (def.description) (node as { description?: string }).description = def.description;
      return node;
    }
    case "ZodRecord": {
      // Free-form keyed map (e.g. the ContentScope `filter`).
      const node: JsonSchemaNode = {
        type: "object",
        additionalProperties: def.valueType ? convertNode(def.valueType) : true,
      } as JsonSchemaNode;
      if (def.description) (node as { description?: string }).description = def.description;
      return node;
    }
    case "ZodLiteral": {
      const literalType =
        typeof def.value === "number" ? "number"
        : typeof def.value === "boolean" ? "boolean"
        : def.value === null ? "null"
        : "string";
      const node: JsonSchemaNode = {
        type: literalType,
        const: def.value,
      } as JsonSchemaNode;
      if (def.description) (node as { description?: string }).description = def.description;
      return node;
    }
    case "ZodArray": {
      // ZodArray stores its element schema on `_def.type`.
      const node: JsonSchemaNode = {
        type: "array",
        items: convertNode(def.type!),
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
      // A `.passthrough()` object (e.g. the loose `scope` hint) permits
      // unknown keys; `strip` (default) / `strict` do not. The runtime Zod
      // parse + the shared `contentScopeSchema` remain the source of truth —
      // this JSON Schema is only an LLM hint.
      const node: JsonSchemaNode = {
        type: "object",
        properties,
        additionalProperties: def.unknownKeys === "passthrough",
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
