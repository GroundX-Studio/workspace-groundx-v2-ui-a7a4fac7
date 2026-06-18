/**
 * GroundX V2 Onboarding — shared product types.
 *
 * Kept narrow on purpose. Each context owns its own state shape. This file
 * holds only the cross-context vocabulary used by the F-series flow.
 *
 * See `project-groundx-types` memory for full TS shapes including ContentScope
 * and per-scenario fixtures.
 */

export type AppMode = "onboarding" | "steady";

export type Scenario = "utility" | "loan" | "solar";

export type GateTrigger = "save" | "export" | "byo" | "threshold";

export type AuthState = "anonymous" | "signed-in";

/**
 * ContentScope — what set of documents an extraction / chat / report call
 * applies to: a whole bucket, a group, or an explicit list of documents, each
 * with an optional composable `filter` (project/portfolio/fund/folder
 * filter-fields). Now the single shared wire contract (`@groundx/shared`) —
 * the middleware consumes the same shape (was the diverged `RagContentScope`).
 * Re-exported here so existing `@/types/onboarding` imports keep resolving.
 */
export type { ContentScope, ScopeFilter } from "@groundx/shared";

/**
 * WF-06 / WF-06b — graduated source-attribution precision (PER region,
 * multi-region-citations).
 *   exact      verified verbatim quote + atom box → tight word-level highlight
 *   paraphrase verified quote / located value → chunk-region highlight (translucent)
 *   ambient    location uncertain (NOT truth uncertain) — two honest forms:
 *              (a) an unverified QUOTE → a whole-PAGE marker ("unconfirmed");
 *              (b) a validated-but-unlocatable extraction VALUE → a label-located
 *                  region, or a REGIONLESS source chip when even that fails.
 *              A real grounding always shows SOMETHING — never silently vanishes.
 * Mirrors the shared `citationTierSchema`. The render handles all three; the
 * page-marker / regionless rendering lands in multi-region-citations P2.
 */
// `Citation`, `CitationTier`, and `NormalizedBbox` now live in the shared wire
// contract (`@groundx/shared`, schema-as-source-of-truth). Re-exported here so
// existing `@/types/onboarding` imports keep resolving unchanged.
export type { Citation, CitationTier, NormalizedBbox } from "@groundx/shared";

export interface UsageCounters {
  /** Pages of BYO docs ingested in the pre-signin session. */
  byoPages: number;
  /** Page-limit ceiling (env-configurable, default 100). */
  byoPagesLimit: number;
}
