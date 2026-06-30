/**
 * agentic-template-item-editor — the "rewrite with agent" service.
 *
 * Improves a template item's DEFINITION (Extract field / Report section)
 * grounded in the source document. Mirrors `fieldExtractor` (the precedent):
 * search GroundX for snippets, build a tight prompt, one chat-profile LLM call,
 * parse JSON. Differences: the output is a DEFINITION (no citations, no
 * citation verification), and the `name` is held FIXED structurally — the
 * proposed item is the input item with only the LLM-provided fields overlaid,
 * so `id`/`name` can never change.
 *
 * Source-document grounding: one GroundX search at a higher limit gives the
 * agent a broader, representative view of the document than the narrow
 * top-match; the prompt instructs it to read that. (Upgradeable to full
 * document-content retrieval; the search-snippet view is the RAG-native
 * representative view available today.)
 */
import { logger } from "../lib/logger.js";
import type { GroundXClient, LlmClient } from "../types.js";
import {
  reportSectionItemSchema,
  templateFieldSchema,
  templateFieldTypeSchema,
  reportSectionRenderAsSchema,
  type ContentScope,
  type RewriteItemRequest,
  type RewriteItemResult,
} from "@groundx/shared";

import { searchGroundX } from "./chatRouter.js";
import type { GroundXSearchResult } from "./chatRouterTypes.js";

/** Top-N snippets that "matched" the item; the full set is the doc view. */
const MATCHED_LIMIT = 4;
const DOC_CONTEXT_LIMIT = 8;

export interface RewriteItemServiceRequest {
  kind: RewriteItemRequest["kind"];
  item: RewriteItemRequest["item"];
  currentResult?: { value?: unknown; body?: unknown; confidence?: number } | null;
  contentScope: ContentScope | null;
  scopeHint?: { fileName?: string | null };
}

export interface RewriteItemDeps {
  llmClient: LlmClient;
  groundxClient?: GroundXClient;
  groundxApiKey?: string;
  llmModelId?: string;
  rbacFilter?: Record<string, unknown>;
}

function searchQueryFor(req: RewriteItemServiceRequest): string {
  if (req.kind === "extract-field") {
    const f = req.item as { name: string; description: string };
    return `${f.name}: ${f.description}`;
  }
  const s = req.item as { name: string; question: string };
  return `${s.name}: ${s.question}`;
}

/** Strip a stray ```json fence then JSON.parse; null on failure. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let body = raw.trim();
  const fence = body.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) body = fence[1].trim();
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Build the proposed item by overlaying ONLY the LLM-provided, type-valid
 * fields onto the input item. `id`/`name` always come from the input (never the
 * LLM), so the rewrite can't rename or re-key. Returns null if the merged item
 * fails its schema.
 */
function buildProposedItem(
  kind: RewriteItemServiceRequest["kind"],
  inputItem: Record<string, unknown> & { name: string },
  llm: Record<string, unknown>,
): RewriteItemResult["proposedItem"] | null {
  const strArray = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

  if (kind === "extract-field") {
    const merged = {
      ...inputItem,
      ...(typeof llm.description === "string" ? { description: llm.description } : {}),
      ...(templateFieldTypeSchema.safeParse(llm.type).success ? { type: llm.type } : {}),
      ...(strArray(llm.instructions) ? { instructions: strArray(llm.instructions) } : {}),
      ...(strArray(llm.identifiers) ? { identifiers: strArray(llm.identifiers) } : {}),
      ...(typeof llm.format === "string" ? { format: llm.format } : {}),
    };
    const parsed = templateFieldSchema.safeParse(merged);
    return parsed.success ? parsed.data : null;
  }
  const merged = {
    ...inputItem,
    ...(typeof llm.question === "string" ? { question: llm.question } : {}),
    ...(reportSectionRenderAsSchema.safeParse(llm.renderAs).success ? { renderAs: llm.renderAs } : {}),
    ...(strArray(llm.instructions) ? { instructions: strArray(llm.instructions) } : {}),
    ...(strArray(llm.variables) ? { variables: strArray(llm.variables) } : {}),
  };
  const parsed = reportSectionItemSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
}

export async function rewriteItem(
  request: RewriteItemServiceRequest,
  deps: RewriteItemDeps,
): Promise<RewriteItemResult> {
  if (!deps.groundxClient || !deps.groundxApiKey) {
    throw new Error("rewriteItem: groundxClient + groundxApiKey are required");
  }
  if (!deps.llmModelId) {
    throw new Error("rewriteItem: llmModelId is required");
  }

  let docSnippets: GroundXSearchResult[] = [];
  try {
    const raw = await searchGroundX(
      searchQueryFor(request),
      request.contentScope,
      deps.groundxClient,
      deps.groundxApiKey,
      { rbacFilter: deps.rbacFilter },
    );
    docSnippets = raw.slice(0, DOC_CONTEXT_LIMIT);
  } catch (err) {
    logger.warn({ err }, "rewriteItem: groundx search failed; rewriting from definition + result only");
  }
  const matchedSnippets = docSnippets.slice(0, MATCHED_LIMIT);

  // Lazy import to keep the prompt module the single source of the prompt text.
  const { buildItemRewriterPrompt } = await import("./prompts/itemRewriter.js");
  const { system, user } = buildItemRewriterPrompt({
    kind: request.kind,
    item: request.item,
    currentResult: request.currentResult ?? null,
    matchedSnippets,
    docSnippets,
  });

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
    throw new Error(
      `rewriteItem llm call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`,
    );
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content?.trim() ?? "";
  const llm = parseJsonObject(raw);
  if (!llm) throw new Error("rewriteItem: LLM did not return a JSON object");

  const proposedItem = buildProposedItem(request.kind, request.item, llm);
  if (!proposedItem) throw new Error("rewriteItem: proposed item failed validation");
  if (proposedItem.name !== request.item.name) {
    throw new Error("rewriteItem: name must not change");
  }
  const reasoning = typeof llm.reasoning === "string" ? llm.reasoning : "";

  logger.info(
    { rewriteItem: { kind: request.kind, snippetCount: docSnippets.length, reasoning: reasoning.slice(0, 120) } },
    "rewrite-item result",
  );
  return { kind: request.kind, proposedItem, reasoning } as RewriteItemResult;
}
