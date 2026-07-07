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

import {
  assignTier,
  confidenceFor,
  verifyQuote,
  type QuoteVerification,
} from "./attribution.js";

/** Strength order for picking the best same-page verification result. */
const VERIFY_METHOD_RANK = { none: 0, embedding: 1, normalized: 2, exact: 3 } as const;
function verificationRank(v: QuoteVerification): number {
  return VERIFY_METHOD_RANK[v.method] + v.score;
}
import {
  normalizeText,
  dedupeGeometryRegions,
  resolveFieldGeometry,
  resolveWordGeometry,
  type NormalizedBbox,
} from "./citationGeometry.js";
import { fetchDocumentWordMap } from "./wordMapCache.js";
import { fetchDocumentXray } from "./xrayCache.js";
import { callGroundedLlm, parseGroundedAnswer, type ServerToolLoop } from "./ragPipeline.js";
import { turnStreamContext } from "./streamSink.js";
import { getServerTool } from "./toolCatalog.js";
import { searchGroundX, type SearchGroundXOptions } from "./groundxSearch.js";
import { retrieveGroundxKnowledge, type RetrieveOptions } from "./groundxSkills.js";
import { FALLBACK_TURN_PLAN, RETRIEVER_DECIDES, type TurnPlan } from "./turnRouter.js";
import {
  isExtractionCitation,
  RAG_SNIPPET_CHARS,
  type ChatRouterDebug,
  type Citation,
  type ExtractionCitation,
  type GroundXSearchResult,
  type SnippetCitation,
  type RawToolCall,
  type ToolActivity,
  type ToolFailure,
} from "./chatRouterTypes.js";

import type { GroundXClient, LlmClient } from "../types.js";
import { logger } from "../lib/logger.js";

import type { ContentScope, GeneratedResult, CitationSourceRegion } from "@groundx/shared";
import { type OpenAiFunctionTool } from "./zodToJsonSchema.js";

/** Dependencies the grounded-answer pipeline needs. Mirrors the RAG / Extract
 * required-deps guard: the live clients are always mandatory. */
export interface GroundedAnswerDeps {
  /**
   * GroundX client + key. OPTIONAL since the hybrid merge (Task 3): the
   * hybrid caller degrades to an empty-snippet grounded call when GroundX
   * isn't configured. Chat + report callers guard these upstream and always
   * pass both; when absent, search + extraction are skipped (snippets = []).
   */
  groundxClient?: GroundXClient;
  groundxApiKey?: string;
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
  /**
   * GroundX skill-pack retrieval seam (2026-06-11). Returns the prompt-ready
   * skill sections relevant to the question, or null when nothing clears the
   * relevance bar. Defaults to the live `retrieveGroundxKnowledge` over the
   * vendored pack; tests inject a fixture.
   */
  skillsRetrieve?: (question: string, options?: Pick<RetrieveOptions, "bypassEntryBar">) => string | null;
  /**
   * Embedding-similarity verification seam (wire-embedding-verification).
   * The third `verifyQuote` gate: best quote-vs-sentences cosine. Defaults to
   * none — lexical-only verification (the dev-degrade posture). The
   * composition root passes the live `makeQuoteEmbedder` when the
   * `EMBEDDINGS_*` provider is configured; tests inject a fixture. Failure
   * anywhere in the embedder degrades the citation tier, never the turn.
   */
  quoteEmbedder?: import("./attribution.js").Embedder;
  /** Verification threshold for the embedding gate (env `EMBEDDINGS_VERIFY_THRESHOLD`, default 0.82). */
  embedThreshold?: number;
  /**
   * chat-unified-tool-loop D3 — account/workspace reader deps threaded to the
   * server-tool loop's `ServerExecuteContext` for the account reader tools.
   * OPTIONAL: only the chat caller (which advertises those tools) passes them.
   */
  repository?: import("../types.js").AppRepository;
  partnerClient?: import("../types.js").GroundXPartnerClient;
  groundxUsername?: string | null;
  byoPagesLimit?: number;
}

/** Optional knobs for the grounded call — the chat path passes its scope hint,
 * tool catalog, and dev debug accumulator; the report path passes none. */
export interface GroundedAnswerOptions {
  scopeHint?: { fileName?: string | null; scenarioTitle?: string | null };
  /** Native function-calling tool catalog advertised to the LLM (chat only). */
  tools?: OpenAiFunctionTool[];
  /** Dev-only diagnostic accumulator (populated by search + LLM). */
  debug?: {
    groundx?: ChatRouterDebug["groundx"];
    llm?: ChatRouterDebug["llm"];
    /** U4 — the per-turn citation funnel (set by the seam itself). */
    citations?: ChatRouterDebug["citations"];
  };
  /**
   * Hybrid merge (Task 3) — a pre-composed workspace-state block rendered
   * into the grounded system prompt as private context (WORKSPACE STATE).
   */
  structuredContext?: string | null;
  /**
   * Hybrid merge (Task 3) — when true, a thrown GroundX search degrades to
   * empty snippets instead of failing the turn (hybrid is best-effort on the
   * RAG side; chat + report keep the throwing behavior).
   */
  searchSoftFail?: boolean;
  /**
   * FIXED turn plan (Task 4) — callers whose retrieval needs are static skip
   * the planner entirely: hybrid + report pass
   * `{ documentSearch: true, productKnowledge: false, extractionContext: true }`.
   * The chat router also threads its already-computed seam plan here
   * (turn-router-extraction-appstate) so the planner runs at most once per
   * turn.
   */
  turnPlan?: TurnPlan;
  /**
   * Task 6 — pre-rendered TOOL NOTES section (from the chat caller's
   * step-filtered catalog). Null/absent for report + hybrid (no tools).
   */
  toolNotes?: string | null;
  /**
   * agentic-tool-loop — enables the bounded server-side tool-result loop. The
   * chat caller passes `{ maxRounds: 4 }`; report + hybrid pass nothing (and
   * also pass no `tools`, so no server tool can be emitted). When set AND
   * `tools` is present, a server-executed tool call (e.g. `lookup_groundx_docs`)
   * is run by the middleware and its result fed back to the model.
   */
  toolLoop?: { maxRounds: number };
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
  /** ROUTED (non-server-executed) tool calls the LLM emitted (chat tool-routing;
   * empty for report). Server-executed calls are consumed by the loop and are
   * NOT here. */
  toolCalls: RawToolCall[];
  /** agentic-tool-loop — successfully server-executed tool calls (→ reply.toolActivity). */
  toolActivity: ToolActivity[];
  /** agentic-tool-loop — server-tool validation/executor failures (→ reply.toolFailures). */
  serverToolFailures: ToolFailure[];
}

/**
 * Verify the LLM-emitted structured citations against the snippet set and emit
 * graduated-tier `Citation[]`. This is the WF-06b loop lifted verbatim from
 * `runRagPipeline` (was ragPipeline.ts ~235-298) so chat + report share ONE
 * implementation. When the LLM emitted no usable structured citations the
 * reply carries NO citations (no-invented-citations, 2026-06-11) — omitting
 * the block is the model's signal the answer didn't draw on the documents.
 */
/** The fetched extraction the verify loop validates extraction-sourced
 * citations against: the document it was fetched for + the PARSED payload
 * (never the capped prompt string — truncated JSON does not re-parse). */
interface ExtractionContext {
  documentId: string;
  payload: unknown;
}

/**
 * Resolve a dotted/bracket path (`meters[0].meter_number`) inside the parsed
 * extraction payload. Pure lookup — no eval. Returns `{ found: false }` for
 * any unresolvable segment so a fabricated path can never validate.
 */
export function resolveExtractionPath(
  payload: unknown,
  path: string,
): { found: boolean; value?: unknown } {
  if (!path || path.length > 512) return { found: false };
  // "meters[0].meter_number" → ["meters", "0", "meter_number"]
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  if (!segments.length) return { found: false };
  let current: unknown = payload;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return { found: false };
      current = current[Number(segment)];
    } else if (current != null && typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
      current = (current as Record<string, unknown>)[segment];
    } else {
      return { found: false };
    }
    if (current === undefined) return { found: false };
  }
  return { found: true, value: current };
}

/**
 * Collect the scalar leaf VALUES (string/number) of an extraction node, walking
 * objects + arrays generically (multi-region-citations — the former
 * `branchNode` drop descends here instead). Booleans + null are skipped (not
 * locatable as document text). Depth-bounded against pathological nesting.
 * SCHEMA-AGNOSTIC: keys are never inspected — only the values are collected.
 */
export function collectScalarLeaves(node: unknown, out: Array<string | number>, depth = 0): void {
  if (depth > 8) return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const child of node) collectScalarLeaves(child, out, depth + 1);
  } else if (node != null && typeof node === "object") {
    for (const child of Object.values(node)) collectScalarLeaves(child, out, depth + 1);
  }
}

/**
 * Upper bound on how many DISTINCT leaf values of a container citation we
 * locate. Locating is O(leaves × X-Ray chunks) on the blocking chat turn, and a
 * citation of a very large container (or the root) on a big-schema document
 * could otherwise spike latency. 200 distinct values is already far more than a
 * highlight set should show; beyond it we bound the work (and log).
 */
const MAX_CONTAINER_LEAVES = 200;

/**
 * Validate + resolve ONE extraction-sourced citation (2026-06-11-extraction-
 * grounded-citations; multi-region-citations P1.3). The trust boundary is the
 * REAL extraction payload — never model output: the documentId must be the
 * extraction's document, the `field` path must resolve, and (for a scalar) the
 * cited `value` must match the payload value (exact, else normalized). Those
 * checks reject FABRICATED claims (Bucket A → dropped).
 *
 * A REAL grounding is NEVER dropped (Bucket B): a container path descends to its
 * scalar leaves and locates each; geometry comes from the multi-region field
 * resolver over the cached X-Ray (a region per occurrence). When a validated
 * value can't be located (reformatted/derived/too-common, or the X-Ray is
 * unfetchable), it degrades — last-resort label-locate, else a REGIONLESS
 * `ambient` source chip ("location unknown") — but is not dropped. Best-effort
 * throughout: any failure degrades, never a failed turn.
 */
/** harden-citation-emission U4 — the per-turn citation funnel (the shared
 * `ChatReplyDebug["citations"]` shape). Every silent discard increments a
 * reason so an omitted block (`emitted: 0`) is distinguishable from an
 * all-dropped turn (`emitted > 0, shipped: 0`). */
export type CitationFunnel = NonNullable<NonNullable<ChatRouterDebug["citations"]>>;
type DropReason = keyof CitationFunnel["dropReasons"];

function emptyFunnel(): CitationFunnel {
  return {
    emitted: 0,
    validSnippetForm: 0,
    validExtractionForm: 0,
    shipped: 0,
    dropReasons: { parse: 0, docId: 0, page: 0, path: 0, value: 0, branchNode: 0, geometry: 0 },
  };
}

async function verifyExtractionCitation(
  c: ExtractionCitation,
  extractionCtx: ExtractionContext | null,
  deps: GroundedAnswerDeps,
  drop: (reason: DropReason) => void,
): Promise<Citation | null> {
  if (!extractionCtx || c.documentId !== extractionCtx.documentId) {
    drop("docId");
    return null;
  }

  const resolved = resolveExtractionPath(extractionCtx.payload, c.field);
  if (!resolved.found) {
    drop("path");
    return null;
  }
  const actual = resolved.value;
  const label = c.field.split(".").pop()?.replace(/\[\d+\]/g, "") ?? "";

  // Determine WHAT to locate + how the value verifies. A scalar is validated
  // against the cited value (a mismatch is Bucket A → dropped). A CONTAINER (the
  // former `branchNode` drop) is real proof by virtue of the path resolving —
  // descend to its scalar leaves and locate each (no per-leaf value to validate).
  let valuesToLocate: Array<string | number>;
  let v: QuoteVerification;
  let displayValue: string;
  const isScalar =
    typeof actual === "string" || typeof actual === "number" || typeof actual === "boolean";
  if (isScalar) {
    const cited = String(c.value);
    const matches = String(actual) === cited || normalizeText(String(actual)) === normalizeText(cited);
    if (!matches) {
      drop("value"); // Bucket A — the cited value isn't the extracted value
      return null;
    }
    v = String(actual) === cited ? { verified: true, method: "exact", score: 1 } : { verified: true, method: "normalized", score: 0 };
    // A boolean isn't locatable document text; it degrades to the fallback below.
    valuesToLocate = typeof actual === "boolean" ? [] : [actual];
    displayValue = String(actual);
  } else if (actual != null && typeof actual === "object") {
    const leaves: Array<string | number> = [];
    collectScalarLeaves(actual, leaves);
    const distinct = [...new Map(leaves.map((l) => [String(l), l])).values()]; // dedupe by string form
    // Bound the located-leaf count (O(leaves × chunks) on the blocking turn). The
    // citation still ships — its location set is just capped — and we log it.
    if (distinct.length > MAX_CONTAINER_LEAVES) {
      logger.warn(
        { field: c.field, leafCount: distinct.length, cap: MAX_CONTAINER_LEAVES },
        "verifyExtractionCitation: container has many distinct leaf values; locating a bounded subset",
      );
    }
    valuesToLocate = distinct.slice(0, MAX_CONTAINER_LEAVES);
    v = { verified: true, method: "normalized", score: 0 }; // chunk-level (no single verbatim value)
    displayValue = label;
  } else {
    drop("value"); // a null/undefined leaf — nothing to ground
    return null;
  }

  // Build the citation that ships when geometry can't be resolved: a REGIONLESS
  // `ambient` source chip ("location unknown"). Never a drop — the value/path is
  // validated, so the proof is real even when its on-page spot is unknown.
  const regionlessChip = (): Citation => ({
    documentId: c.documentId,
    snippet: `${label}: ${displayValue}`.slice(0, RAG_SNIPPET_CHARS),
    tier: "ambient",
    confidence: confidenceFor(v),
    ...(c.answerSpan ? { answerSpan: c.answerSpan } : {}),
  });
  const shipRegions = (regions: CitationSourceRegion[]): Citation => {
    const first = regions[0];
    return {
      documentId: c.documentId,
      page: first.page,
      bbox: first.bbox,
      regions,
      snippet: `${label}: ${displayValue}`.slice(0, RAG_SNIPPET_CHARS),
      tier: first.tier,
      confidence: confidenceFor(v),
      ...(c.answerSpan ? { answerSpan: c.answerSpan } : {}),
    };
  };

  if (!deps.groundxClient || !deps.groundxApiKey) {
    return regionlessChip(); // can't fetch the X-Ray → location unknown, not dropped
  }
  try {
    const xray = await fetchDocumentXray(deps.groundxClient, deps.groundxApiKey, c.documentId);
    if (!xray) return regionlessChip();

    // multi-region: a region for EVERY chunk where each value appears (D1),
    // located by the numeric/whole-token match — never one union box, never
    // narrowed by the label.
    const collected: ReturnType<typeof resolveFieldGeometry> = [];
    for (const val of valuesToLocate) collected.push(...resolveFieldGeometry(val, label, xray));
    // Several leaves of a container often land in the SAME chunk → identical
    // boxes; collapse the exact duplicates so the persisted/wire region set
    // isn't bloated (distinct occurrences are kept).
    const fieldRegions = dedupeGeometryRegions(collected);

    if (fieldRegions.length === 0) {
      // Never-drop fallback (review #8): (1) last-resort locate by the GENERIC
      // field label; (2) else a regionless `ambient` chip.
      const labelText = label.replace(/[_-]+/g, " ").trim();
      const labelRegions = labelText.length >= 2 ? resolveFieldGeometry(labelText, "", xray) : [];
      if (labelRegions.length > 0) {
        return shipRegions(labelRegions.map((g) => ({ page: g.page, bbox: g.bbox, tier: "ambient" as const })));
      }
      return regionlessChip();
    }

    const chunkTier = assignTier(v, { hasAtomBox: false });
    let regions: CitationSourceRegion[] = fieldRegions.map((g) => ({ page: g.page, bbox: g.bbox, tier: chunkTier }));

    // Word-level upgrade — only for a SINGLE scalar value (a verbatim span): an
    // atom-run hit yields a tight word box that supersedes the FIRST chunk
    // region and lights `exact`. Best-effort; never drops.
    if (isScalar && typeof actual !== "boolean") {
      try {
        const wordMapFetch = deps.wordMapFetch ?? fetchDocumentWordMap;
        const map = await wordMapFetch(deps.groundxClient, deps.groundxApiKey, c.documentId);
        if (map) {
          const wordGeo = resolveWordGeometry(String(actual), map);
          if (wordGeo) {
            regions = [
              { page: wordGeo.page, bbox: wordGeo.bbox, tier: assignTier(v, { hasAtomBox: true }) },
              ...regions.slice(1),
            ];
          }
        }
      } catch (err) {
        logger.warn({ err }, "verifyExtractionCitation: word-map upgrade failed; keeping chunk geometry");
      }
    }

    return shipRegions(regions);
  } catch (err) {
    // A real grounding is never dropped on a transient geometry failure — it
    // degrades to the location-unknown chip (and never fails the turn).
    logger.warn({ err }, "verifyExtractionCitation: geometry resolution failed; degrading to regionless chip");
    return regionlessChip();
  }
}

/**
 * Verify ONE emitted snippet citation against its same-page candidate chunks
 * and build the tiered `Citation`. This is the SINGLE home for snippet-citation
 * verification, shared by the grounded answer path (`verifiedCitations`) and the
 * field-extraction path (`fieldExtractor`) — one citation approach everywhere.
 *
 * WF-03: search routinely returns several chunks for the same (documentId,
 * page), so the quote must verify against ALL of them (checking only the first
 * demoted verbatim quotes from a sibling chunk to `ambient`, observed live
 * 2026-06-12). An emitted-but-unverified quote survives as `ambient` (it is NOT
 * dropped); the verified chunk's bbox pairs with the match, with a word-level
 * (`exact`) upgrade via the `-118-map` word resolver when available.
 */
/**
 * inline-footnote-citations — attach GroundX's display name (`fileName`) +
 * `sourceUrl` to a citation from the matching snippet (by `documentId`), unless
 * already set. Used by BOTH snippet-form and extraction-form citations so every
 * citation labels by its real document name instead of a `documentId` UUID.
 */
export function attachSourceMeta(citation: Citation, snippets: GroundXSearchResult[]): Citation {
  if (citation.fileName && citation.sourceUrl) return citation;
  const docMeta = snippets.find((s) => s.documentId === citation.documentId);
  if (!docMeta) return citation;
  return {
    ...citation,
    ...(citation.fileName || !docMeta.fileName ? {} : { fileName: docMeta.fileName }),
    ...(citation.sourceUrl || !docMeta.sourceUrl ? {} : { sourceUrl: docMeta.sourceUrl }),
  };
}

export async function verifyAndTierSnippetCitation(
  cite: { documentId: string; page: number; quote: string; answerSpan?: string },
  snippets: GroundXSearchResult[],
  deps: Pick<
    GroundedAnswerDeps,
    "quoteEmbedder" | "embedThreshold" | "groundxClient" | "groundxApiKey" | "wordMapFetch"
  >,
): Promise<Citation> {
  const candidates = snippets.filter(
    (s) => s.documentId === cite.documentId && (s.pageNumber ?? 1) === cite.page,
  );
  let v: QuoteVerification = { verified: false, method: "none", score: 0 };
  // multi-region: the chunk's per-line boxes (one region each, no union). Start
  // from the first same-page candidate; switch to the candidate that verifies.
  let bboxes: NormalizedBbox[] = candidates[0]?.bboxes ?? [];
  for (const candidate of candidates) {
    // The embedder is a LIVE blocking call; once ANY candidate verified, scan
    // the rest with lexical gates only (an embedding pass can't out-rank a held
    // lexical match — same tier either way).
    const cv = await verifyQuote(
      cite.quote,
      candidate.text ?? "",
      v.verified ? undefined : deps.quoteEmbedder,
      deps.embedThreshold,
    );
    if (verificationRank(cv) > verificationRank(v)) {
      v = cv;
      if (cv.verified) bboxes = candidate.bboxes ?? [];
    }
    if (cv.method === "exact") break; // can't do better
  }
  const tier = assignTier(v, { hasAtomBox: false });
  let regions: CitationSourceRegion[];
  if (v.verified) {
    // Each chunk-line box → its own region, all at the citation's tier.
    regions = bboxes.map((b) => ({ page: cite.page, bbox: b, tier }));
    // Word-level tighten: a verified quote's verbatim span resolves to ONE tight
    // box that supersedes the loose chunk-line regions (lights `exact`).
    const wordMapFetch = deps.wordMapFetch ?? fetchDocumentWordMap;
    if (deps.groundxClient && deps.groundxApiKey) {
      const map = await wordMapFetch(deps.groundxClient, deps.groundxApiKey, cite.documentId);
      if (map) {
        const geo = resolveWordGeometry(cite.quote, map);
        if (geo) regions = [{ page: geo.page, bbox: geo.bbox, tier: assignTier(v, { hasAtomBox: true }) }];
      }
    }
    // A VERIFIED quote whose chunk carried no resolvable box still gets a
    // whole-page marker on its page (at the verified tier) — so a confirmed
    // citation is never LESS visible than an unverified one (review #5).
    if (regions.length === 0) {
      regions = [{ page: cite.page, bbox: { x: 0, y: 0, w: 1, h: 1 }, tier }];
    }
  } else {
    // Unverified quote (exact + normalized + embedding all failed) — keep a
    // whole-PAGE `ambient` marker on the CLAIMED page (review #8 / R2), never a
    // guessed chunk box and never dropped: it shows what the model leaned on so
    // a bad pick is visible, without faking sub-page precision.
    regions = [{ page: cite.page, bbox: { x: 0, y: 0, w: 1, h: 1 }, tier: "ambient" }];
  }
  const first = regions[0];
  const built: Citation = {
    documentId: cite.documentId,
    page: cite.page,
    snippet: cite.quote.slice(0, RAG_SNIPPET_CHARS),
    ...(regions.length ? { regions } : {}),
    ...(first ? { bbox: first.bbox } : {}),
    tier: first?.tier ?? tier,
    confidence: confidenceFor(v),
    ...(cite.answerSpan ? { answerSpan: cite.answerSpan } : {}),
  };
  // Label by GroundX's real fileName (+ sourceUrl), recovered from the matching snippet.
  return attachSourceMeta(built, snippets);
}

async function verifiedCitations(
  rawAnswer: string,
  snippets: GroundXSearchResult[],
  deps: GroundedAnswerDeps,
  extractionCtx: ExtractionContext | null = null,
): Promise<{ citations: Citation[]; funnel: CitationFunnel }> {
  const parsed = parseGroundedAnswer(rawAnswer);
  const emitted = parsed.structuredCitations ?? [];
  // U4 — the citation funnel. Parse-level losses (malformed tagged fences,
  // arm-invalid entries) count as emitted-and-dropped: the model DID cite.
  const funnel = emptyFunnel();
  const parseLost = parsed.parseLosses.malformedJson + parsed.parseLosses.invalidEntries;
  funnel.emitted = emitted.length + parseLost;
  funnel.dropReasons.parse = parseLost;
  // Extraction-sourced entries (2026-06-11) validate against the fetched
  // extraction payload in `verifyExtractionCitation`, not the snippet set.
  const extractionEntries = emitted.filter(isExtractionCitation);
  funnel.validExtractionForm = extractionEntries.length;
  // CF-06 — the LLM may only cite documentIds present in the snippet set; the
  // cross-check is the trust boundary (we don't let the LLM invent references).
  const allowedDocIds = new Set(snippets.map((s) => s.documentId));
  const snippetFormEntries = emitted.filter((c): c is SnippetCitation => !isExtractionCitation(c));
  funnel.validSnippetForm = snippetFormEntries.length;
  const validatedCitations = snippetFormEntries.filter((c) => allowedDocIds.has(c.documentId));
  funnel.dropReasons.docId += snippetFormEntries.length - validatedCitations.length;

  if (validatedCitations.length === 0 && extractionEntries.length === 0) {
    // No invented citations (2026-06-11). The model is instructed to emit the
    // citations block only for content claims and to SKIP it for non-content
    // turns (product questions, jokes, small talk) — omitting the block is its
    // signal that the answer did not draw on the documents. The retired
    // "ambient fallback" cited the top snippets anyway, fabricating document
    // citations for answers that never used them ("what is GroundX?" carrying
    // utility-bill chips). A reply carries citations only when the model
    // actually cited; emitted-but-unverified quotes still survive below as
    // soft `ambient`-TIER citations (that path is the model citing, just
    // failing verbatim verification).
    return { citations: [], funnel };
  }

  const extractionCitations = (
    await Promise.all(
      extractionEntries.map((c) =>
        verifyExtractionCitation(c, extractionCtx, deps, (reason) => {
          funnel.dropReasons[reason] += 1;
        }),
      ),
    )
  )
    .filter((c): c is Citation => c !== null)
    // inline-footnote-citations follow-up — extraction-form citations are built
    // without snippets, so label them by fileName here from the primary doc's
    // snippet (same `attachSourceMeta` as the snippet-form path).
    .map((c) => attachSourceMeta(c, snippets));

  const snippetCitations = await Promise.all(
    validatedCitations.map((c) => verifyAndTierSnippetCitation(c, snippets, deps)),
  );

  const citations = [...snippetCitations, ...extractionCitations];
  funnel.shipped = citations.length;
  return { citations, funnel };
}

/**
 * Budget for the serialized extraction block handed to the LLM — bounds the
 * prompt for pathological extracts. Raised 6k -> 12k (harden-citation-emission
 * U3): the live utility sample serializes to ~6.2KB and was being cut
 * mid-string by the old slice.
 */
const EXTRACTION_PROMPT_CHARS = 12_000;

/**
 * Fit an extraction payload to the prompt budget STRUCTURALLY
 * (harden-citation-emission U3) — the block handed to the model is ALWAYS
 * valid JSON, never a mid-string slice. Strategy, in order, until under
 * budget: (1) drop the LAST element of the LARGEST-by-serialized-size array
 * anywhere in the payload; (2) drop trailing top-level fields; (3) truncate
 * the largest string value in place (a lone oversized scalar — better a
 * shortened value than an empty object). A reduced payload carries a
 * machine-readable `_truncated` marker (the contract tells the model never
 * to cite it).
 */
export function fitExtractionToBudget(
  payload: Record<string, unknown>,
  budget: number = EXTRACTION_PROMPT_CHARS,
): { block: string; dropped: number } {
  let serialized = JSON.stringify(payload);
  if (serialized.length <= budget) return { block: serialized, dropped: 0 };

  const clone = JSON.parse(serialized) as Record<string, unknown>;
  let dropped = 0;
  const size = () => JSON.stringify({ ...clone, _truncated: `${dropped} items omitted` }).length;

  // (1) Shed trailing items from the largest array, repeatedly.
  const collectArrays = (node: unknown, acc: unknown[][]): void => {
    if (Array.isArray(node)) {
      if (node.length > 0) acc.push(node as unknown[]);
      for (const child of node) collectArrays(child, acc);
    } else if (node != null && typeof node === "object") {
      for (const child of Object.values(node)) collectArrays(child, acc);
    }
  };
  while (size() > budget) {
    const arrays: unknown[][] = [];
    collectArrays(clone, arrays);
    if (arrays.length === 0) break;
    let largest = arrays[0];
    let largestSize = JSON.stringify(largest).length;
    for (const a of arrays) {
      const n = JSON.stringify(a).length;
      if (n > largestSize) { largest = a; largestSize = n; }
    }
    largest.pop();
    dropped += 1;
  }

  // (2) Drop trailing top-level fields.
  while (size() > budget) {
    const keys = Object.keys(clone);
    if (keys.length <= 1) break;
    delete clone[keys[keys.length - 1]];
    dropped += 1;
  }

  // (3) Lone oversized scalar — truncate the largest string value in place.
  if (size() > budget) {
    let bestKey: string | null = null;
    let bestLen = 0;
    for (const [k, v] of Object.entries(clone)) {
      if (typeof v === "string" && v.length > bestLen) { bestKey = k; bestLen = v.length; }
    }
    if (bestKey) {
      const overshoot = size() - budget;
      clone[bestKey] = (clone[bestKey] as string).slice(0, Math.max(0, bestLen - overshoot - 1));
      dropped += 1;
    }
  }

  clone._truncated = `${dropped} items omitted`;
  serialized = JSON.stringify(clone);
  return { block: serialized, dropped };
}

/**
 * Fetch a document's full workflow-extraction output (the same
 * `/ingest/document/extract/{id}` payload the Extract workbench renders).
 * Returns BOTH the parsed payload (extraction-citation validation needs the
 * real object — the capped string does not re-parse when truncated) and the
 * capped JSON string for the grounded prompt. Soft-fails to `null` on any
 * error or non-2xx — extraction enriches the prompt, it never gates the
 * answer.
 */
async function fetchDocumentExtraction(
  client: GroundXClient,
  apiKey: string | null,
  documentId: string,
): Promise<{ payload: unknown; promptBlock: string } | null> {
  if (!apiKey) return null;
  try {
    const response = await client.forward(`/ingest/document/extract/${encodeURIComponent(documentId)}`, {
      method: "GET",
      apiKey,
    } as RequestInit & { apiKey: string });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    if (payload == null || typeof payload !== "object") return null;
    // Structural fit (U3): always-valid JSON; never a mid-string slice.
    const { block: promptBlock, dropped } = fitExtractionToBudget(
      payload as Record<string, unknown>,
    );
    if (dropped > 0) {
      logger.warn(
        {
          extractionPromptTruncated: {
            documentId,
            payloadChars: JSON.stringify(payload).length,
            promptChars: promptBlock.length,
            droppedItems: dropped,
          },
        },
        "extraction prompt block truncated structurally",
      );
    }
    return { payload, promptBlock };
  } catch {
    return null;
  }
}

/**
 * The concrete projectId allowlist an RBAC filter encodes (`{projectId:{$in:[…]}}`,
 * from `rbacFilterForProjects`), or null when the filter doesn't constrain projectId
 * (a partner/admin context with no RBAC scoping). Used for the secondary-extraction
 * defense-in-depth check below.
 */
function rbacProjectAllowlist(rbacFilter: Record<string, unknown> | undefined): string[] | null {
  const p = rbacFilter?.projectId;
  // The production shape is `{projectId:{$in:[…]}}` (rbacFilterForProjects), but also
  // accept a single `{projectId:"x"}` fast-path so a future filter-shape change can't
  // SILENTLY disable this defense-in-depth layer. An unrecognized shape → null (skip).
  if (typeof p === "string") return [p];
  if (p && typeof p === "object" && Array.isArray((p as { $in?: unknown }).$in)) {
    return (p as { $in: unknown[] }).$in.filter((x): x is string => typeof x === "string");
  }
  return null;
}

/**
 * loop-tool-secondary-extraction — INDEPENDENTLY re-derive a document's project from
 * its `document_get` metadata (`(payload.document ?? payload).filter.projectId`, the
 * flat filter the seed/upload stamps). This is the second authorization layer for the
 * extract fetch: unlike the in-process `authorizedDocIds` Set (derived from the SAME
 * RBAC-filtered snippets), this asks GroundX afresh, so a foreign-project doc that
 * leaked into snippets via an upstream RBAC regression is still caught. Returns null
 * on any miss (no key, non-200, unexpected shape) so the check can fall back to the
 * Set guard rather than break a legitimate cross-document answer on a transient.
 */
async function fetchDocumentProjectId(
  client: GroundXClient,
  apiKey: string | null,
  documentId: string,
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await client.forward(`/ingest/document/${encodeURIComponent(documentId)}`, {
      method: "GET",
      apiKey,
    } as RequestInit & { apiKey: string });
    if (!res.ok) return null;
    const payload = (await res.json()) as unknown;
    const top = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const doc = (top.document && typeof top.document === "object" ? top.document : top) as Record<string, unknown>;
    const filter = (doc.filter && typeof doc.filter === "object" ? doc.filter : {}) as Record<string, unknown>;
    return typeof filter.projectId === "string" ? filter.projectId : null;
  } catch {
    return null;
  }
}

/**
 * loop-tool-refined-research — format re-search snippets as the `role:"tool"`
 * result fed back into the grounded loop. Per-snippet cap reuses the shared
 * `RAG_SNIPPET_CHARS`; a total cap keeps a broad re-search from bloating the
 * next completion. Deliberately a small LOCAL formatter (not `buildSnippetBlock`,
 * which lives in `ragPipeline.ts` and would create a ragPipeline↔groundedAnswer
 * import cycle); the tool-result message is a distinct consumer from the prompt
 * snippet block. If a third caller appears, extract a shared snippet formatter.
 */
const RESEARCH_RESULT_MAX_CHARS = 4000;
function formatResearchSnippets(snippets: GroundXSearchResult[]): string {
  if (snippets.length === 0) return "No additional document passages matched that query.";
  const entries: string[] = [];
  let used = 0;
  for (const [i, s] of snippets.entries()) {
    const entry = `[${i + 1}] page ${s.pageNumber ?? "?"}\n${(s.text ?? "").slice(0, RAG_SNIPPET_CHARS)}`;
    // Always include the FIRST snippet; stop adding once the total cap is hit so
    // a broad re-search can't bloat the next completion. (Per-snippet cap 600 ≪
    // 4000, so the first entry always fits — no separate "first too big" branch.)
    if (entries.length > 0 && used + 2 + entry.length > RESEARCH_RESULT_MAX_CHARS) break;
    entries.push(entry);
    used += entry.length + (entries.length > 1 ? 2 : 0);
  }
  return entries.join("\n\n");
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
  // chat-unified-tool-loop — the turn plan is supplied by the ONLY caller
  // (routeChat passes a fixed plan: documentSearch on, productKnowledge off,
  // extractionContext on). The light-LLM planner was removed; when no plan is
  // threaded (report path), the deterministic FALLBACK_TURN_PLAN applies.
  const plan: TurnPlan = options.turnPlan ?? FALLBACK_TURN_PLAN;

  // analyze-and-chat-ux §6.2 — source-1 thinking narration at the REAL phase
  // boundaries, through the same ambient per-turn sink the token/activity
  // frames use. No ambient sink (non-streaming callers, report path, existing
  // tests) → no-op, byte-identical behavior.
  const thinkingSink = turnStreamContext.getStore();
  const status = (text: string): void => thinkingSink?.onThinking?.({ kind: "status", text });

  const searchOptions: SearchGroundXOptions = {
    ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
    ...(options.debug ? { debug: options.debug } : {}),
  };
  // GroundX optional since the hybrid merge: no client -> empty snippets
  // (the grounded LLM still answers from workspace state / conversationally).
  let snippets: GroundXSearchResult[] = [];
  if (plan.documentSearch && deps.groundxClient && deps.groundxApiKey) {
    status("Searching your documents");
    try {
      snippets = await searchGroundX(
        question,
        scope,
        deps.groundxClient,
        deps.groundxApiKey,
        searchOptions,
      );
    } catch (err) {
      if (!options.searchSoftFail) throw err;
      logger.warn({ err }, "groundedAnswerOverScope: search failed; proceeding with empty snippets (searchSoftFail)");
    }
    status(
      snippets.length
        ? `Reading ${snippets.length} matching passage${snippets.length === 1 ? "" : "s"}`
        : "No matching passages — answering from the workspace context",
    );
  }

  // RAG + raw extraction (2026-06-11). Search retrieves only the TOP-K
  // matching chunks, so structured questions ("what is the meter number?",
  // "how many meters?") miss when the matching chunk isn't retrieved. Also
  // hand the LLM the document's FULL workflow-extraction output: primary doc
  // = the scope's explicit document, else the top snippet's. Soft-fails to
  // snippets-only (extraction is an enrichment, never a gate). Plan-gated
  // (turn-router-extraction-appstate): `extractionContext: false` skips the
  // fetch before any HTTP call; `true` (incl. the deterministic fallback) is
  // byte-for-byte the pre-flag fetch-when-primary-doc-exists behavior.
  const primaryDocId =
    (scope?.type === "documents" ? scope.documentIds[0] : undefined) ?? snippets[0]?.documentId;
  const extraction = plan.extractionContext !== false && primaryDocId && deps.groundxClient
    ? await fetchDocumentExtraction(deps.groundxClient, deps.groundxApiKey ?? null, primaryDocId)
    : null;

  // GroundX skill knowledge (2026-06-11) — retrieve the relevant sections of
  // the vendored groundx-agent-harness skill pack for product/meta questions
  // ("what is groundx?", "how do buckets work?"). Null for ordinary document
  // questions → zero prompt overhead. Injectable for deterministic tests.
  // Plan-gated (Task 4): `false` skips retrieval entirely (the S1 fix —
  // document questions stop paying 3-4.5KB of irrelevant skill content);
  // `true` bypasses the retriever's entry bar (the planner replaced that
  // heuristic); the RETRIEVER_DECIDES fallback runs it gate-intact.
  const skillsRetrieve = deps.skillsRetrieve ?? retrieveGroundxKnowledge;
  const skillKnowledge =
    plan.productKnowledge === false
      ? null
      : plan.productKnowledge === RETRIEVER_DECIDES
        ? skillsRetrieve(question)
        : skillsRetrieve(question, { bypassEntryBar: true });

  // loop-tool-refined-research — bind the re-search seam to the TURN's scope +
  // search options (the SAME `rbacFilter` as the primary search above), so the
  // `search_documents` executor re-queries the current documents only and can
  // NEVER widen scope. No GroundX client → a graceful "unavailable" line.
  const researchDocuments = async (refinedQuery: string): Promise<string> => {
    if (!deps.groundxClient || !deps.groundxApiKey) {
      return "Document search is unavailable for this turn.";
    }
    // Reuse the SAME RBAC filter (the scope-safety-critical part) but NOT the
    // `debug` accumulator from `searchOptions`: `searchGroundX` writes the
    // SINGULAR `options.debug.groundx`, so a re-search would clobber the primary
    // search's dev debug record. Filter-only options keep the primary's debug intact.
    const results = await searchGroundX(
      refinedQuery,
      scope,
      deps.groundxClient,
      deps.groundxApiKey,
      deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {},
    );
    return formatResearchSnippets(results);
  };

  // loop-tool-secondary-extraction — the AUTHORIZED document set for this turn:
  // documents the RBAC-filtered search surfaced (`snippets`) plus an explicit
  // `documents` scope. `fetchExtraction` REFUSES any id outside it with no fetch,
  // so the model can't pull an out-of-scope / foreign document's fields (e.g. a
  // documentId injected into document text). Same authorization boundary the
  // citation validation uses (`allowedDocIds` = snippet docIds).
  const authorizedDocIds = new Set<string>([
    ...snippets.map((s) => s.documentId),
    ...(scope?.type === "documents" ? scope.documentIds : []),
  ]);
  // Defense-in-depth: the RBAC project allowlist this turn is scoped to (the LOCKED
  // filter mechanism). When present, the extract fetch is re-checked against the
  // fetched document's OWN project below — an independent layer beyond the Set.
  const projectAllowlist = rbacProjectAllowlist(deps.rbacFilter);
  const docProjectMemo = new Map<string, Promise<string | null>>();
  // Per-turn memo so repeated tool fetches of the SAME document don't re-hit the
  // API across loop rounds (extraction has no module cache, unlike X-Ray). Only
  // AUTHORIZED fetches are memoized (a refusal throws before this, and is cheap).
  const extractionMemo = new Map<string, Promise<string>>();
  const fetchExtraction = async (documentId: string): Promise<string> => {
    if (!authorizedDocIds.has(documentId)) {
      // An out-of-scope id (model confusion / prompt-injected document text) is a
      // security-relevant REFUSAL — surface it as a tool FAILURE (→
      // `serverToolFailures` + this warn log), NOT a successful-looking "fetched"
      // activity. The loop feeds the model a terse error; the turn still succeeds.
      logger.warn(
        { secondaryExtractionRefused: { documentId } },
        "secondary extraction refused: document not surfaced under this turn's authorization",
      );
      throw new Error("document not available in this conversation");
    }
    if (!deps.groundxClient) return "Extraction is unavailable for this turn.";
    // Second authorization layer (only when RBAC constrains projects): independently
    // confirm the document's OWN project is within this turn's allowlist. A foreign
    // doc that slipped into the Set via an upstream RBAC regression is refused here.
    // A metadata MISS (null) falls back to the Set guard — don't break a legit answer.
    if (projectAllowlist) {
      let pid = docProjectMemo.get(documentId);
      if (!pid) {
        pid = fetchDocumentProjectId(deps.groundxClient, deps.groundxApiKey ?? null, documentId);
        docProjectMemo.set(documentId, pid);
      }
      const projectId = await pid;
      if (projectId != null && !projectAllowlist.includes(projectId)) {
        logger.warn(
          { secondaryExtractionRbacDenied: { documentId, projectId } },
          "secondary extraction refused: document's project is outside this turn's RBAC allowlist",
        );
        throw new Error("document not available in this conversation");
      }
    }
    let cached = extractionMemo.get(documentId);
    if (!cached) {
      cached = fetchDocumentExtraction(deps.groundxClient, deps.groundxApiKey ?? null, documentId).then(
        (extraction) => extraction?.promptBlock ?? "No structured extraction found for that document.",
      );
      extractionMemo.set(documentId, cached);
    }
    return cached;
  };

  // agentic-tool-loop — build the bounded server-tool loop controller when the
  // caller opted in (chat) AND advertised tools. The controller bridges the
  // catalog (`getServerTool`) + the injected `skillsRetrieve` seam into
  // `callGroundedLlm`, which stays catalog-agnostic. Report + hybrid pass no
  // `toolLoop` (and no `tools`), so this stays undefined → single-shot.
  const serverToolLoop: ServerToolLoop | undefined =
    options.toolLoop && options.tools
      ? {
          maxRounds: options.toolLoop.maxRounds,
          isServerTool: (name) => typeof getServerTool(name)?.serverExecute === "function",
          execute: async (call) => {
            const tool = getServerTool(call.name);
            if (!tool?.serverExecute) {
              // Defensive: isServerTool gated this, so this is unreachable.
              return { result: "tool not executable", failure: { name: call.name, reason: "not_server_executable" } };
            }
            let parsedArgs: unknown;
            try {
              parsedArgs = JSON.parse(call.argumentsJson);
            } catch {
              return { result: `${call.name} failed: arguments_not_valid_json`, failure: { name: call.name, reason: "arguments_not_valid_json" } };
            }
            const parse = tool.inputSchema.safeParse(parsedArgs);
            if (!parse.success) {
              const reason = parse.error.issues
                .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
                .join("; ");
              return { result: `${call.name} failed: invalid arguments — ${reason}`, failure: { name: call.name, reason: `invalid arguments — ${reason}` } };
            }
            try {
              const result = await tool.serverExecute(parse.data, {
                skillsRetrieve,
                researchDocuments,
                fetchExtraction,
                // chat-unified-tool-loop D3 — account reader deps (undefined for
                // callers that don't pass them; those tools then aren't advertised).
                ...(deps.repository ? { repository: deps.repository } : {}),
                ...(deps.partnerClient ? { partnerClient: deps.partnerClient } : {}),
                groundxUsername: deps.groundxUsername ?? null,
                ...(deps.byoPagesLimit !== undefined ? { byoPagesLimit: deps.byoPagesLimit } : {}),
              });
              return {
                result,
                ...(tool.activityLabel ? { activity: { name: call.name, label: tool.activityLabel } } : {}),
              };
            } catch (err) {
              return { result: `${call.name} failed: ${String(err)}`, failure: { name: call.name, reason: "executor_error" } };
            }
          },
        }
      : undefined;

  status("Writing a grounded answer");
  const llmResponse = await callGroundedLlm(
    question,
    snippets,
    deps.llmClient,
    deps.llmModelId,
    options.scopeHint,
    options.debug,
    options.tools,
    extraction?.promptBlock ?? null,
    skillKnowledge,
    options.structuredContext,
    options.toolNotes,
    serverToolLoop,
  );

  status("Verifying citations against the source");
  const parsed = parseGroundedAnswer(llmResponse.answer);
  const { citations, funnel } = await verifiedCitations(
    llmResponse.answer,
    snippets,
    deps,
    extraction && primaryDocId ? { documentId: primaryDocId, payload: extraction.payload } : null,
  );
  // U4 — ONE prod-safe funnel log per grounded turn (counts only, no
  // content); also surfaced on `_debug.citations` when the caller carries a
  // debug accumulator (chat dev-mode does; report + hybrid pass none).
  logger.info({ citationFunnel: funnel }, "grounded citation funnel");
  if (options.debug) options.debug.citations = funnel;

  return {
    body: parsed.cleanedAnswer,
    citations,
    snippets,
    toolCalls: llmResponse.toolCalls,
    toolActivity: llmResponse.toolActivity,
    serverToolFailures: llmResponse.serverToolFailures,
  };
}
