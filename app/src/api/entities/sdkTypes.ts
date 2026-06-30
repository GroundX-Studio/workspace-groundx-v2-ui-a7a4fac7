import { Metadata } from "@/api/common";

// (Removed the unused `SdkMessageResponse` — it had zero callers and was an
// exact duplicate of `MessageResponse` in `@/api/common`, which is the one
// the ~20 entity wrappers actually use.)

export interface SdkListResponse<T, _K extends string> {
  count?: number;
  total?: number;
  remaining?: number;
  nextToken?: string;
  [key: string]: T[] | number | string | undefined;
}

export interface GroundXApiKey {
  apiKey: string;
  name: string;
  created?: string;
}

export interface Bucket {
  bucketId: number;
  name: string;
  fileCount?: number | null;
  fileSize?: string | null;
  created?: string;
  updated?: string;
  preProcessors?: number[];
  postProcessors?: number[];
}

export interface Group {
  groupId: number;
  name: string;
  buckets?: Bucket[];
  fileCount?: number | null;
  fileSize?: string | null;
  created?: string;
  updated?: string;
  preProcessors?: number[];
  postProcessors?: number[];
}

export interface Project {
  projectId: number;
  name: string;
  customerProjectId?: string;
  preProcessors?: number[];
  postProcessors?: number[];
}

export interface CustomerSubscriptionMeter {
  value: number;
  max: number;
}

export interface GroundXCustomer {
  email: string;
  first?: string;
  last?: string;
  subscription?: {
    meters?: {
      fileTokens?: CustomerSubscriptionMeter;
      searches?: CustomerSubscriptionMeter;
    };
  };
}

/**
 * A document record inside an ingest-status `progress` bucket. Probe-verified
 * 2026-06-01 against `GET /v1/ingest/{processId}` (see
 * `docs/agents/groundx-real-api-shapes.md`): each bucket document is a rich
 * `GroundXDocument`-shaped record. Modeled as a partial GroundXDocument plus the
 * extra ingest-status fields the status payload adds (`fileSize`, `fileTokens`,
 * `processLevel`, `xrayUrl`, `extracted`, `created`, `updated`). Loose `[key]`
 * inherited from `GroundXDocument` keeps unknown fields readable.
 */
export interface IngestProcessDocument extends GroundXDocument {
  fileSize?: string;
  fileTokens?: number;
  processLevel?: "full" | "none" | string;
  xrayUrl?: string;
  extracted?: boolean;
  created?: string;
  updated?: string;
}

/** One `progress` bucket of an ingest-status response (e.g. `complete`). */
export interface IngestProgressBucket {
  total: number;
  documents: IngestProcessDocument[];
}

/**
 * The ingest `progress` object. Probe-verified 2026-06-01: only the non-empty
 * buckets are present in a live response, so every bucket is optional. The five
 * bucket names mirror the status lifecycle (ref `groundx-api` §5).
 */
export interface IngestProgress {
  queued?: IngestProgressBucket;
  processing?: IngestProgressBucket;
  complete?: IngestProgressBucket;
  errors?: IngestProgressBucket;
  cancelled?: IngestProgressBucket;
}

/**
 * The `ingest` object returned by the ingest endpoints. ONE type spanning two
 * observed states (probe-verified 2026-06-01,
 * `docs/agents/groundx-real-api-shapes.md`):
 *
 * - LIGHT — submit/poll-list (`POST /v1/ingest/*`, each `GET /v1/ingest` list
 *   item / `IngestStatusLight`): `processId` + `status` (+ `id` / `statusMessage`).
 * - HEAVY — status (`GET /v1/ingest/{processId}`): adds the `progress` buckets.
 *
 * Everything past `processId` / `status` is optional, so the single type covers
 * submit, poll, list, and cancel responses. (`statusMessage` is the canonical
 * field name — the prior `message` was an unverified guess; it is gone.)
 */
export interface IngestProcess {
  processId: string;
  status: "queued" | "training" | "processing" | "complete" | "error" | "cancelled" | string;
  /** Integer process row id (present on the list-light + status shapes). */
  id?: number;
  /** Human-readable message; populated when `status === "error"`. */
  statusMessage?: string;
  /** Per-status-bucket document breakdown (status endpoint only). */
  progress?: IngestProgress;
}

export interface DocumentSource {
  bucketId: number;
  sourceUrl: string;
  fileName?: string;
  fileType?: string;
  processLevel?: "full" | "none";
  searchData?: Metadata;
  filter?: Metadata;
}

export interface WebsiteSource {
  bucketId: number;
  sourceUrl: string;
  depth?: number;
  cap?: number;
  searchData?: Metadata;
}

export interface GroundXDocument {
  documentId: string;
  bucketId?: number;
  fileName?: string;
  fileType?: string;
  sourceUrl?: string;
  status?: string;
  processId?: string;
  searchData?: Metadata;
  filter?: Metadata;
  [key: string]: unknown;
}

/** WF-03 — native page-pixel corners of a chunk's region on a page. */
export interface SearchResultBoundingBox {
  pageNumber: number;
  topLeftX: number;
  topLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
  corrected?: boolean;
}

/** WF-03 — rendered page image + native pixel dims for bbox scaling. */
export interface SearchResultPage {
  number: number;
  width: number;
  height: number;
  imageUrl?: string;
}

export interface SearchResult {
  text?: string;
  suggestedText?: string;
  score?: number;
  documentId?: string;
  processId?: string;
  fileName?: string;
  sourceUrl?: string;
  chunkId?: string;
  bucketId?: number;
  boundingBoxes?: SearchResultBoundingBox[];
  pageImages?: string[];
  pages?: SearchResultPage[];
  multimodalUrl?: string;
  searchData?: Metadata;
}

export interface SearchResponseBody {
  text?: string;
  query?: string;
  searchQuery?: string;
  count?: number;
  score?: number;
  results?: SearchResult[];
  nextToken?: string;
}

export interface Workflow {
  workflowId: string;
  name?: string;
  chunkStrategy?: "element" | "size" | string;
  sectionStrategy?: "chunks" | "page" | string;
  steps?: Metadata;
  extract?: Metadata;
}

export interface PartnerCustomer {
  username: string;
  email: string;
  company?: string;
  first?: string;
  last?: string;
  partnerUserId?: string;
  phone?: string;
}

