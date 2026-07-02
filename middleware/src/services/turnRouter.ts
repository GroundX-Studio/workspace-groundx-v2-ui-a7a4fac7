/**
 * Turn plan — the retrieval plan for a grounded answer.
 *
 * chat-unified-tool-loop removed the light-LLM planner (`planTurn`) and the
 * `appState` mode derivation: `routeChat` now runs ONE grounded tool-loop and
 * passes a FIXED plan (documentSearch on, productKnowledge off, extractionContext
 * on). This module survives only to carry the plan SHAPE consumed by
 * `groundedAnswerOverScope`: the `TurnPlan` type, the deterministic
 * `FALLBACK_TURN_PLAN` (used by the report path, which threads no plan), and the
 * `RETRIEVER_DECIDES` sentinel that means "run the skill retriever with its own
 * internal scoring gate intact."
 */

/**
 * Sentinel `productKnowledge` value: "run the retriever with its internal
 * scoring gate intact" (the deterministic default). The fixed chat plan sets
 * `productKnowledge: false` — GroundX-product knowledge is a tool now
 * (`lookup_groundx_knowledge`), not a planner-gated prompt block.
 */
export const RETRIEVER_DECIDES = "retriever-decides" as const;

/** The consumed plan. `productKnowledge: true` bypasses the retriever's
 * minDistinct/score entry bar; `false` skips retrieval; the sentinel runs
 * the retriever as-is. `extractionContext` is a plain boolean — `false` skips
 * the primary-doc extraction fetch, `true` runs it. */
export interface TurnPlan {
  documentSearch: boolean;
  productKnowledge: boolean | typeof RETRIEVER_DECIDES;
  extractionContext: boolean;
}

export const FALLBACK_TURN_PLAN: TurnPlan = {
  documentSearch: true,
  productKnowledge: RETRIEVER_DECIDES,
  extractionContext: true,
};
