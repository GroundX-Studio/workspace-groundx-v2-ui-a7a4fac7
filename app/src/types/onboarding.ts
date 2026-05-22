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

export type FFrame = "f1" | "f2" | "f3" | "f3a" | "f4" | "f5" | "f6" | "f7";

export type GateTrigger = "save" | "export" | "byo" | "threshold";

export type AuthState = "anonymous" | "signed-in";

/**
 * ContentScope — what set of documents an extraction or chat call applies to.
 * Always one of: a whole bucket, a group, or an explicit list of documents.
 * See `project-groundx-types` memory.
 */
export type ContentScope =
  | { type: "bucket"; bucketId: number }
  | { type: "group"; groupId: number }
  | { type: "documents"; documentIds: string[] };

export interface Citation {
  /** Source document ID. */
  documentId: string;
  /** 1-indexed page number. */
  page: number;
  /** Optional bounding box on the page in normalized coords (0-1). */
  bbox?: { x: number; y: number; w: number; h: number };
  /** Snippet text shown in the peek. */
  snippet?: string;
  /** Confidence score 0-1, optional. */
  confidence?: number;
}

export interface UsageCounters {
  /** Pages of BYO docs ingested in the pre-signin session. */
  byoPages: number;
  /** Page-limit ceiling (env-configurable, default 100). */
  byoPagesLimit: number;
}
