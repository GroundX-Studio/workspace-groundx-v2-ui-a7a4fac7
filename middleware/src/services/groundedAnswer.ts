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
  resolveFieldGeometry,
  resolveWordGeometry,
  type NormalizedBbox,
} from "./citationGeometry.js";
import { fetchDocumentWordMap } from "./wordMapCache.js";
import { fetchDocumentXray } from "./xrayCache.js";
import { callGroundedLlm, parseGroundedAnswer, type ServerToolLoop } from "./ragPipeline.js";
import { getServerTool } from "./toolCatalog.js";
import { searchGroundX, type SearchGroundXOptions } from "./groundxSearch.js";
import { retrieveGroundxKnowledge, type RetrieveOptions } from "./groundxSkills.js";
import {
  FALLBACK_TURN_PLAN,
  RETRIEVER_DECIDES,
  planTurn,
  type PlanTurnFn,
  type TurnPlan,
} from "./turnRouter.js";
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

import type { ContentScope, GeneratedResult } from "@groundx/shared";
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
   * Turn-router seam (Task 4). The light client + model the planner runs on
   * (CF-16 `LLM_LIGHT_*`); absent -> deterministic fallback plan. `planTurn`
   * itself is injectable for deterministic tests.
   */
  lightLlmClient?: LlmClient;
  lightLlmModelId?: string;
  planTurn?: PlanTurnFn;
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
 * Validate + resolve ONE extraction-sourced citation (2026-06-11-extraction-
 * grounded-citations). The trust boundary is the REAL extraction payload —
 * never model output: the documentId must be the extraction's document, the
 * `field` path must resolve, and the cited `value` must match the payload
 * value (exact, else normalized). Geometry comes from the WF-05 field
 * resolver over the cached document X-Ray; a citation ships ONLY when it can
 * point at a page (geometry miss ⇒ dropped — no pageless citation form).
 * Best-effort throughout: any failure returns null, never a failed turn.
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
  if (actual == null || (typeof actual !== "string" && typeof actual !== "number" && typeof actual !== "boolean")) {
    // Citing a branch node (object/array) is not a groundable claim.
    drop("branchNode");
    return null;
  }
  const cited = String(c.value);
  const matches =
    String(actual) === cited || normalizeText(String(actual)) === normalizeText(cited);
  // Minimum-length guard (adversarial review F2): a 1-character value ("2",
  // a count) token-matches almost ANY chunk in the fuzzy X-Ray fallback,
  // producing a confident-looking highlight on an unrelated region. Too
  // short to locate honestly ⇒ dropped (mirrors the snippet arm's
  // MIN_QUOTE_LEN gate, scaled to field values).
  if (!matches || normalizeText(cited).length < 2) {
    drop("value");
    return null;
  }

  // The structural check is exact → verified-level confidence; the chunk box
  // (below) keeps the tier at `paraphrase` (chunk precision).
  const v: QuoteVerification =
    String(actual) === cited
      ? { verified: true, method: "exact", score: 1 }
      : { verified: true, method: "normalized", score: 0 };

  if (!deps.groundxClient || !deps.groundxApiKey) {
    drop("geometry");
    return null;
  }
  try {
    const xray = await fetchDocumentXray(deps.groundxClient, deps.groundxApiKey, c.documentId);
    if (!xray) {
      drop("geometry");
      return null;
    }
    const label = c.field.split(".").pop()?.replace(/\[\d+\]/g, "") ?? "";
    const geo = resolveFieldGeometry(actual, label, xray);
    if (!geo) {
      drop("geometry");
      return null;
    }

    // Word-level upgrade (the spec's named evolution, wired 2026-06-11): the
    // validated `value` is verbatim by construction, so resolve it through the
    // document's `-118-map` exactly like the snippet-quote arm — an atom-run
    // hit replaces the chunk envelope with the tight word box and lights
    // `exact`. Best-effort: any miss/failure keeps the chunk geometry at
    // `paraphrase`; it never drops a citation that already resolved.
    let page = geo.page;
    let bbox = geo.bbox;
    let hasAtomBox = false;
    try {
      const wordMapFetch = deps.wordMapFetch ?? fetchDocumentWordMap;
      const map = await wordMapFetch(deps.groundxClient, deps.groundxApiKey, c.documentId);
      if (map) {
        const wordGeo = resolveWordGeometry(String(actual), map);
        if (wordGeo) {
          page = wordGeo.page;
          bbox = wordGeo.bbox;
          hasAtomBox = true;
        }
      }
    } catch (err) {
      logger.warn({ err }, "verifyExtractionCitation: word-map upgrade failed; keeping chunk geometry");
    }

    // No usable box (chunk page dims missing AND no word-map hit) is a miss
    // too — the spec defines exactly two outcomes for the extraction arm:
    // page+bbox, or dropped (adversarial review F3).
    if (!bbox) {
      drop("geometry");
      return null;
    }

    return {
      documentId: c.documentId,
      page,
      bbox,
      snippet: `${label}: ${String(actual)}`.slice(0, RAG_SNIPPET_CHARS),
      tier: assignTier(v, { hasAtomBox }),
      confidence: confidenceFor(v),
      ...(c.answerSpan ? { answerSpan: c.answerSpan } : {}),
    };
  } catch (err) {
    logger.warn({ err }, "verifyExtractionCitation: geometry resolution failed; dropping citation");
    drop("geometry");
    return null;
  }
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

  // WF-03 — candidate snippets for a citation, by documentId + page. Search
  // routinely returns SEVERAL chunks for the same page (the utility sample
  // returns 2-3 page-2 chunks), so a citation must verify against ALL of them
  // — checking only the first demoted verbatim quotes from a sibling chunk to
  // `ambient` (observed live 2026-06-12).
  const snippetsFor = (documentId: string, page: number): GroundXSearchResult[] =>
    snippets.filter((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page);

  const wordMapFetch = deps.wordMapFetch ?? fetchDocumentWordMap;

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
  ).filter((c): c is Citation => c !== null);

  const snippetCitations = await Promise.all(
    validatedCitations.map(async (c) => {
      // Verify against every same-page chunk and keep the best result
      // (exact > normalized > embedding > none, then score), pairing the
      // bbox with the chunk that actually verified.
      const candidates = snippetsFor(c.documentId, c.page);
      let v: QuoteVerification = { verified: false, method: "none", score: 0 };
      let bbox: NormalizedBbox | undefined = candidates[0]?.bbox;
      for (const candidate of candidates) {
        // The embedder is a LIVE blocking HTTP call (2s abort budget per
        // call) and an embedding pass can never out-rank a held lexical
        // match — so once ANY candidate verified, scan the rest with the
        // lexical gates only. (Trade-off: a later candidate's higher cosine
        // won't replace an earlier embedding-verified result; same tier
        // either way.)
        const cv = await verifyQuote(
          c.quote,
          candidate.text ?? "",
          v.verified ? undefined : deps.quoteEmbedder,
          deps.embedThreshold,
        );
        if (verificationRank(cv) > verificationRank(v)) {
          v = cv;
          // The verified chunk's bbox EVEN IF undefined — a sibling chunk's
          // box would highlight the wrong region; geometry-less is the spec
          // posture, and the word-map upgrade below can still resolve one.
          if (cv.verified) bbox = candidate.bbox;
        }
        if (cv.method === "exact") break; // can't do better
      }
      let hasAtomBox = false;
      // Word-level upgrade — verified citations only.
      if (v.verified && deps.groundxClient && deps.groundxApiKey) {
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
  // Task 4 — plan the turn BEFORE retrieval. Fixed plan (hybrid/report) >
  // injected planner (tests) > light-LLM planner (falls back
  // deterministically when no light client is configured).
  const plan: TurnPlan = options.turnPlan
    ?? (deps.planTurn
      ? await deps.planTurn(question)
      : deps.lightLlmClient && deps.lightLlmModelId
        ? await planTurn(question, { lightLlmClient: deps.lightLlmClient, lightLlmModelId: deps.lightLlmModelId })
        : FALLBACK_TURN_PLAN);

  const searchOptions: SearchGroundXOptions = {
    ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
    ...(options.debug ? { debug: options.debug } : {}),
  };
  // GroundX optional since the hybrid merge: no client -> empty snippets
  // (the grounded LLM still answers from workspace state / conversationally).
  let snippets: GroundXSearchResult[] = [];
  if (plan.documentSearch && deps.groundxClient && deps.groundxApiKey) {
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
              const result = await tool.serverExecute(parse.data, { skillsRetrieve });
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
