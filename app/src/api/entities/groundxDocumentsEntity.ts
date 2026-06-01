import axios from "@/api/axios";
import {
  RequestOptions,
  MessageResponse,
  Metadata,
  PaginationParams,
  groundxRequestConfig,
  groundxUrl,
  paramsWithPagination,
} from "@/api/common";

import { DocumentSource, GroundXDocument, IngestProcess, WebsiteSource } from "./sdkTypes";

export interface IngestResponse {
  ingest: IngestProcess;
}

export interface IngestProcessesResponse {
  ingests?: IngestProcess[];
  processes?: IngestProcess[];
}

export interface DocumentsResponse {
  documents: GroundXDocument[];
  count?: number;
  total?: number;
  remaining?: number;
  nextToken?: string;
}

export interface DocumentResponse {
  document: GroundXDocument;
}


/**
 * The xray endpoint returns this shape at top level (verified
 * 2026-05-25 against `/v1/ingest/document/xray/{id}`). Documented
 * in `docs/agents/groundx-real-api-shapes.md`.
 *
 * 2026-06-01-data-model-tail item 4 — single-sourced on `@groundx/shared`
 * (the canonical strict X-Ray type family). Re-exported here so existing app
 * imports (`import { DocumentXrayResponse } from "@/api/entities/groundxDocumentsEntity"`)
 * keep resolving. The app↔shared pin + the middleware-side assignability tie are
 * enforced by `app/src/api/entities/xrayTypes.drift.test.ts` and
 * `middleware/src/services/citationGeometry.ts`.
 */
export type {
  XrayBoundingBox,
  XrayChunk,
  XrayDocumentPage,
  DocumentXrayResponse,
} from "@groundx/shared";
// Local import for the in-file `getGroundXDocumentXray` annotation (a type-only
// re-export above does not bring the name into this module's own scope).
import type { DocumentXrayResponse } from "@groundx/shared";

export interface IngestDocumentsInput {
  documents: DocumentSource[];
  callbackUrl?: string;
  callbackData?: string;
}

export interface CrawlWebsiteInput {
  websites: WebsiteSource[];
  callbackUrl?: string;
  callbackData?: string;
}

export interface CopyDocumentsInput {
  documentIds: string[];
  bucketId: number;
}

export interface UpdateDocumentsInput {
  documents: Array<{
    documentId: string;
    searchData?: Metadata;
    filter?: Metadata;
  }>;
  callbackUrl?: string;
  callbackData?: string;
}

export interface DeleteDocumentsInput {
  documentIds: string[];
}

export const copyGroundXDocuments = async (
  input: CopyDocumentsInput,
  options?: RequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(groundxUrl("/v1/ingest/copy"), input, groundxRequestConfig(options));
  return response.data;
};

export const ingestGroundXRemoteDocuments = async (
  input: IngestDocumentsInput,
  options?: RequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(
    groundxUrl("/v1/ingest/documents/remote"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const ingestGroundXLocalDocument = async (
  formData: FormData,
  options?: RequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(
    groundxUrl("/v1/ingest/documents/local"),
    formData,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const crawlGroundXWebsite = async (
  input: CrawlWebsiteInput,
  options?: RequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(
    groundxUrl("/v1/ingest/documents/website"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const listGroundXDocuments = async (
  params?: PaginationParams,
  options?: RequestOptions
): Promise<DocumentsResponse> => {
  const response = await axios.get<DocumentsResponse>(groundxUrl("/v1/ingest/documents"), {
    ...groundxRequestConfig(options),
    params: paramsWithPagination(params),
  });
  return response.data;
};

export const updateGroundXDocuments = async (
  input: UpdateDocumentsInput,
  options?: RequestOptions
): Promise<IngestResponse> => {
  const response = await axios.put<IngestResponse>(
    groundxUrl("/v1/ingest/documents"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXDocuments = async (
  input: DeleteDocumentsInput,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(groundxUrl("/v1/ingest/documents"), {
    ...groundxRequestConfig(options),
    data: input,
  });
  return response.data;
};

export const lookupGroundXDocument = async (
  id: string,
  options?: RequestOptions
): Promise<DocumentResponse> => {
  const response = await axios.get<DocumentResponse>(
    groundxUrl(`/v1/ingest/documents/${encodeURIComponent(id)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXDocument = async (
  documentId: string,
  options?: RequestOptions
): Promise<DocumentResponse> => {
  const response = await axios.get<DocumentResponse>(
    groundxUrl(`/v1/ingest/document/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXDocument = async (
  documentId: string,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/ingest/document/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

/**
 * The extract endpoint returns the raw extracted JSON at top level (verified
 * 2026-05-25 against `/v1/ingest/document/extract/{id}`): snake_case field-id
 * keys → scalars / nested objects / arrays; currency fields pair with a
 * `<id>_currency` sibling; schema metadata lives in the workflow, not here. So
 * the return is the generic `Metadata` — strict typing would commit to one
 * scenario's shape. (No `DocumentExtractResponse` alias.)
 */
export const getGroundXDocumentExtract = async (
  documentId: string,
  options?: RequestOptions
): Promise<Metadata> => {
  const response = await axios.get<Metadata>(
    groundxUrl(`/v1/ingest/document/extract/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXDocumentXray = async (
  documentId: string,
  options?: RequestOptions
): Promise<DocumentXrayResponse> => {
  const response = await axios.get<DocumentXrayResponse>(
    groundxUrl(`/v1/ingest/document/xray/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXProcessingStatus = async (
  processId: string,
  options?: RequestOptions
): Promise<IngestResponse> => {
  const response = await axios.get<IngestResponse>(
    groundxUrl(`/v1/ingest/${encodeURIComponent(processId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const cancelGroundXProcess = async (
  processId: string,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/ingest/${encodeURIComponent(processId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const listGroundXProcesses = async (options?: RequestOptions): Promise<IngestProcessesResponse> => {
  const response = await axios.get<IngestProcessesResponse>(groundxUrl("/v1/ingest"), groundxRequestConfig(options));
  return response.data;
};

