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
  getServerTool,
  toolsForStep,
  UNKNOWN_VIEWER_STEP,
  type UnknownViewerStep,
  type ViewerStepKind,
} from "./toolCatalog.js";
import { toOpenAiTools, type OpenAiFunctionTool } from "./zodToJsonSchema.js";
import { consumeChatCompletionStream } from "./chatCompletionStream.js";
import { turnStreamContext, type TurnStreamSink } from "./streamSink.js";
import { buildGroundedSystem } from "./prompts/grounded.js";
import { buildToolNotes } from "./prompts/toolNotes.js";
import { snippetHeader, forceAnswerAfterToolsInstruction } from "./prompts/fragments.js";
import { isMetadataBlockObject } from "./streamMetadataRedactor.js";
import { groundedAnswerOverScope } from "./groundedAnswer.js";
import { buildWorkspaceStateContext } from "./workspaceContext.js";
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
  type ToolActivity,
  type ToolFailure,
} from "./chatRouterTypes.js";

import type { LlmClient } from "../types.js";
import { logger } from "../lib/logger.js";

import { viewerStepKindSchema, type ContentScope } from "@groundx/shared";

export async function runRagPipeline(
  request: ChatRouterRequest,
  deps: ChatRouterDeps,
  // turn-router-extraction-appstate: `routeChat` threads its already-computed
  // seam plan here so the planner runs AT MOST ONCE per turn. Absent (e.g. an
  // intent-hinted turn), the grounded seam plans for itself as before.
  options?: { turnPlan?: import("./turnRouter.js").TurnPlan },
): Promise<ChatRouterResponse> {
  if (!deps.groundxClient || !deps.groundxApiKey) {
    throw new Error("rag mode: groundxClient + groundxApiKey are required");
  }
  if (!deps.llmModelId) {
    throw new Error("rag mode: llmModelId is required");
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
  const debugCapture: {
    groundx?: ChatRouterDebug["groundx"];
    llm?: ChatRouterDebug["llm"];
    citations?: ChatRouterDebug["citations"];
  } = {};
  const debugEnabled = process.env.NODE_ENV !== "production";

  // widget-llm-integration Phase 5 — assemble the tool catalog
  // (filtered to the active ViewerStep) + advertise it to the LLM via
  // native function calling. The empty-catalog case still sends a
  // `tools: []` so the test surface can assert request shape.
  // SECURITY (2026-06-01-data-model-tail item 2): `request.activeStepKind` is an
  // untrusted wire string. We validate it with `viewerStepKindSchema` and route
  // each of the three cases EXPLICITLY (no bare `as ViewerStepKind` cast):
  //   - absent (null/undefined) → `undefined` → FULL catalog (legacy caller);
  //   - a valid `ViewerStepKind` → that step's filtered set;
  //   - present-but-INVALID    → `UNKNOWN_VIEWER_STEP` → SAFE MINIMUM.
  // Mapping an invalid kind to `undefined` would WIDEN the surface to the full
  // catalog, so the `UNKNOWN_VIEWER_STEP` sentinel (toolCatalog item 2a) is what
  // keeps a bogus value from exposing more tools than a legitimate step.
  // 2026-05-31-tool-system-completion — compose the step filter with the
  // SERVER-derived caller role. `request.callerRole` comes from chatHandler
  // (session.ownerUserId → member/anonymous); it is NEVER client-trusted. A
  // member-only tool (`availableIn: ["member"]`) is absent from the catalog an
  // anonymous caller's LLM sees. When `callerRole` is omitted the role filter
  // is a no-op (legacy/non-RAG callers) — the production path always supplies it.
  const rawStepKind = request.activeStepKind;
  let stepKind: ViewerStepKind | UnknownViewerStep | undefined;
  if (rawStepKind === null || rawStepKind === undefined) {
    stepKind = undefined; // legacy caller / no step context → full catalog
  } else {
    const parsed = viewerStepKindSchema.safeParse(rawStepKind);
    stepKind = parsed.success ? parsed.data : UNKNOWN_VIEWER_STEP;
  }
  const catalog = toolsForStep(stepKind, request.callerRole);
  const openAiTools: OpenAiFunctionTool[] = toOpenAiTools(catalog);
  // Task 6 — per-tool guidance is generated from the FILTERED catalog (a
  // tool absent from this step contributes no notes), declared on the tool.
  const toolNotes = buildToolNotes(catalog);

  // chat-unified-tool-loop D2 — inject the small workspace-state block ("where
  // you are": active entity, journey stage, saved-schema count, recent trail) on
  // EVERY chat turn, so the one loop can answer "where am I / what can I do"
  // without a separate mode. Chat-path only (report/hybrid pass their own /
  // nothing); omitted (null) when session deps are absent (anon/no session).
  const workspaceContext = await buildWorkspaceStateContext({
    ...(deps.repository ? { repository: deps.repository } : {}),
    ...(deps.chatSessionId ? { chatSessionId: deps.chatSessionId } : {}),
    groundxUsername: deps.groundxUsername ?? null,
    activeStepKind: request.activeStepKind,
  });

  // 2026-06-01-live-report-render §3 — the search → grounded-generation →
  // WF-06b-verify per-answer pipeline is now the SHARED `groundedAnswerOverScope`
  // seam (one home, two callers: this chat path + the Smart Report live render).
  // It returns the verified-cited prose body PLUS the live by-products this chat
  // path still needs: the `snippets` (debug + fallback set) and the LLM's native
  // `toolCalls` (routed to intents / confirmable chips below). Behavior is
  // preserved — the helper composes the same searchGroundX + callGroundedLlm +
  // parseGroundedAnswer + verify loop that lived inline here.
  const grounded = await groundedAnswerOverScope(
    request.newUserMessage,
    scope,
    {
      groundxClient: deps.groundxClient,
      groundxApiKey: deps.groundxApiKey,
      llmClient: deps.llmClient,
      llmModelId: deps.llmModelId,
      ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
      ...(deps.wordMapFetch ? { wordMapFetch: deps.wordMapFetch } : {}),
      ...(deps.skillsRetrieve ? { skillsRetrieve: deps.skillsRetrieve } : {}),
      ...(deps.quoteEmbedder ? { quoteEmbedder: deps.quoteEmbedder } : {}),
      ...(deps.embedThreshold !== undefined ? { embedThreshold: deps.embedThreshold } : {}),
      // chat-unified-tool-loop D3 — account reader deps for the account tools'
      // serverExecute (list_projects / list_api_keys / pages_remaining / saved_schemas).
      ...(deps.repository ? { repository: deps.repository } : {}),
      ...(deps.partnerClient ? { partnerClient: deps.partnerClient } : {}),
      groundxUsername: deps.groundxUsername ?? null,
      ...(deps.byoPagesLimit !== undefined ? { byoPagesLimit: deps.byoPagesLimit } : {}),
    },
    {
      ...(options?.turnPlan ? { turnPlan: options.turnPlan } : {}),
      ...(request.scopeHint ? { scopeHint: request.scopeHint } : {}),
      ...(workspaceContext ? { structuredContext: workspaceContext } : {}),
      tools: openAiTools,
      ...(toolNotes ? { toolNotes } : {}),
      ...(debugEnabled ? { debug: debugCapture } : {}),
      // agentic-tool-loop — the chat path opts into the bounded server-tool
      // loop (≤4 server rounds). Report + hybrid never set this.
      toolLoop: { maxRounds: 4 },
    },
  );
  const snippets = grounded.snippets;
  const llmResponse = { toolCalls: grounded.toolCalls };

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
  // standardized-viewer-control T7 — navigation tools that carry the optional
  // `offerAs` disposition are NOT auto-dispatched: they surface as OFFERED
  // suggested-action entries (a clickable chip / inline anchor) the USER
  // triggers. Buffered separately so they slot in after the mutate chips.
  const offeredChips: SuggestedAction[] = [];
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
    if (typeof tool.intentBuilder !== "function") {
      // Server-executed tools are handled inside the tool-result loop and never
      // become client-dispatched CanvasIntents.
      continue;
    }
    const intentPayload = tool.intentBuilder(parseResult.data);
    // standardized-viewer-control T7 — offer disposition. A navigation tool
    // call carrying `offerAs` is surfaced as an OFFERED suggested action
    // (validated intent via the tool's intentBuilder + the offer's label +
    // optional inline anchor) instead of auto-dispatching. `offerAs` is a
    // PRESENTATION arg — the intentBuilder already ignores it, so the built
    // intent never carries it. Only navigation tools declare `offerAs` in their
    // schema, so presence here means the call is offer-eligible by construction.
    const offerAs = (parseResult.data as { offerAs?: { label: string; anchor?: string } }).offerAs;
    if (offerAs) {
      offeredChips.push({
        key: `tool:${call.name}`,
        label: offerAs.label,
        ...(offerAs.anchor !== undefined ? { anchor: offerAs.anchor } : {}),
        detail: {
          name: call.name,
          arguments: parseResult.data as Record<string, unknown>,
          intent: intentPayload,
        },
      });
      continue;
    }
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
  // agentic-tool-loop — server-executed tool calls never reach the routing
  // loop above (they're consumed inside the grounded loop). Their
  // validation/executor failures are merged here so they surface on
  // `toolFailures[]` alongside routed-call failures.
  for (const failure of grounded.serverToolFailures) toolFailures.push(failure);

  // "Show all sources" is only offered when there ARE sources — a reply with
  // zero citations (small talk, jokes, zero search hits) gets no dead chip
  // (2026-06-11).
  const suggestedActions: ChatRouterResponse["suggestedActions"] =
    grounded.citations.length > 0 ? [{ key: "show-source", label: "Show all sources" }] : [];
  // widget-llm-integration follow-up A.5 — the legacy `suggested-intent` chip
  // emit is gone. Phase 8 — append every mutate-tool chip AFTER the
  // "show-source" chip so the existing rendering order is preserved. Frontend
  // `SuggestedActionChips` renders in array order.
  for (const chip of mutateChips) suggestedActions.push(chip);
  // standardized-viewer-control T7 — offered navigation entries last (a
  // user-triggered "→ go there" chip / inline anchor; the per-destination
  // `offerAs` disposition succeeds the retired generic any-destination
  // navigation suggestion).
  for (const chip of offeredChips) suggestedActions.push(chip);

  const answer = grounded.body.trim();

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

  // CF-06 / WF-06b citations are produced inside `groundedAnswerOverScope`
  // (§3): the LLM-emitted structured citations are cross-checked against the
  // snippet set (trust boundary — no invented refs), each verified verbatim
  // quote is assigned a graduated tier + confidence (with the WF-05b word-level
  // `exact` upgrade), and the no-citation case falls back to ambient snippet
  // cites. `grounded.body` is the JSON-block-stripped prose.
  const citations: Citation[] = grounded.citations;

  return {
    mode: "rag",
    answer,
    citations,
    suggestedActions,
    intents,
    toolFailures,
    // agentic-tool-loop — what the agent consulted server-side this turn (the
    // muted "Checked GroundX docs" annotation). Always set on the rag reply
    // (empty when the loop didn't run); structured/hybrid omit the field.
    toolActivity: grounded.toolActivity,
    // widget-llm-integration follow-up A.4 — the back-compat shim from the
    // tool call. Post-A.5 the fenced-JSON `proposedSchemaField` parse is always
    // null, so the shim (or null) is the only source.
    proposedSchemaField: proposedSchemaFieldShim,
    ...(debugEnabled
      ? {
          _debug: {
            mode: "rag" as const,
            // 2026-05-31-chat-wire-types-shared — `_debug.scope` is now the
            // shared `ContentScope`. `scope` is already `ContentScope | null`,
            // so pass it through directly; the null case (no resolved scope)
            // surfaces as an empty `documents` scope — a valid `ContentScope`
            // that reads as "no documents in scope" in the dev debug panel.
            scope: (scope ?? { type: "documents", documentIds: [] }) satisfies ChatRouterDebug["scope"],
            groundx: debugCapture.groundx ?? null,
            llm: debugCapture.llm ?? null,
            // harden-citation-emission U4 — the per-turn citation funnel
            // (set by groundedAnswerOverScope on the same accumulator).
            citations: debugCapture.citations ?? null,
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
  // have migrated to native LLM function-calling (`propose_schema_field`; the
  // navigation tools + their `offerAs` disposition replaced the retired
  // generic any-destination navigation tool — standardized-viewer-control T7).
  // This parser retains ONLY the `citations` branch — citations are
  // metadata on the answer, not a tool surface. The
  // `suggestedIntent` and `proposedSchemaField` fields on the
  // return type are preserved (always `null`) for one release as a
  // type-shape shim; deprecated, slated for removal.
  // The model is instructed to emit ONE fenced block, but it sometimes emits
  // a second one (observed risk after the extraction-form contract joined the
  // prompt: one block per citation form). Parse EVERY fenced block that
  // yields a well-formed `citations` array, merge the entries in emission
  // order (deduped), and strip each consumed block from the user-visible
  // body. A block that is malformed JSON (or carries no metadata key) is left
  // in place — stripping partial JSON is fragile, and non-metadata JSON is
  // CONTENT (e.g. an example the user asked for).
  //
  // harden-citation-emission U2 — tolerant fence pattern: optional tag in any
  // case, one-line fences (no newline required around the payload), CRLF; a
  // trailing un-fenced `{"citations": …}` object is a last-resort fallback.
  // Parse-level losses are counted for the U4 funnel.
  const parseLosses = { malformedJson: 0, invalidEntries: 0 };
  const fenceMatches = [...rawAnswer.matchAll(/```(json)?[^\S\r\n]*\r?\n?([\s\S]*?)```/gi)];

  // Entry validation, per arm (CF-06 + 2026-06-11-extraction-grounded-
  // citations). Snippet form = page+quote; extraction form = field+value. An
  // entry carrying BOTH complete sets (or neither) is malformed and dropped.
  // A numeric-string `page` ("2") is coerced before validation (U2).
  const isValidEntry = (c: unknown): c is StructuredCitation => {
    if (c == null || typeof c !== "object") return false;
    const entry = c as Record<string, unknown>;
    if (typeof entry.documentId !== "string") return false;
    if (typeof entry.page === "string" && /^\d+$/.test(entry.page)) entry.page = Number(entry.page);
    const snippetShaped = typeof entry.page === "number" && typeof entry.quote === "string";
    const valueOk =
      typeof entry.value === "string" ||
      typeof entry.value === "number" ||
      typeof entry.value === "boolean";
    const extractionShaped = typeof entry.field === "string" && valueOk;
    return snippetShaped !== extractionShaped; // exactly one arm
  };

  const collected: StructuredCitation[] = [];
  let cleaned = rawAnswer;
  let consumedMetadataBlock = false;
  const collectFromBlock = (block: Record<string, unknown>): void => {
    const citationsRaw = block.citations;
    if (!Array.isArray(citationsRaw)) return;
    const valid = citationsRaw.filter(isValidEntry);
    parseLosses.invalidEntries += citationsRaw.length - valid.length;
    collected.push(...valid);
  };
  for (const match of fenceMatches) {
    const tagged = (match[1] ?? "").toLowerCase() === "json";
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[2].trim());
    } catch {
      // Only a ```json-TAGGED fence that fails to parse is a LOSS — untagged
      // fences are normally content (code samples) and stay silent.
      if (tagged) parseLosses.malformedJson += 1;
      continue; // malformed block — leave it in the body
    }
    // Strip a block ONLY when it is metadata-intent — a plain object
    // carrying a known metadata key (`citations`, or the retired
    // `suggestedIntent` / `proposedSchemaField`, whose blocks are still
    // stripped post-A.5). Other parsed JSON is CONTENT and stays in the body.
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const block = parsed as Record<string, unknown>;
    // Shared predicate with the streaming redactor — one definition of "metadata
    // block", so the streaming and final-answer detectors can't drift.
    if (!isMetadataBlockObject(block)) continue;
    consumedMetadataBlock = true;
    cleaned = cleaned.replace(match[0], "");
    collectFromBlock(block);
  }

  // Last resort (U2): no fenced metadata block — accept ONE bare trailing
  // `{"citations": …}` object (the model sometimes drops the fence).
  if (!consumedMetadataBlock) {
    const bare = cleaned.match(/\{"citations"[\s\S]*\}\s*$/);
    if (bare) {
      try {
        const parsed = JSON.parse(bare[0].trim()) as unknown;
        if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
          cleaned = cleaned.replace(bare[0], "");
          collectFromBlock(parsed as Record<string, unknown>);
        }
      } catch {
        parseLosses.malformedJson += 1;
      }
    }
  }

  // Dedup identical entries merged across blocks (N4). `answerSpan` is IN
  // the key: two claims legitimately citing the same quote each keep theirs.
  const seen = new Set<string>();
  const deduped = collected.filter((c) => {
    const key = JSON.stringify([
      c.documentId,
      "page" in c ? c.page : null,
      "quote" in c ? c.quote : null,
      "field" in c ? c.field : null,
      "value" in c ? c.value : null,
      c.answerSpan ?? null,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const structuredCitations = deduped.length > 0 ? deduped : null;

  // Collapse any surrounding blank lines so the cleaned answer reads
  // naturally.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return {
    cleanedAnswer: cleaned,
    // Deprecated — always null after A.5; one-release shim.
    suggestedIntent: null,
    structuredCitations,
    parseLosses,
    // Deprecated — always null after A.5; populated via the
    // tool-call back-compat shim in routeChat. One-release shim.
    proposedSchemaField: null,
  };
}

/**
 * agentic-tool-loop — controller for the bounded server-side tool-result loop.
 * Injected by `groundedAnswerOverScope` (chat path only) so `callGroundedLlm`
 * stays catalog-agnostic. `isServerTool` is the cheap server-vs-routed
 * partition (no side effects); `execute` runs ONE server tool and returns its
 * result string + the activity/failure record. The loop calls `execute` only
 * on rounds it intends to continue (never on the capped round).
 */
export interface ServerToolLoop {
  maxRounds: number;
  isServerTool: (name: string) => boolean;
  execute: (call: RawToolCall) => Promise<ServerToolOutcome>;
}
export interface ServerToolOutcome {
  /** The string fed back to the model as the `role:"tool"` message content. */
  result: string;
  /** Present on success — surfaced on the reply's `toolActivity[]`. */
  activity?: ToolActivity;
  /** Present on validation/executor failure — merged into `toolFailures[]`. */
  failure?: ToolFailure;
}

/** A message in the running grounded transcript. Round 1 is `[system, user]`;
 * the loop appends assistant `tool_calls` + `role:"tool"` result messages.
 * `content` is `null` (not "") on an assistant message that carried only
 * tool_calls — the OpenAI-conventional shape, safest across the
 * provider-agnostic `LlmClient`. */
interface GroundedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** harden-citation-emission U2 — per-round output ceiling for the grounded
 * call. Generous (observed answers <500 tokens); the point is a
 * deterministic ceiling so provider defaults can never silently amputate
 * the trailing citations fence. */
const GROUNDED_MAX_COMPLETION_TOKENS = 4096;

/**
 * Grounded completion call. The system prompt is built by
 * `prompts/grounded.ts#buildGroundedSystem` (chat-architecture-hardening
 * Task 2 — every model-facing prompt lives in `services/prompts/`).
 *
 * agentic-tool-loop — when `serverToolLoop` is supplied (chat path), this runs
 * a BOUNDED loop: a tool call the controller recognizes as server-executed is
 * run, its result appended to the transcript as a `role:"tool"` message, and
 * the model re-called so it continues from the result. Tool calls the
 * controller does NOT recognize (intent/chip tools) accumulate and are
 * returned in `toolCalls` for the caller to route — exactly today's behavior
 * when no loop is supplied (every call is "routed"). The final round's prose
 * is the answer; a tool-only final round with no prose is resolved after the
 * loop (deterministic nav confirmation, or a tools-off answer-forcing dispatch).
 *
 * Structured outputs (still required):
 *   - `citations` array inside a fenced JSON block. `runRagPipeline` validates
 *     each entry's `documentId` against the snippet set before using it.
 *   - Token-budget guard: `buildSnippetBlock` truncates to
 *     `MAX_SNIPPET_BLOCK_CHARS` (most-relevant first, trailing dropped).
 */
export async function callGroundedLlm(
  userMessage: string,
  snippets: GroundXSearchResult[],
  llmClient: LlmClient,
  modelId: string,
  scopeHint?: { fileName?: string | null; scenarioTitle?: string | null },
  debug?: { llm?: ChatRouterDebug["llm"] },
  tools?: OpenAiFunctionTool[],
  /**
   * RAG + raw extraction (2026-06-11) — the primary document's FULL
   * workflow-extraction output as a JSON string. Search retrieves only the
   * top-K chunks; this block guarantees structured facts (meter numbers,
   * counts, totals) are always in front of the model. Null/omitted →
   * snippets-only prompt (unchanged behavior).
   */
  extraction?: string | null,
  /**
   * GroundX skill knowledge (2026-06-11) — prompt-ready sections retrieved
   * from the vendored groundx-agent-harness skill pack for product/meta
   * questions. Null/omitted → no knowledge block (ordinary document turns).
   * Replaces the retired hard-coded "ABOUT GROUNDX" capsule.
   */
  skillKnowledge?: string | null,
  /**
   * Hybrid merge (Task 3) — workspace-state block rendered into the system
   * prompt as the private WORKSPACE STATE section. Hybrid-caller only.
   */
  structuredContext?: string | null,
  /** Task 6 — generated TOOL NOTES section for the step-filtered catalog. */
  toolNotes?: string | null,
  /** agentic-tool-loop — bounded server-tool loop controller (chat path only). */
  serverToolLoop?: ServerToolLoop,
  /**
   * chat-response-streaming P1.1 — when present, the upstream completion is
   * requested with `stream: true` and each content delta is re-emitted via
   * `onToken` (the TurnRunner turns these into `token` SSE frames). Absent →
   * today's non-streaming JSON dispatch, byte-identical. A streaming-requested
   * provider that returns non-SSE falls back to JSON parsing (onToken just never
   * fires) so the transport stays provider-agnostic.
   */
  stream?: TurnStreamSink,
): Promise<{ answer: string; toolCalls: RawToolCall[]; toolActivity: ToolActivity[]; serverToolFailures: ToolFailure[]; truncated: boolean }> {
  // chat-response-streaming — an explicit `stream` arg wins (unit-test seam); else
  // the ambient per-turn sink the TurnRunner set (the production streaming path).
  // Undefined in every non-streaming caller → byte-identical behavior.
  const sink: TurnStreamSink | undefined = stream ?? turnStreamContext.getStore();
  const system = buildGroundedSystem({ extraction, skillKnowledge, structuredContext, toolNotes });

  const contextBlock = buildSnippetBlock(snippets);
  // Scope line — independent of snippet hits. Names the doc the user
  // is currently looking at so the model knows what to talk about
  // even when GroundX search returned 0 results. Goes ABOVE the
  // snippet block so the model reads it first.
  const scopeParts: string[] = [];
  if (scopeHint?.fileName) scopeParts.push(`file=${scopeHint.fileName}`);
  if (scopeHint?.scenarioTitle) scopeParts.push(`scenario=${scopeHint.scenarioTitle}`);
  const scopeLine = scopeParts.length > 0 ? `Working on: ${scopeParts.join(", ")}\n\n` : "";
  const extractionBlock = extraction ? `EXTRACTED FIELDS (full workflow output for this document):\n${extraction}\n\n` : "";
  const userContent = `${scopeLine}Snippets:\n${contextBlock}\n\n${extractionBlock}Question: ${userMessage}`;
  // The running transcript. Round 1 is exactly [system, user] (byte-identical
  // to the pre-loop request); the loop appends assistant + tool messages.
  const convo: GroundedMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userContent },
  ];

  // One LLM dispatch over the current transcript → normalized result.
  // `disableTools` omits the tool catalog entirely so the model MUST write an
  // answer instead of calling a tool — the answer-forcing round reuses this same
  // dispatch (streaming, output cap, turn-abort) rather than a separate builder.
  const dispatch = async (
    messages: GroundedMessage[],
    opts?: { disableTools?: boolean },
  ): Promise<{ rawAnswer: string; toolCalls: RawToolCall[]; finishReason: string | null }> => {
    logger.info(
      {
        groundedLlmCall: {
          model: modelId,
          snippetCount: snippets.length,
          snippetBlockChars: contextBlock.length,
          userMessage,
          systemChars: system.length,
          userContentChars: userContent.length,
          rounds: messages.length,
          systemContent: system,
          userContent,
        },
      },
      "grounded LLM dispatch",
    );
    // harden-citation-emission U2 — explicit output ceiling on EVERY round.
    // The citations fence is contractually LAST in the completion, so an
    // unbounded provider default that cuts the answer amputates exactly the
    // citations. `max_completion_tokens` per the in-repo precedent (the
    // summarizer; gpt-5 family deprecated `max_tokens`). Generous: observed
    // answers are <500 tokens — this is a deterministic ceiling, not a
    // constraint. No temperature pin (adversarial review m4).
    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages,
      max_completion_tokens: GROUNDED_MAX_COMPLETION_TOKENS,
    };
    // Phase 5 — advertise the (filtered) tool catalog via OpenAI function
    // calling. Always include the `tools` key when the caller passed one
    // (even if empty) so the "step with zero tools" test can assert shape.
    // `disableTools` (the answer-forcing round) omits the catalog outright so
    // the model can't call another tool and must answer.
    if (tools !== undefined && !opts?.disableTools) {
      requestBody.tools = tools;
      if (tools.length > 0) requestBody.tool_choice = "auto";
    }
    // chat-response-streaming P1.1 — ask the provider to stream when a caller
    // wants live tokens. The request is otherwise identical.
    if (sink?.onToken) requestBody.stream = true;
    const response = await llmClient.forward("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      // supersede-cancel: the runner's abort signal cancels this upstream call
      // (the LLM client composes it with the per-call timeout).
      ...(sink?.abortSignal ? { signal: sink.abortSignal } : {}),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "<unreadable>");
      throw new Error(`grounded llm call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
    }
    // Streaming path: consume SSE deltas, re-emitting each as `onToken`. We only
    // take this branch when the provider actually returned an event-stream — a
    // provider that ignored `stream:true` and returned JSON falls through to the
    // unchanged JSON parse below (graceful, provider-agnostic fallback).
    if (sink?.onToken && (response.headers.get("content-type") ?? "").includes("text/event-stream")) {
      const streamed = await consumeChatCompletionStream(response, { onText: sink.onToken });
      return { rawAnswer: streamed.rawAnswer, toolCalls: streamed.toolCalls, finishReason: streamed.finishReason };
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    const calls: RawToolCall[] = (message?.tool_calls ?? [])
      .filter((tc) => tc.type === "function" && tc.function?.name)
      .map((tc, idx) => ({
        id: tc.id ?? `call_${idx}`,
        name: tc.function!.name!,
        argumentsJson: tc.function!.arguments ?? "{}",
      }));
    return {
      rawAnswer: message?.content?.trim() ?? "",
      toolCalls: calls,
      finishReason: payload.choices?.[0]?.finish_reason ?? null,
    };
  };

  // Bounded loop. Routed (non-server) calls accumulate across ALL rounds; a
  // server call is executed, its result appended, and the model re-called.
  // No loop controller → every call is routed (today's single-shot behavior).
  const routed: RawToolCall[] = [];
  const toolActivity: ToolActivity[] = [];
  const serverToolFailures: ToolFailure[] = [];
  let rawAnswer = "";
  let lastRoundCalls: RawToolCall[] = [];
  let lastFinishReason: string | null = null;
  let round = 0;
  // Per-turn TOTAL server-tool execution budget — `maxRounds` bounds rounds, but a
  // single round can emit many tool calls (a prompt-injected document could ask for
  // dozens of live searches in one round). This caps the EXECUTIONS across the whole
  // turn so cost/latency can't be amplified by model output. Generous vs. legitimate
  // multi-document answers (most use 1–2); over-budget calls are REFUSED, never run.
  const maxServerToolCalls = serverToolLoop ? serverToolLoop.maxRounds * 2 : 0;
  let serverToolCallsExecuted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await dispatch(convo);
    rawAnswer = res.rawAnswer;
    lastRoundCalls = res.toolCalls;
    lastFinishReason = res.finishReason;
    if (res.finishReason === "length") {
      // A length-cut round lost output — on the FINAL round that output is
      // the citations fence. Warn per round; the returned `truncated` flag
      // tracks the final round only (intermediate rounds are tool plumbing).
      logger.warn(
        { groundedLlmTruncated: { round, answerChars: rawAnswer.length, model: modelId } },
        "grounded LLM completion was length-cut",
      );
    }
    const serverCalls = serverToolLoop ? res.toolCalls.filter((c) => serverToolLoop.isServerTool(c.name)) : [];
    for (const c of res.toolCalls) {
      if (!serverCalls.includes(c)) routed.push(c);
    }
    // Stop: no server call this round, no loop configured, or the round cap
    // was reached. The capped round's server calls are NOT executed (never
    // partially run a round we won't continue) — they are also NOT routed
    // (filtered out of `routed` above), so a server tool the model insists on
    // at the cap is simply dropped and the last prose wins. Routed calls from
    // the same round DO survive (already pushed above) — that asymmetry is
    // intentional: routed calls are client affordances, a capped server call
    // is just an un-taken retrieval.
    if (serverCalls.length === 0 || !serverToolLoop || round >= serverToolLoop.maxRounds) break;
    // Append the assistant tool_calls message + one tool-result per server call.
    // `content` is null (not "") on a tool-call-only turn — the OpenAI-
    // conventional shape, safest across the provider-agnostic LLM client.
    convo.push({
      role: "assistant",
      content: res.rawAnswer || null,
      tool_calls: serverCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.argumentsJson },
      })),
    });
    for (const call of serverCalls) {
      // Over the per-turn budget → REFUSE (don't execute). Still push a tool result
      // for EVERY call in the assistant message above (OpenAI requires one per
      // tool_call), and record a failure so the refusal isn't silent — the model
      // gets feedback instead of a hung/looping retrieval.
      if (serverToolCallsExecuted >= maxServerToolCalls) {
        logger.warn(
          { serverToolBudgetExhausted: { executed: serverToolCallsExecuted, max: maxServerToolCalls, tool: call.name } },
          "server-tool budget exhausted for this turn — refusing further tool executions",
        );
        convo.push({ role: "tool", tool_call_id: call.id, content: `${call.name} failed: tool budget exhausted for this turn` });
        serverToolFailures.push({ name: call.name, reason: "tool_budget_exhausted" });
        continue;
      }
      const outcome = await serverToolLoop.execute(call);
      serverToolCallsExecuted += 1;
      convo.push({ role: "tool", tool_call_id: call.id, content: outcome.result });
      if (outcome.activity) {
        toolActivity.push(outcome.activity);
        // chat-response-streaming — emit the activity LIVE (the "Checked GroundX
        // docs" indicator) the moment the tool ran, not just in the final envelope.
        sink?.onActivity?.(outcome.activity);
      }
      if (outcome.failure) serverToolFailures.push(outcome.failure);
    }
    round += 1;
  }

  // If the final round produced neither prose nor any tool call, it's a
  // useless reply — surface a specific error.
  if (!rawAnswer && lastRoundCalls.length === 0) {
    throw new Error("grounded llm call returned no content");
  }
  let answer = rawAnswer;
  // The final round selected tool(s) but wrote no prose, so the chat bubble would
  // be empty. Two DIFFERENT causes, handled differently (chat-QA audit):
  //
  //   A. Navigation / action tool-only (e.g. show_extraction). The grounded prompt
  //      already asks the model to write its reply in the SAME turn as the tool
  //      call; when it doesn't, a DETERMINISTIC confirmation is correct and
  //      instant. We do NOT make a second LLM call here — that call would only
  //      duplicate what the first call should have produced (and it 30s-hung).
  //
  //   B. No nav/action to confirm — e.g. the model called a SERVER tool (search)
  //      every round up to the loop cap without ever answering. Here a canned line
  //      would be wrong: the user asked a question and deserves an answer. So we
  //      force one by REUSING the loop's own `dispatch` with tools switched off:
  //      the model can no longer call a tool and must write an answer. That reuse
  //      is why this can't hang the way a bespoke non-streaming call did — it
  //      streams, is capped, and inherits the turn abort. It is bounded by the
  //      same 30s upstream fetch timeout as every other round (not the old 9s
  //      soft deadline, which only ever protected the now-deterministic nav path).
  //      Non-fatal: any failure falls back to an honest line rather than erroring
  //      the whole turn.
  //
  // `synthesizeToolOnlyConfirmation` returns null exactly when case B applies.
  if (lastRoundCalls.length > 0 && !parseGroundedAnswer(rawAnswer).cleanedAnswer) {
    const navConfirmation = synthesizeToolOnlyConfirmation(lastRoundCalls);
    if (navConfirmation) {
      // Case A — deterministic, no second LLM call.
      if (sink?.onToken) sink.onToken(navConfirmation);
      answer = rawAnswer ? `${navConfirmation}\n\n${rawAnswer}` : navConfirmation;
    } else {
      // Case B — force an answer via a tools-off dispatch (no separate builder).
      const selectedActions = lastRoundCalls.map((c) => `${c.name}(${c.argumentsJson})`).join("; ");
      convo.push({ role: "user", content: forceAnswerAfterToolsInstruction(selectedActions) });
      let forced = "";
      try {
        const res2 = await dispatch(convo, { disableTools: true });
        forced = res2.rawAnswer.trim();
        // The forced round IS the final answer now, so its finish reason is what
        // the returned `truncated` flag should reflect — overwrite unconditionally
        // (a prior tool-plumbing round being length-cut must not linger as truncated).
        lastFinishReason = res2.finishReason;
      } catch (err) {
        logger.warn({ err, tools: lastRoundCalls.map((c) => c.name) }, "answer-forcing dispatch failed — neutral fallback");
      }
      if (!forced) {
        // The model wrote nothing (empty completion) or the dispatch threw. There
        // is no navigation to confirm here, so fall back to an honest, non-
        // committal line rather than a fabricated answer or a generic error. The
        // streamed sink (if any) already emitted whatever tokens arrived; emit the
        // fallback line too so a streaming client isn't left with an empty bubble.
        forced = "I wasn't able to finish that — please try asking again.";
        if (sink?.onToken) sink.onToken(forced);
        // The fallback line is a complete, fixed string — it can't be "truncated",
        // so a prior length-cut round must not linger as truncated on the reply.
        lastFinishReason = null;
      }
      answer = rawAnswer ? `${forced}\n\n${rawAnswer}` : forced;
    }
  }
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
  return { answer, toolCalls: routed, toolActivity, serverToolFailures, truncated: lastFinishReason === "length" };
}

// A short, deterministic confirmation per navigation / action tool, used when a
// tool-only turn carries a dispatchable navigation but no prose, so the turn
// never lands with an empty bubble or a lost navigation. The model usually voices
// its own line (see the grounded prompt), so a compact local map is the right
// cost — no per-tool `confirmation` field is earned by a single consumer.
const TOOL_ONLY_CONFIRMATION: Record<string, string> = {
  open_document: "Opened the document for you.",
  jump_to_page: "Jumped to that page.",
  show_extraction: "Opening the extracted fields.",
  show_extraction_edit: "Opening the schema editor.",
  show_interact: "Opening the chat-with-sources view.",
  show_integrate: "Opening the integration options.",
  show_smart_report_render: "Putting the report together.",
  show_smart_report_edit: "Opening the report editor.",
  pin_to_report: "Pinned it to the report.",
};

/**
 * Does this tool call carry arguments that will actually VALIDATE + dispatch?
 * Mirrors the exact gate the intent router applies to a routed call
 * (`getServerTool` + `inputSchema.safeParse`, see the routing loop above), so the
 * confirmation can never claim an action for a call whose args are invalid and
 * would be silently dropped downstream (no "Opening the extracted fields." for a
 * navigation that never happens).
 */
function toolCallWillDispatch(call: RawToolCall): boolean {
  const tool = getServerTool(call.name);
  if (!tool || typeof tool.intentBuilder !== "function") return false;
  let args: unknown;
  try {
    args = JSON.parse(call.argumentsJson);
  } catch {
    return false;
  }
  return tool.inputSchema.safeParse(args).success;
}

/**
 * A deterministic one-line confirmation for a tool-only turn whose calls are
 * dispatchable NAVIGATION / ACTION tools — or `null` when there is nothing to
 * confirm (no dispatchable nav/action tool). `null` is the signal that this turn
 * is NOT a navigation (e.g. the model exhausted the server-tool loop without
 * writing prose), so the caller must fall back to a real LLM answer (a tools-off
 * dispatch) rather than a canned line. This is what lets us confirm a navigation
 * deterministically (no second LLM call) while still forcing a genuine answer
 * when there's nothing to confirm.
 */
export function synthesizeToolOnlyConfirmation(toolCalls: RawToolCall[]): string | null {
  const phrases = [
    ...new Set(
      toolCalls
        .filter(toolCallWillDispatch)
        .map((c) => TOOL_ONLY_CONFIRMATION[c.name])
        .filter(Boolean),
    ),
  ];
  return phrases.length > 0 ? phrases.join(" ") : null;
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
    const entry = `${snippetHeader(s, i)}\n${text}`;
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
