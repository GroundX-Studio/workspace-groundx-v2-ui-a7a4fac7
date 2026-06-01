/**
 * `groundedAnswerOverScope` — the shared "verified prose over a ContentScope"
 * seam (2026-06-01-live-report-render §3).
 *
 * ONE composable helper that produces a grounded prose body + a verified
 * `Citation[]` for a `(question, scope)` pair, by composing the established RAG
 * building blocks:
 *
 *   searchGroundX (search) → buildSnippetBlock + callGroundedLlm (grounded
 *   generation) → parseGroundedAnswer (extract the structured citation block) →
 *   the WF-06b verify loop (verifyQuote → assignTier → confidenceFor, with the
 *   WF-05b word-level `exact`-tier upgrade) → a shared `GeneratedResult`.
 *
 * This is the genuine ≥2-caller axis the change earns:
 *   - `runRagPipeline` (chat) — migrated onto this helper (its ~140-line inline
 *     per-answer loop became this one home); rag keeps its chat-only concerns
 *     (tool calls → intents/chips, `_debug`, suggested actions) AROUND the
 *     helper, consuming the `snippets`/`toolCalls` the extended result carries.
 *   - the Smart Report live render — calls it per template section.
 *
 * `extractField` is deliberately NOT a caller: it returns a scalar value + a
 * single optional citation and never verifies — a different contract.
 *
 * The public result is the shared `GeneratedResult` core (`body` + `citations`
 * + `confidence?` + `warnings?`, `@groundx/shared`) so neither caller forks a
 * local result shape; the extended `snippets`/`toolCalls` are the live LLM call
 * by-products `runRagPipeline` still needs for its tool-call + debug handling.
 */

import { assignTier, confidenceFor, verifyQuote } from "./attribution.js";
import {
  resolveWordGeometry,
  type NormalizedBbox,
} from "./citationGeometry.js";
import { fetchDocumentWordMap } from "./wordMapCache.js";
import { callGroundedLlm, parseGroundedAnswer } from "./ragPipeline.js";
import { searchGroundX, type SearchGroundXOptions } from "./groundxSearch.js";
import {
  RAG_SNIPPET_CHARS,
  type ChatRouterDebug,
  type Citation,
  type GroundXSearchResult,
  type RawToolCall,
} from "./chatRouterTypes.js";

import type { GroundXClient, LlmClient } from "../types.js";

import type { ContentScope, GeneratedResult } from "@groundx/shared";
import { type OpenAiFunctionTool } from "./zodToJsonSchema.js";

/** Dependencies the grounded-answer pipeline needs. Mirrors the RAG / Extract
 * required-deps guard: the live clients are always mandatory. */
export interface GroundedAnswerDeps {
  groundxClient: GroundXClient;
  groundxApiKey: string;
  llmClient: LlmClient;
  llmModelId: string;
  /** Server-derived RBAC / tenant filter (NEVER client-supplied). */
  rbacFilter?: Record<string, unknown>;
  /**
   * WF-05b word-level geometry seam — upgrades an already-verified citation to
   * the `exact` tier with a tight word-level bbox. Defaults to the live
   * `fetchDocumentWordMap`; tests inject a fixture.
   */
  wordMapFetch?: (
    client: GroundXClient,
    apiKey: string,
    documentId: string,
  ) => Promise<import("./citationGeometry.js").WordMap | null>;
}

/** Optional knobs for the grounded call — the chat path passes its scope hint,
 * tool catalog, and dev debug accumulator; the report path passes none. */
export interface GroundedAnswerOptions {
  scopeHint?: { fileName?: string | null; scenarioTitle?: string | null };
  /** Native function-calling tool catalog advertised to the LLM (chat only). */
  tools?: OpenAiFunctionTool[];
  /** Dev-only diagnostic accumulator (populated by search + LLM). */
  debug?: { groundx?: ChatRouterDebug["groundx"]; llm?: ChatRouterDebug["llm"] };
}

/**
 * The grounded-answer result. The `GeneratedResult` core (`body` + `citations`
 * + `confidence?` + `warnings?`) is the shared, single-sourced contract both
 * callers consume; `snippets` + `toolCalls` are the live LLM by-products
 * `runRagPipeline` needs for its tool-call routing + `_debug`.
 */
export interface GroundedAnswer extends GeneratedResult {
  body: string;
  /** The GroundX search hits the answer was grounded over (rag debug + fallback). */
  snippets: GroundXSearchResult[];
  /** Native tool calls the LLM emitted (chat tool-routing; empty for report). */
  toolCalls: RawToolCall[];
}

/**
 * Verify the LLM-emitted structured citations against the snippet set and emit
 * graduated-tier `Citation[]`. This is the WF-06b loop lifted verbatim from
 * `runRagPipeline` (was ragPipeline.ts ~235-298) so chat + report share ONE
 * implementation. When the LLM emitted no usable structured citations, falls
 * back to the legacy "every snippet is an ambient cite" behavior — the same
 * trust boundary the chat path always used.
 */
async function verifiedCitations(
  rawAnswer: string,
  snippets: GroundXSearchResult[],
  deps: GroundedAnswerDeps,
): Promise<Citation[]> {
  const parsed = parseGroundedAnswer(rawAnswer);
  // CF-06 — the LLM may only cite documentIds present in the snippet set; the
  // cross-check is the trust boundary (we don't let the LLM invent references).
  const allowedDocIds = new Set(snippets.map((s) => s.documentId));
  const validatedCitations =
    parsed.structuredCitations?.filter((c) => allowedDocIds.has(c.documentId)) ?? [];

  // WF-03 — attach the normalized source-region bbox: for a validated citation,
  // look up the matching snippet's geometry by documentId + page.
  const bboxFor = (documentId: string, page: number): NormalizedBbox | undefined =>
    snippets.find((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page)?.bbox;
  const snippetTextFor = (documentId: string, page: number): string =>
    snippets.find((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page)?.text ?? "";

  const wordMapFetch = deps.wordMapFetch ?? fetchDocumentWordMap;

  if (validatedCitations.length === 0) {
    // Ambient fallback — every snippet becomes a region-only cite (no claim-level
    // proof → `ambient`, confidence 0; bbox kept for click-to-view).
    return snippets.map((s) => ({
      documentId: s.documentId,
      page: s.pageNumber ?? 1,
      snippet: s.text ? s.text.slice(0, RAG_SNIPPET_CHARS) : undefined,
      bbox: s.bbox,
      tier: "ambient" as const,
      confidence: 0,
    }));
  }

  return Promise.all(
    validatedCitations.map(async (c) => {
      const v = verifyQuote(c.quote, snippetTextFor(c.documentId, c.page));
      // Default: the X-Ray chunk box (WF-03) for this doc+page.
      let bbox = bboxFor(c.documentId, c.page);
      let hasAtomBox = false;
      // Word-level upgrade — verified citations only.
      if (v.verified) {
        const map = await wordMapFetch(deps.groundxClient, deps.groundxApiKey, c.documentId);
        if (map) {
          const geo = resolveWordGeometry(c.quote, map);
          if (geo) {
            bbox = geo.bbox;
            hasAtomBox = true;
          }
        }
      }
      const tier = assignTier(v, { hasAtomBox });
      return {
        documentId: c.documentId,
        page: c.page,
        snippet: c.quote.slice(0, RAG_SNIPPET_CHARS),
        bbox,
        tier,
        confidence: confidenceFor(v),
        ...(c.answerSpan ? { answerSpan: c.answerSpan } : {}),
      };
    }),
  );
}

/**
 * Produce a grounded, verified answer for a `(question, scope)` pair.
 *
 * The `body` is the cleaned (JSON-block-stripped) LLM prose; `citations` are the
 * WF-06b-verified citations. The optional `tools` are advertised on the LLM call
 * and the emitted `toolCalls` are returned for the caller (chat) to route —
 * the report caller passes no tools and ignores them.
 */
export async function groundedAnswerOverScope(
  question: string,
  scope: ContentScope | null,
  deps: GroundedAnswerDeps,
  options: GroundedAnswerOptions = {},
): Promise<GroundedAnswer> {
  const searchOptions: SearchGroundXOptions = {
    ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
    ...(options.debug ? { debug: options.debug } : {}),
  };
  const snippets = await searchGroundX(
    question,
    scope,
    deps.groundxClient,
    deps.groundxApiKey,
    searchOptions,
  );

  const llmResponse = await callGroundedLlm(
    question,
    snippets,
    deps.llmClient,
    deps.llmModelId,
    options.scopeHint,
    options.debug,
    options.tools,
  );

  const parsed = parseGroundedAnswer(llmResponse.answer);
  const citations = await verifiedCitations(llmResponse.answer, snippets, deps);

  return {
    body: parsed.cleanedAnswer,
    citations,
    snippets,
    toolCalls: llmResponse.toolCalls,
  };
}
