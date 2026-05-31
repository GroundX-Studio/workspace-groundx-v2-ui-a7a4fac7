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

// `f4` = Report render (S3), `f4a` = Report builder (S3a) — mirrors the
// Extract `f3`/`f3a` render/builder split (2026-05-29-smart-report-screen
// Phase 1 / design.md D1).
export type FFrame = "f1" | "f2" | "f3" | "f3a" | "f4" | "f4a" | "f5" | "f6" | "f7";

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
 * WF-06 / WF-06b — graduated source-attribution precision.
 *   exact      verified verbatim quote + atom box → tight word-level highlight
 *   paraphrase verified quote → chunk-region highlight (translucent, lower-confidence)
 *   ambient    unverified / retrieved-only → source chip, no inline span
 * The middleware emits `paraphrase`/`ambient` today; `exact` is dormant
 * until WF-05 1b's `-118-map` atom resolver lands. The render handles all
 * three regardless, so `exact` lights up automatically once it ships.
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
