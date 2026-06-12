/**
 * Light-LLM turn router (chat-architecture-hardening Task 4).
 *
 * Classifies each user turn BEFORE retrieval: run the GroundX document
 * search? the skill-pack retrieval? the extraction-context fetch? And —
 * via `appState` (turn-router-extraction-appstate) — which MODE the turn
 * routes to. The decision record is the extensibility axis — adding a
 * classification scenario is a new flag on the record consumed at its
 * gate, never a parallel classifier. The keyword `classifyChatMode`
 * router's former exemption is closed by `appState`: it survives ONLY as
 * the intent-hint fast path and the deterministic fallback.
 *
 * The planner runs ONLY when a light client is configured (CF-16
 * `LLM_LIGHT_*`) — it never borrows the main chat client. EVERY failure
 * mode (absent client, timeout, non-2xx, garbage, schema violation) falls
 * back DETERMINISTICALLY to `FALLBACK_ROUTE_PLAN`: the keyword classifier
 * routes, the search runs, extraction fetches, and the skill decision goes
 * to the retriever's own internal scoring gate — byte-for-byte the
 * pre-router behavior. The fallback IS the test-determinism story.
 */
import { z } from "zod";

import { buildTurnRouterPrompt } from "./prompts/turnRouter.js";
import { logger } from "../lib/logger.js";
import type { LlmClient } from "../types.js";

/**
 * Internal sentinel: the consumed `productKnowledge` value that means "run
 * the retriever with its internal scoring gate intact" (the deterministic
 * fallback). NEVER emitted by the model — the LLM record is pure booleans.
 */
export const RETRIEVER_DECIDES = "retriever-decides" as const;

/**
 * Internal sentinel for the `appState` ROUTING flag: "the deterministic
 * keyword classifier (`classifyChatMode`) picks the mode" — byte-for-byte
 * the pre-flag routing. NEVER emitted by the model (the LLM record is pure
 * booleans); it is the deterministic-fallback value, mirroring
 * RETRIEVER_DECIDES.
 */
export const CLASSIFIER_DECIDES = "classifier-decides" as const;

/** What the light LLM emits — extensible: unknown future flags tolerated. */
export const turnPlanSchema = z
  .object({
    documentSearch: z.boolean(),
    productKnowledge: z.boolean(),
    // Schema-optional for tolerance of partial model output; omitted flags
    // normalize to their fallback values below (`true` / CLASSIFIER_DECIDES
    // — today's behavior on each axis).
    extractionContext: z.boolean().optional(),
    appState: z.boolean().optional(),
  })
  .passthrough();

/** The consumed plan. `productKnowledge: true` bypasses the retriever's
 * minDistinct/score entry bar; `false` skips retrieval; the sentinel runs
 * the retriever as-is. `extractionContext` is a plain boolean — no sentinel,
 * because the pre-flag behavior (fetch the primary doc's extraction whenever
 * one exists) is itself deterministic: `false` skips the fetch entirely,
 * `true` runs it exactly as before. */
export interface TurnPlan {
  documentSearch: boolean;
  productKnowledge: boolean | typeof RETRIEVER_DECIDES;
  extractionContext: boolean;
}

/**
 * The router-consumed plan: the seam plan PLUS the required `appState`
 * routing flag. `appState` is consumed ONLY by `routeChat`'s mode
 * derivation — the router strips it before threading a `TurnPlan` into the
 * grounded seam, and fixed seam plans never carry it.
 */
export interface RoutePlan extends TurnPlan {
  appState: boolean | typeof CLASSIFIER_DECIDES;
}

export const FALLBACK_TURN_PLAN: TurnPlan = {
  documentSearch: true,
  productKnowledge: RETRIEVER_DECIDES,
  extractionContext: true,
};

export const FALLBACK_ROUTE_PLAN: RoutePlan = {
  ...FALLBACK_TURN_PLAN,
  appState: CLASSIFIER_DECIDES,
};

export interface PlanTurnDeps {
  lightLlmClient?: LlmClient;
  lightLlmModelId?: string;
  /** Abort budget for the planner call. Default 3s — the live light model
   * (gpt-5.4-mini-class) regularly needs >1s; outliers hit the deterministic
   * fallback. */
  timeoutMs?: number;
}

/** Router-facing planner: returns the full RoutePlan. (A RoutePlan is
 * structurally assignable where a seam `TurnPlan` consumer reads only the
 * seam fields — the seam never reads `appState`.) */
export type PlanTurnFn = (question: string) => Promise<RoutePlan>;

export async function planTurn(question: string, deps: PlanTurnDeps): Promise<RoutePlan> {
  if (!deps.lightLlmClient || !deps.lightLlmModelId) return FALLBACK_ROUTE_PLAN;

  const { system, user } = buildTurnRouterPrompt(question);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 3_000);
  try {
    const response = await deps.lightLlmClient.forward("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: deps.lightLlmModelId,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return FALLBACK_ROUTE_PLAN;
    const payload = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) return FALLBACK_ROUTE_PLAN;
    // Lenient fence-strip (models ignore "no fences" sometimes).
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const body = fence ? fence[1].trim() : content;
    const parsed = turnPlanSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return FALLBACK_ROUTE_PLAN;
    return {
      documentSearch: parsed.data.documentSearch,
      productKnowledge: parsed.data.productKnowledge,
      extractionContext: parsed.data.extractionContext ?? true,
      appState: parsed.data.appState ?? CLASSIFIER_DECIDES,
    };
  } catch (err) {
    logger.warn({ err }, "planTurn: light-LLM classification failed — deterministic fallback");
    return FALLBACK_ROUTE_PLAN;
  } finally {
    clearTimeout(timer);
  }
}
