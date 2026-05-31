/**
 * RAG pipeline for the three-mode chat router: live GroundX search →
 * grounded prompt → LLM → validated tool calls + graduated-tier citations.
 *
 * Extracted from `chatRouter.ts` (§1 of 2026-05-31-core-data-followups —
 * behavior-preserving split). Owns `runRagPipeline`, `callGroundedLlm`,
 * `parseGroundedAnswer`, and `buildSnippetBlock`. `chatRouter.ts` re-exports
 * the public members so existing `from "./chatRouter.js"` imports keep
 * resolving.
 *
 * Live seams preserved verbatim from the monolith:
 *   - the SERVER-side role filter via `toolsForStep(activeStepKind, callerRole)`
 *     (2026-05-31-tool-system-completion);
 *   - the word-level `assignTier(v, { hasAtomBox })` upgrade calling
 *     `wordMapFetch` for already-verified citations (WF-05b / word-level);
 *   - the inline `ContentScope` derivation feeding `searchGroundX` + `_debug`.
 */

import {
  resolveWordGeometry,
  type NormalizedBbox,
} from "./citationGeometry.js";
import { assignTier, confidenceFor, verifyQuote } from "./attribution.js";
import { fetchDocumentWordMap } from "./wordMapCache.js";
import { getServerTool, toolsForStep, type ViewerStepKind } from "./toolCatalog.js";
import { toOpenAiTools, type OpenAiFunctionTool } from "./zodToJsonSchema.js";
import { searchGroundX } from "./groundxSearch.js";
import {
  MAX_SNIPPET_BLOCK_CHARS,
  RAG_SNIPPET_CHARS,
  type Citation,
  type ChatRouterDebug,
  type ChatRouterDeps,
  type ChatRouterRequest,
  type ChatRouterResponse,
  type DispatchedIntent,
  type GroundXSearchResult,
  type ParsedRagAnswer,
  type ProposedSchemaField,
  type RawToolCall,
  type StructuredCitation,
  type SuggestedAction,
  type ToolFailure,
} from "./chatRouterTypes.js";

import type { LlmClient } from "../types.js";
import { logger } from "../lib/logger.js";

import type { ContentScope } from "@groundx/shared";

export async function runRagPipeline(
  request: ChatRouterRequest,
  deps: ChatRouterDeps,
): Promise<ChatRouterResponse> {
  if (!deps.groundxClient || !deps.groundxApiKey) {
    throw new Error("rag mode: groundxClient + groundxApiKey are required outside MOCK_MODE");
  }
  if (!deps.llmModelId) {
    throw new Error("rag mode: llmModelId is required outside MOCK_MODE");
  }

  // Derive the ContentScope. Callers can override via `deps.contentScope`
  // once the chatHandler wires it from the entity bundle; for now we
  // fall back to the legacy single-bucket scope from env.
  const scope: ContentScope | null =
    deps.contentScope ??
    (deps.samplesBucketId != null ? { type: "bucket", bucketId: deps.samplesBucketId } : null);

  // Dev-only diagnostic accumulator — populated by searchGroundX +
  // callGroundedLlm, surfaced on the chat reply's `_debug` field so
  // the browser DevTools console can show exactly what we asked
  // GroundX + the LLM. NEVER populated in production.
  const debugCapture: { groundx?: ChatRouterDebug["groundx"]; llm?: ChatRouterDebug["llm"] } = {};
  const debugEnabled = process.env.NODE_ENV !== "production";

  const snippets = await searchGroundX(
    request.newUserMessage,
    scope,
    deps.groundxClient,
    deps.groundxApiKey,
    { rbacFilter: deps.rbacFilter, ...(debugEnabled ? { debug: debugCapture } : {}) },
  );

  // widget-llm-integration Phase 5 — assemble the tool catalog
  // (filtered to the active ViewerStep) + advertise it to the LLM via
  // native function calling. The empty-catalog case still sends a
  // `tools: []` so the test surface can assert request shape.
  // NOTE: `as ViewerStepKind` is an unvalidated wire cast (a tracked loose-typing
  // seam). Do NOT "fix" it by `safeParse → undefined` fallback: `toolsForStep(undefined)`
  // returns the FULL catalog, but a present-but-invalid kind goes through the
  // filter and returns the safe unrestricted-only set — so the naive validation
  // WIDENS the tool surface for bogus input. A proper fix needs `toolsForStep` to
  // express "unknown step → safe minimum" first. Tracked separately.
  // 2026-05-31-tool-system-completion — compose the step filter with the
  // SERVER-derived caller role. `request.callerRole` comes from chatHandler
  // (session.ownerUserId → member/anonymous); it is NEVER client-trusted. A
  // member-only tool (`availableIn: ["member"]`) is absent from the catalog an
  // anonymous caller's LLM sees. When `callerRole` is omitted the role filter
  // is a no-op (legacy/non-RAG callers) — the production path always supplies it.
  const catalog = toolsForStep(
    request.activeStepKind as ViewerStepKind | undefined,
    request.callerRole,
  );
  const openAiTools: OpenAiFunctionTool[] = toOpenAiTools(catalog);

  const llmResponse = await callGroundedLlm(
    request.newUserMessage,
    snippets,
    deps.llmClient,
    deps.llmModelId,
    request.scopeHint,
    debugEnabled ? debugCapture : undefined,
    openAiTools,
  );

  // widget-llm-integration Phase 5 — validate each emitted tool_call
  // against the server catalog. Successful calls land on
  // `intents[]`; failures (unknown name / bad args) land on
  // `toolFailures[]`. Per design.md §M, v1 surfaces failures
  // without auto-retry.
  // widget-llm-integration Phase 8 — category-aware routing.
  // Read-category tools auto-dispatch via `intents[]`. Mutate-category
  // tools surface as confirmable chips on `suggestedActions[]` (per
  // design.md §C — state-mutating actions are user-confirmed by
  // default). The mutate buffer below is flushed into the
  // `suggestedActions` array after the "show-source" + legacy
  // `suggested-intent` chips are seeded.
  const intents: DispatchedIntent[] = [];
  const toolFailures: ToolFailure[] = [];
  const mutateChips: SuggestedAction[] = [];
  for (const call of llmResponse.toolCalls) {
    const tool = getServerTool(call.name);
    if (!tool) {
      toolFailures.push({ name: call.name, reason: `unknown tool name "${call.name}"` });
      continue;
    }
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(call.argumentsJson);
    } catch {
      toolFailures.push({ name: call.name, reason: "arguments_not_valid_json" });
      continue;
    }
    const parseResult = tool.inputSchema.safeParse(parsedArgs);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      toolFailures.push({ name: call.name, reason: `invalid arguments — ${issues}` });
      continue;
    }
    const intentPayload = tool.intentBuilder(parseResult.data);
    if (tool.category === "mutate") {
      // Surface as a chip the user must click to confirm. The label
      // is the first sentence of the tool description (terminated at
      // the first ".", "?", or "!") so the chat row stays compact.
      const firstSentenceMatch = tool.description.match(/^[^.?!]+[.?!]?/);
      const label = (firstSentenceMatch?.[0] ?? tool.description).trim();
      mutateChips.push({
        key: `tool:${call.name}`,
        label,
        detail: {
          name: call.name,
          arguments: parseResult.data as Record<string, unknown>,
          intent: intentPayload,
        },
      });
    } else {
      intents.push({
        name: call.name,
        arguments: parseResult.data as Record<string, unknown>,
        intent: intentPayload,
      });
    }
  }

  // Parse the LLM's optional JSON block. Post-A.5 (follow-up
  // 2026-05-28) this only extracts `citations` — `suggestedIntent`
  // + `proposedSchemaField` ship via `tool:*` chips now.
  const parsed = parseGroundedAnswer(llmResponse.answer);
  const suggestedActions: ChatRouterResponse["suggestedActions"] = [
    { key: "show-source", label: "Show source" },
  ];
  // widget-llm-integration follow-up A.5 — the legacy
  // `suggested-intent` chip emit is gone. `tool:suggest_intent`
  // chips arrive via the mutateChips buffer below.
  // Phase 8 — append every mutate-tool chip AFTER the legacy chips so
  // the existing "show-source" / "suggested-intent" rendering order is
  // preserved. Frontend `SuggestedActionChips` renders in array order.
  for (const chip of mutateChips) suggestedActions.push(chip);

  // widget-llm-integration follow-up A.4 (2026-05-28) — back-compat
  // shim: when the LLM emits a `propose_schema_field` tool call,
  // mirror the validated payload onto `reply.proposedSchemaField`
  // so consumers that still read the legacy field (ChatColumn,
  // ExtractView) keep working through the one-release shim window.
  // A.5 deletes this once consumers migrate.
  let proposedSchemaFieldShim: ProposedSchemaField | null = null;
  const proposeChip = mutateChips.find((c) => c.key === "tool:propose_schema_field");
  if (proposeChip) {
    const args = proposeChip.detail?.arguments as
      | { categoryId: string; name: string; type: ProposedSchemaField["type"]; description: string }
      | undefined;
    if (args) {
      proposedSchemaFieldShim = {
        categoryId: args.categoryId,
        name: args.name,
        type: args.type,
        description: args.description,
        provenance: { version: "v1", verified: true },
      };
    }
  }

  // CF-06 structured citations. When the LLM emitted a citations
  // block AND at least one entry references a documentId that's in
  // our snippet set, use the validated subset as `reply.citations`.
  // Otherwise fall back to the legacy "all snippets become cites"
  // behavior. Cross-checking against the snippet set is the trust
  // boundary — we don't let the LLM invent references.
  const allowedDocIds = new Set(snippets.map((s) => s.documentId));
  const validatedCitations =
    parsed.structuredCitations?.filter((c) => allowedDocIds.has(c.documentId)) ?? [];
  // WF-03 — attach the normalized source-region bbox. For LLM-emitted
  // (validated) citations, look up the matching snippet's geometry by
  // documentId + page; for the ambient fallback, the snippet IS the source.
  const bboxFor = (documentId: string, page: number): NormalizedBbox | undefined =>
    snippets.find((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page)?.bbox;
  const snippetTextFor = (documentId: string, page: number): string =>
    snippets.find((s) => s.documentId === documentId && (s.pageNumber ?? 1) === page)?.text ?? "";
  // WF-06 — graduated attribution. For each LLM-emitted (validated) citation,
  // verify the verbatim `quote` against the chunk it cited and assign a tier
  // + confidence + the supported answer span. The `exact` (word-level) tier
  // is now LIVE: for an ALREADY-VERIFIED citation we fetch the document's
  // `-118-map.json` word-map (cached, best-effort) and run the shipped
  // `resolveWordGeometry(quote, map)` resolver. On a hit, the tighter
  // word-level bbox replaces the X-Ray chunk box and `hasAtomBox: true` lights
  // the `exact` tier. The fetch fires ONLY for verified citations (an
  // unverified quote can never reach `exact`, so it pays no word-map cost).
  // Fallback chain: word-level box → X-Ray chunk box (WF-03) → none — a
  // missing/unfetchable map or a non-verbatim span leaves the citation at
  // `paraphrase`/geometry-less, and the turn never fails. The all-snippets
  // fallback has no claim-level proof → `ambient` (source chip; bbox kept for
  // click-to-view).
  const wordMapFetch = deps.wordMapFetch ?? fetchDocumentWordMap;
  const citations: Citation[] =
    validatedCitations.length > 0
      ? await Promise.all(
          validatedCitations.map(async (c) => {
            const v = verifyQuote(c.quote, snippetTextFor(c.documentId, c.page));
            // Default: the X-Ray chunk box (WF-03) for this doc+page.
            let bbox = bboxFor(c.documentId, c.page);
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
        )
      : snippets.map((s) => ({
          documentId: s.documentId,
          page: s.pageNumber ?? 1,
          snippet: s.text ? s.text.slice(0, RAG_SNIPPET_CHARS) : undefined,
          bbox: s.bbox,
          tier: "ambient" as const,
          confidence: 0,
        }));

  return {
    mode: "rag",
    answer: parsed.cleanedAnswer,
    citations,
    suggestedActions,
    tools: [],
    intents,
    toolFailures,
    // widget-llm-integration follow-up A.4 — prefer the back-compat
    // shim from the tool call; fall back to the fenced-JSON parse
    // until A.5 deletes the legacy branch. After A.5, the parsed
    // branch returns null and only the shim path is live.
    proposedSchemaField: proposedSchemaFieldShim ?? parsed.proposedSchemaField,
    ...(debugEnabled
      ? {
          _debug: {
            mode: "rag" as const,
            scope: (scope === null
              ? { type: "documents" }
              : {
                  type: scope.type,
                  ...("bucketId" in scope ? { bucketId: scope.bucketId } : {}),
                  ...("groupId" in scope ? { groupId: scope.groupId } : {}),
                  ...("documentIds" in scope ? { documentIds: scope.documentIds } : {}),
                  ...(scope.filter ? { filter: scope.filter } : {}),
                }) as ChatRouterDebug["scope"],
            groundx: debugCapture.groundx ?? null,
            llm: debugCapture.llm ?? null,
          },
        }
      : {}),
  };
}

/**
 * Extract the optional ```json fenced block the grounded LLM may
 * append. Single block; may contain either or both of:
 *
 *   - `suggestedIntent` (CF-07): { intent, confidence, reason }
 *   - `citations`      (CF-06): array of { documentId, page, quote }
 *
 * Robustness:
 *   - No fenced block            → cleanedAnswer = trimmed input, both fields null.
 *   - Block present + malformed  → cleanedAnswer = trimmed input, both fields null
 *                                  (we DON'T strip a broken block since the cleanup
 *                                  heuristic is fragile on partial JSON).
 *   - Block parses but field shape wrong → that field stays null (the other
 *                                  one is still considered independently).
 *   - Citation entries with wrong types are silently filtered; if NO valid
 *     entries remain, `structuredCitations` is null (not `[]`) so callers
 *     can fall back to the GroundX-derived list.
 */
export function parseGroundedAnswer(rawAnswer: string): ParsedRagAnswer {
  // widget-llm-integration follow-up A.5 (2026-05-28) — the
  // fenced-JSON parser used to handle three concerns: `citations`,
  // `suggestedIntent`, and `proposedSchemaField`. The latter two
  // have migrated to native LLM function-calling (see toolCatalog's
  // `suggest_intent` and `propose_schema_field` tools). This
  // parser retains ONLY the `citations` branch — citations are
  // metadata on the answer, not a tool surface. The
  // `suggestedIntent` and `proposedSchemaField` fields on the
  // return type are preserved (always `null`) for one release as a
  // type-shape shim; deprecated, slated for removal.
  const fenceMatch = rawAnswer.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!fenceMatch) {
    return {
      cleanedAnswer: rawAnswer.trim(),
      suggestedIntent: null,
      structuredCitations: null,
      proposedSchemaField: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenceMatch[1]);
  } catch {
    // Malformed JSON — leave the body alone (don't strip the block,
    // since the cleanup heuristic would be fragile on partial JSON).
    return {
      cleanedAnswer: rawAnswer.trim(),
      suggestedIntent: null,
      structuredCitations: null,
      proposedSchemaField: null,
    };
  }

  // citations — filter to well-formed entries (CF-06).
  const citationsRaw = (parsed as { citations?: unknown })?.citations;
  let structuredCitations: StructuredCitation[] | null = null;
  if (Array.isArray(citationsRaw)) {
    const valid = citationsRaw.filter(
      (c): c is StructuredCitation =>
        c != null &&
        typeof c === "object" &&
        typeof (c as StructuredCitation).documentId === "string" &&
        typeof (c as StructuredCitation).page === "number" &&
        typeof (c as StructuredCitation).quote === "string",
    );
    if (valid.length > 0) structuredCitations = valid;
  }

  // Strip the fenced block from the user-facing answer. Collapse any
  // surrounding blank lines so the cleaned answer reads naturally.
  const cleaned = rawAnswer
    .replace(fenceMatch[0], "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    cleanedAnswer: cleaned,
    // Deprecated — always null after A.5; one-release shim.
    suggestedIntent: null,
    structuredCitations,
    // Deprecated — always null after A.5; populated via the
    // tool-call back-compat shim in routeChat. One-release shim.
    proposedSchemaField: null,
  };
}

/**
 * Grounded completion prompt. Three-mode behavior baked in:
 *
 *   1. Greeting / meta — respond conversationally, name the file(s),
 *      suggest a couple of starter questions. NOT a refusal.
 *   2. In-coverage content question — concise answer using only the
 *      snippets; cite via the fenced JSON block.
 *   3. Out-of-coverage content question — honest acknowledgement +
 *      pointer to what the doc DOES cover. No fabrication, no
 *      general-knowledge fill-in.
 *
 * Structured outputs (still required):
 *   - `citations` array inside the same fenced JSON block as
 *     `suggestedIntent`. `runRagPipeline` validates each entry's
 *     `documentId` against the snippet set before using it.
 *   - Token-budget guard: `buildSnippetBlock` truncates to
 *     `MAX_SNIPPET_BLOCK_CHARS` (most-relevant first, trailing dropped).
 *
 * `GROUNDED_REFUSAL_PHRASE` is no longer prescribed by the prompt —
 * the model phrases its own refusal — but the constant + the
 * pass-through test stay as a regression guard against
 * legacy-phrase mutation.
 */
async function callGroundedLlm(
  userMessage: string,
  snippets: GroundXSearchResult[],
  llmClient: LlmClient,
  modelId: string,
  scopeHint?: { fileName?: string | null; scenarioTitle?: string | null },
  debug?: { llm?: ChatRouterDebug["llm"] },
  tools?: OpenAiFunctionTool[],
): Promise<{ answer: string; toolCalls: RawToolCall[] }> {
  const system =
    "You are the user's analyst for the documents in the snippets " +
    "below. You read them on the user's behalf and answer in plain " +
    "English — warm, direct, brief.\n\n" +

    "For content claims, use only what's in the snippets. Don't invent " +
    "facts and don't fill in from general knowledge. If the snippets " +
    "cover the answer, lead with it and quote a short verbatim phrase " +
    "when it helps. If they don't, say so in one sentence and point to " +
    "something the documents do cover.\n\n" +

    // Snippet-rereading nudge (2026-05-28). Observed failure mode: a
    // snippet contains a JSON object whose key directly answers the
    // question (e.g. `"due_date": "2025-07-30"`), and the model still
    // replies "no snippets." Tell it to read the JSON.
    "Snippets may be JSON-shaped (key/value blocks extracted from the " +
    "document). If a JSON field or JSON key in a snippet directly " +
    "answers the question, quote its value verbatim — that IS the " +
    "answer. Do not claim 'no snippets' or 'I can't determine' when " +
    "the JSON field is right there.\n\n" +

    "Greetings, small talk, and meta questions about your capabilities " +
    "aren't content questions — respond conversationally and offer a " +
    "starter question or two grounded in the snippets.\n\n" +

    // widget-llm-integration follow-up A.3 (2026-05-28) — the
    // grounded prompt no longer asks for `proposedSchemaField` or
    // `suggestedIntent` JSON. Both surfaces ship via native LLM
    // function-calling tools now; the chat router validates +
    // routes them to `reply.intents[]` (read) or
    // `reply.suggestedActions[]` (mutate, user-confirmed chip).
    //
    // The fenced ```json block is still permitted for `citations`
    // (citations are metadata on the answer, not a tool surface).
    "After your answer you MAY append a single ```json fenced block " +
    "with `citations` only. Skip the block for non-content turns. Add one " +
    "entry per content claim: `quote` MUST be copied VERBATIM from that " +
    "snippet (it is the proof the claim is grounded), and `answerSpan` is " +
    "the exact phrase from YOUR answer that the quote supports.\n\n" +
    "```json\n" +
    '{"citations":[{"documentId":"<id-from-the-snippet-header>","page":<int>,"quote":"<verbatim phrase copied from the snippet>","answerSpan":"<the claim in your answer it supports>"}]}\n' +
    "```\n\n" +
    "`citations` MUST reference only documentIds present in the snippet " +
    "headers — the client drops the rest. Copy `quote` exactly; do NOT " +
    "paraphrase it (a quote that doesn't match the source is dropped to a " +
    "lower-confidence, region-only citation).\n\n" +

    "**Schema-field proposals and intent suggestions ship via tools, " +
    "not JSON.**\n\n" +
    "When the user explicitly asks to add a schema field (\"add a " +
    "field for X\", \"track Y too\", \"capture Z\"), call the " +
    "`propose_schema_field` tool with `{categoryId, name, type, " +
    "description}`. Pick the best-fit existing category id from the " +
    "user's surrounding context if one is visible; otherwise use a " +
    "plausible snake_case id. Type must be one of STRING, NUMBER, " +
    "DATE, BOOLEAN. The frontend renders an Accept/Reject card; " +
    "write the conversational answer naturally (\"I can add a 'total " +
    "tax' field…\") and let the tool call carry the structured payload.\n\n" +

    "When you've reasoned that the user might want to navigate to " +
    "another canvas surface (\"open the extract to compare line " +
    "items\", \"check the report for the rollup\"), call the " +
    "`suggest_intent` tool with `{intent, reason, confidence}`. " +
    "Use `show-extract` / `show-report` / `show-interact` for the " +
    "intent label. Fire only at confidence > 0.8.";

  const contextBlock = buildSnippetBlock(snippets);
  // Scope line — independent of snippet hits. Names the doc the user
  // is currently looking at so the model knows what to talk about
  // even when GroundX search returned 0 results. Goes ABOVE the
  // snippet block so the model reads it first.
  const scopeParts: string[] = [];
  if (scopeHint?.fileName) scopeParts.push(`file=${scopeHint.fileName}`);
  if (scopeHint?.scenarioTitle) scopeParts.push(`scenario=${scopeHint.scenarioTitle}`);
  const scopeLine = scopeParts.length > 0 ? `Working on: ${scopeParts.join(", ")}\n\n` : "";
  const userContent = `${scopeLine}Snippets:\n${contextBlock}\n\nQuestion: ${userMessage}`;

  // Dev-side full request log. The `messages` field is on pino's
  // redact list (prod sees [REDACTED]); dev sees the full prompt so
  // the user can see what the model actually gets.
  logger.info(
    {
      groundedLlmCall: {
        model: modelId,
        snippetCount: snippets.length,
        snippetBlockChars: contextBlock.length,
        userMessage,
        systemChars: system.length,
        userContentChars: userContent.length,
        // The full bodies — gated to dev by log-level + pino redaction.
        systemContent: system,
        userContent,
      },
    },
    "grounded LLM dispatch",
  );

  const requestBody: Record<string, unknown> = {
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  };
  // Phase 5 — when a (filtered) tool catalog is supplied, advertise
  // it on the LLM request via OpenAI's function-calling envelope.
  // We always include the `tools` key when the caller passed one
  // (even if empty) so the test for "step with zero tools" can
  // assert the request shape exactly.
  if (tools !== undefined) {
    requestBody.tools = tools;
    if (tools.length > 0) {
      requestBody.tool_choice = "auto";
    }
  }
  const response = await llmClient.forward("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`grounded llm call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  const message = payload.choices?.[0]?.message;
  // Either a textual answer OR tool_calls is acceptable — providers
  // return an empty content string when the model emitted a tool
  // call instead of prose. Treat that as a "no answer" fallback
  // (empty string) rather than throwing.
  const rawAnswer = message?.content?.trim() ?? "";
  const toolCalls: RawToolCall[] = (message?.tool_calls ?? [])
    .filter((tc) => tc.type === "function" && tc.function?.name)
    .map((tc, idx) => ({
      id: tc.id ?? `call_${idx}`,
      name: tc.function!.name!,
      argumentsJson: tc.function!.arguments ?? "{}",
    }));
  // If there's no prose AND no tool calls, we got a useless reply —
  // surface as a hard error so the user sees something specific.
  if (!rawAnswer && toolCalls.length === 0) {
    throw new Error("grounded llm call returned no content");
  }
  const answer = rawAnswer;
  // Capture dev-side debug snapshot (browser surfaces this via _debug
  // on the chat reply). Only populated when the caller passed `debug`.
  if (debug) {
    debug.llm = {
      model: modelId,
      snippetBlockChars: contextBlock.length,
      userContentChars: userContent.length,
      systemChars: system.length,
      answerChars: answer.length,
    };
  }
  // Log the actual LLM response so the user can compare what was
  // sent (logged above) with what came back. Counterpart to the
  // "grounded LLM dispatch" log line.
  logger.info(
    {
      groundedLlmResponse: {
        model: modelId,
        answerChars: answer.length,
        answer,
      },
    },
    "grounded LLM response",
  );
  return { answer, toolCalls };
}

/**
 * CF-06 token-budget guard. Assemble snippets into the context block
 * the LLM sees, truncating from the end once the budget is hit so the
 * highest-ranked snippets are preserved. The per-snippet cap
 * (`RAG_SNIPPET_CHARS`) is applied first; this function then drops
 * whole snippets if the budget would still be blown.
 */
export function buildSnippetBlock(snippets: GroundXSearchResult[]): string {
  if (snippets.length === 0) return "(no snippets found)";
  const entries: string[] = [];
  let used = 0;
  for (const [i, s] of snippets.entries()) {
    const text = (s.text ?? "").slice(0, RAG_SNIPPET_CHARS);
    const header = s.fileName
      ? `[${i + 1}] file="${s.fileName}" doc=${s.documentId} page=${s.pageNumber ?? "?"}`
      : `[${i + 1}] doc=${s.documentId} page=${s.pageNumber ?? "?"}`;
    const entry = `${header}\n${text}`;
    // +2 for the "\n\n" join we'll add between entries.
    const projected = used + entry.length + (entries.length > 0 ? 2 : 0);
    if (projected > MAX_SNIPPET_BLOCK_CHARS) break;
    entries.push(entry);
    used = projected;
  }
  // Edge case: even the FIRST snippet exceeds the budget. Truncate it
  // hard rather than send an empty block — a partial top result is
  // more useful than nothing.
  if (entries.length === 0) {
    const s = snippets[0];
    const truncated = (s.text ?? "").slice(0, MAX_SNIPPET_BLOCK_CHARS - 80);
    return `[1] doc=${s.documentId} page=${s.pageNumber ?? "?"}\n${truncated}`;
  }
  return entries.join("\n\n");
}
