/**
 * GroundX search dispatch for the RAG pipeline.
 *
 * Extracted from `chatRouter.ts` (§1 of 2026-05-31-core-data-followups —
 * behavior-preserving split). Owns `searchGroundX` (scope-dispatched search +
 * zero-result retry + WF-03 geometry resolution) and the `composeFilters`
 * helper. `chatRouter.ts` re-exports `searchGroundX` + `SearchGroundXOptions`
 * so existing `from "./chatRouter.js"` imports keep resolving.
 */

import type { GroundXClient } from "../types.js";

import { logger } from "../lib/logger.js";
import {
  bboxForResult,
  parseBoundingBoxes,
  parsePages,
  resolveGeometryFromXray,
} from "./citationGeometry.js";
import { fetchDocumentXray } from "./xrayCache.js";
import {
  RAG_FALLBACK_RELEVANCE,
  RAG_SEARCH_LIMIT,
  type ChatRouterDebug,
  type GroundXSearchResult,
} from "./chatRouterTypes.js";

import { compileScopeFilter, type ContentScope } from "@groundx/shared";

/**
 * Issue a GroundX search dispatched on `ContentScope` (or `null`). The
 * endpoint is chosen by the scope discriminant; the optional composable
 * `filter` is compiled (shared `compileScopeFilter`) and applied uniformly
 * to ANY shape, then composed with the server-derived `rbacFilter` via $and:
 *
 *   bucket    → POST /v1/search/{bucketId} + {query, n}
 *   group     → POST /v1/search/{groupId}  + {query, n}
 *   documents → POST /v1/search/documents  + {query, n, documentIds: [...]}
 *   null      → POST /v1/search/documents  (doc-wide fallback; logged)
 *
 *   + filter  → adds {filter: <compiled>}  (project/portfolio/fund/folder
 *               filter-fields; single→{field:v}, multi→{$in}, multi-field
 *               →$and). Was bucket+projectIds-only before B1 inc. 3.
 *
 * TODO(CF-19): multi-bucket usage today requires the caller to
 * provide an existing groupId. The "ensure-create group of buckets
 * [B1, B2, …] if none exists" helper lives outside this function;
 * when it lands, the handler can pass `{type:"group", groupId}`
 * after the ensure call. CF-02 + CF-15 closed 2026-05-25 — the
 * scope dispatch + entity-driven scope derivation are live; only
 * the multi-bucket→group helper remains.
 */
/**
 * CF-03: options for layering a server-derived metadata filter (RBAC,
 * tenant, region, etc.) on top of the scope filter. The contract:
 *
 *   - If only the scope produces a filter → use it as-is.
 *   - If only `rbacFilter` is set        → use it as-is.
 *   - If both are present                → compose via `$and: [rbac, scope]`.
 *
 * The `rbacFilter` is ALWAYS server-derived (from session.groundx-
 * Username → org → allowed visibility). It MUST NOT be accepted from
 * the client. This function doesn't enforce that — the caller does, by
 * never plumbing client input into this parameter.
 */
export interface SearchGroundXOptions {
  rbacFilter?: Record<string, unknown>;
  /**
   * Optional dev-only diagnostic accumulator. When passed, searchGroundX
   * populates `debug.groundx` with the final request shape + result
   * summary so callers (chatRouter → chatHandler → /api/chat) can
   * surface it to the browser. Never set in production.
   */
  debug?: { groundx?: ChatRouterDebug["groundx"] };
}

/**
 * Compose two independent filters into one. Returns null when both
 * are absent. Uses Mongo-style `$and` for composition rather than a
 * shallow merge — shallow merge silently drops collisions and
 * collapses any structured logic the caller already encoded.
 */
function composeFilters(
  rbac: Record<string, unknown> | null,
  scope: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!rbac && !scope) return null;
  if (!rbac) return scope;
  if (!scope) return rbac;
  return { $and: [rbac, scope] };
}

export async function searchGroundX(
  query: string,
  scope: ContentScope | null,
  client: GroundXClient,
  apiKey: string,
  options: SearchGroundXOptions = {},
): Promise<GroundXSearchResult[]> {
  let path: string;
  // Body must always include {query, n}; some scopes add fields.
  const body: Record<string, unknown> = { query, n: RAG_SEARCH_LIMIT };

  if (scope === null) {
    // No derivable scope — the chatHandler couldn't resolve an active entity
    // and there's no env samples bucket (early onboarding). Legacy fallback:
    // doc-wide search. Logged so the gap shows in telemetry.
    // eslint-disable-next-line no-console
    console.warn("rag search dispatched with no scope — falling back to /v1/search/documents");
    path = "/search/documents";
  } else {
    switch (scope.type) {
      case "bucket": {
        path = `/search/${scope.bucketId}`;
        break;
      }
      case "group": {
        // Group search has the same shape as bucket search — different
        // resource id, same endpoint. GroundX resolves the group to its
        // member buckets server-side.
        path = `/search/${scope.groupId}`;
        break;
      }
      case "documents": {
        if (scope.documentIds.length === 0) {
          throw new Error("rag scope 'documents' requires at least one documentId");
        }
        path = "/search/documents";
        body.documentIds = scope.documentIds;
        break;
      }
      default: {
        // Exhaustiveness guard — the discriminated union has no other member.
        const _never: never = scope;
        throw new Error(`unreachable scope: ${JSON.stringify(_never)}`);
      }
    }
  }

  // Composable scope filter — applies to EVERY scope shape (project /
  // portfolio / fund / folder filter-fields). Compiled once via the shared
  // `compileScopeFilter` (single→{field:v}, multi→$in, multi-field→$and).
  const scopeFilter = scope ? compileScopeFilter(scope.filter) : null;

  // CF-03: compose rbacFilter with scopeFilter via $and. The two are
  // independent constraints from different sources — never collapse
  // them naively (e.g. spread-merge would silently drop a key
  // collision). $and is the contract GroundX search expects when two
  // independent filters must both match.
  const composed = composeFilters(options.rbacFilter ?? null, scopeFilter);
  if (composed) body.filter = composed;

  // Dev-side full request log so the console shows what we're
  // actually asking GroundX. Query goes through pino's redact paths
  // (the `query` field is on the redact list), so prod logs see
  // [REDACTED] for the prompt itself but keep scope info.
  logger.info(
    {
      groundxSearch: { path, scope: scope?.type ?? "none", bodyKeys: Object.keys(body), query: body.query, n: body.n, filter: body.filter ?? null },
    },
    "groundx search dispatch",
  );

  const runSearch = async (relevanceFloor?: number): Promise<Array<Record<string, unknown>>> => {
    const reqBody = relevanceFloor === undefined ? body : { ...body, relevance: relevanceFloor };
    const response = await client.forward(path, {
      method: "POST",
      apiKey,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "<unreadable>");
      throw new Error(`groundx search failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      search?: { results?: Array<Record<string, unknown>> };
      results?: Array<Record<string, unknown>>;
    };
    return payload.search?.results ?? payload.results ?? [];
  };

  let rawResults = await runSearch();
  // Zero-result retry: extract-indexed docs (searchable text = extraction
  // JSON) score below GroundX's default relevance floor of 10, so a natural
  // query returns nothing and the LLM says "no snippets." Retry once with a
  // low floor to surface the JSON chunks — the grounding prompt already tells
  // the model to read JSON. Normal (prose) docs clear the default floor on
  // the first pass, so they never pay this second round-trip.
  if (rawResults.length === 0 && Number.isFinite(RAG_FALLBACK_RELEVANCE)) {
    logger.info(
      { groundxSearchRetry: { path, query: body.query, fallbackRelevance: RAG_FALLBACK_RELEVANCE } },
      "groundx search: 0 results at default relevance — retrying with low floor",
    );
    rawResults = await runSearch(RAG_FALLBACK_RELEVANCE);
  }
  const mapped: GroundXSearchResult[] = rawResults.map((r) => {
    // WF-03: the deployed API does NOT return a top-level `r.pageNumber`.
    // Page + bbox live in `r.boundingBoxes[]` (px corners + pageNumber) and
    // `r.pages[]` (page dims). Read geometry off the result and normalize.
    const { page, bbox } = bboxForResult(parseBoundingBoxes(r.boundingBoxes), parsePages(r.pages));
    return {
      documentId: typeof r.documentId === "string" ? r.documentId : String(r.documentId ?? ""),
      pageNumber: page,
      bbox: bbox ?? undefined,
      text: typeof r.text === "string" ? r.text : undefined,
      score: typeof r.score === "number" ? r.score : undefined,
      fileName: typeof r.fileName === "string" ? r.fileName : undefined,
    };
  });
  // WF-03 fallback — results that carry NO search-side geometry resolve from
  // the document's X-Ray (cached per doc). Fires ONLY when `bbox` is absent,
  // so the common layout-doc path (geometry already on the result) pays no
  // X-Ray fetch. Best-effort: a failed fetch/parse leaves the citation bare.
  for (const r of mapped) {
    if (r.bbox || !r.text || !r.documentId) continue;
    const xray = await fetchDocumentXray(client, apiKey, r.documentId);
    if (!xray) continue;
    const geo = resolveGeometryFromXray(r.text, xray);
    if (geo) {
      r.pageNumber = geo.page;
      if (geo.bbox) r.bbox = geo.bbox;
    }
  }
  // Result summary for dev visibility (top scores + filenames; we
  // DON'T log full snippet text because it can contain user content
  // and would dominate the log).
  logger.info(
    {
      groundxSearchResult: {
        count: mapped.length,
        topScore: mapped[0]?.score ?? null,
        files: Array.from(new Set(mapped.map((r) => r.fileName).filter(Boolean))).slice(0, 3),
        // Top-3 snippets with truncated text so the log shows what
        // actually came back from GroundX without exploding.
        topSnippets: mapped.slice(0, 3).map((r) => ({
          documentId: r.documentId,
          fileName: r.fileName,
          page: r.pageNumber,
          score: r.score,
          textPreview: (r.text ?? "").slice(0, 240),
        })),
      },
    },
    "groundx search result",
  );
  // Capture dev-side debug snapshot (browser surfaces this via _debug
  // on the chat reply). Only populated when the caller passes
  // `options.debug` — `searchGroundX` doesn't know whether the caller
  // wants diagnostics or not.
  if (options.debug) {
    options.debug.groundx = {
      path,
      query,
      n: typeof body.n === "number" ? body.n : RAG_SEARCH_LIMIT,
      filter: body.filter ?? null,
      resultCount: mapped.length,
      topSnippets: mapped.slice(0, 3).map((r) => ({
        documentId: r.documentId,
        fileName: r.fileName,
        score: r.score,
        text: (r.text ?? "").slice(0, 240),
      })),
    };
  }
  return mapped;
}
