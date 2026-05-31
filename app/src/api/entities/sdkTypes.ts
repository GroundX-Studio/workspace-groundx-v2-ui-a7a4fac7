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

export interface IngestProcess {
  processId: string;
  status: "queued" | "processing" | "complete" | "error" | "cancelled" | string;
  message?: string;
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

