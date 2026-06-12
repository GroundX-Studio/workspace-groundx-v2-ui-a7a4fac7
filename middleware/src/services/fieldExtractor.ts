/**
 * UI-01 Phase 2c — focused per-field extraction.
 *
 * When the user Accepts a chat-proposed schema field, the chat surface
 * calls `/api/extract-field` to populate the new field with a real
 * value rather than the manifest-only placeholder. This file owns the
 * service contract + the live GroundX search + focused LLM call.
 *
 * Why this isn't `runRagPipeline` reused verbatim:
 *   - The output shape is different. Routed chat returns prose +
 *     citations; this returns a typed primitive value + a confidence
 *     score + an optional citation, so the SchemaView field card can
 *     render directly.
 *   - The prompt is far tighter. The LLM is told: "Extract one value;
 *     respond ONLY with JSON." No conversational scaffolding.
 *   - The token budget is much smaller. We only need a handful of
 *     snippets ranked highest for the field's name/description, not the
 *     full 4.8K context block routed chat uses.
 */

import { logger } from "../lib/logger.js";
import type { GroundXClient, LlmClient } from "../types.js";

import { searchGroundX } from "./chatRouter.js";
import { buildExtractorPrompt } from "./prompts/extractor.js";
import type { ContentScope, ExtractFieldResult, TemplateFieldType } from "@groundx/shared";

/** §4 #12 — the field-type union is single-sourced on `@groundx/shared`. */
export type SchemaFieldType = TemplateFieldType;
/** §4 #13 — the `/api/extract-field` result body is single-sourced too. */
export type { ExtractFieldResult };

export interface ExtractFieldRequest {
  /**
   * The field the user just accepted. Name + description form the
   * GroundX search query; type drives JSON parsing.
   */
  field: {
    name: string;
    type: SchemaFieldType;
    description: string;
  };
  /**
   * GroundX content scope (the unified `ContentScope`). The endpoint
   * derives this from the chat session's active entity, exactly like
   * chatHandler does for routed chat. `null` when no scope is derivable
   * (handled by `searchGroundX` as the doc-wide fallback).
   */
  contentScope: ContentScope | null;
  /**
   * Friendly hint about the doc the user is currently looking at —
   * for fallback prose / log context. Optional.
   */
  scopeHint?: { fileName?: string | null };
}

export interface ExtractFieldDeps {
  llmClient: LlmClient;
  groundxClient?: GroundXClient;
  groundxApiKey?: string;
  llmModelId?: string;
  /**
   * Server-derived RBAC filter. Composed into the GroundX search the
   * same way chatRouter handles it.
   */
  rbacFilter?: Record<string, unknown>;
}

/** Conservative cap on snippet text length the focused LLM sees. */
const FIELD_SNIPPET_LIMIT = 4;
// Per-snippet character budget (FIELD_SNIPPET_CHARS) moved to
// prompts/extractor.ts with the prompt builder (chat-architecture-hardening
// Task 2 — every model-facing prompt lives in services/prompts/).

/**
 * Coerce the LLM's emitted value to the declared field type. Returns
 * null for inputs that don't safely cast (which the UI surfaces as a
 * "couldn't extract" state).
 */
function coerceValue(raw: unknown, type: SchemaFieldType): string | number | boolean | null {
  if (raw === null || raw === undefined) return null;
  switch (type) {
    case "NUMBER": {
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string") {
        const n = Number(raw.replace(/[$,]/g, ""));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }
    case "STRING":
      return typeof raw === "string" ? raw : String(raw);
    case "DATE":
      return typeof raw === "string" ? raw : null;
    case "BOOLEAN":
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "string") {
        const lo = raw.toLowerCase();
        if (lo === "true" || lo === "yes") return true;
        if (lo === "false" || lo === "no") return false;
      }
      return null;
    default:
      return null;
  }
}

// Prompt construction moved to `prompts/extractor.ts#buildExtractorPrompt`
// (chat-architecture-hardening Task 2).

/**
 * Parse the LLM's JSON-only response. Lenient: a stray markdown fence
 * wrapper is stripped before parsing so models that ignored the
 * "no fences" instruction still produce a usable result.
 */
function parseLlmOutput(
  raw: string,
  fieldType: SchemaFieldType,
  allowedDocIds: Set<string>,
): ExtractFieldResult {
  let body = raw.trim();
  const fence = body.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) body = fence[1].trim();
  let parsed: { value?: unknown; confidence?: unknown; citation?: unknown } | null;
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return { value: null, confidence: 0, citation: null };
  }
  const value = coerceValue(parsed?.value, fieldType);
  const confidence =
    typeof parsed?.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0;
  let citation: ExtractFieldResult["citation"] = null;
  const c = parsed?.citation as
    | { documentId?: unknown; page?: unknown; quote?: unknown }
    | null
    | undefined;
  if (c && typeof c === "object" && typeof c.documentId === "string" && typeof c.page === "number") {
    if (allowedDocIds.has(c.documentId)) {
      citation = {
        documentId: c.documentId,
        page: c.page,
        snippet: typeof c.quote === "string" ? c.quote : undefined,
      };
    }
  }
  return { value, confidence, citation };
}

/**
 * Run a focused single-field extraction: search the scope for the field,
 * then ask the LLM to extract the typed value with a citation. The
 * GroundX client + key + model id are always required (tests inject fakes
 * at the dependency seam).
 */
export async function extractField(
  request: ExtractFieldRequest,
  deps: ExtractFieldDeps,
): Promise<ExtractFieldResult> {
  if (!deps.groundxClient || !deps.groundxApiKey) {
    throw new Error("extractField: groundxClient + groundxApiKey are required");
  }
  if (!deps.llmModelId) {
    throw new Error("extractField: llmModelId is required");
  }

  // Search query — name + description biases GroundX to the right
  // snippets even when the user didn't word the proposal that way.
  const searchQuery = `${request.field.name}: ${request.field.description}`;
  let snippets: Array<{ documentId: string; pageNumber?: number; text?: string; fileName?: string }> = [];
  try {
    const raw = await searchGroundX(
      searchQuery,
      request.contentScope,
      deps.groundxClient,
      deps.groundxApiKey,
      { rbacFilter: deps.rbacFilter },
    );
    snippets = raw.slice(0, FIELD_SNIPPET_LIMIT);
  } catch (err) {
    logger.warn({ err }, "extractField: groundx search failed; falling back to empty snippets");
  }

  const { system, user } = buildExtractorPrompt(request.field, snippets, request.scopeHint);
  logger.info(
    {
      extractField: {
        fieldName: request.field.name,
        fieldType: request.field.type,
        snippetCount: snippets.length,
        systemChars: system.length,
        userChars: user.length,
      },
    },
    "extract-field dispatch",
  );

  const response = await deps.llmClient.forward("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: deps.llmModelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`extract-field llm call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content?.trim() ?? "";
  const allowedDocIds = new Set(snippets.map((s) => s.documentId));
  const result = parseLlmOutput(raw, request.field.type, allowedDocIds);
  logger.info(
    {
      extractField: {
        fieldName: request.field.name,
        fieldType: request.field.type,
        valueShape: result.value === null ? "null" : typeof result.value,
        confidence: result.confidence,
        hasCitation: Boolean(result.citation),
      },
    },
    "extract-field result",
  );
  return result;
}
