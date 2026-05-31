import axios from "@/api/axios";
import { RequestOptions, Metadata, groundxRequestConfig, groundxUrl } from "@/api/common";

import { SearchResponseBody } from "./sdkTypes";

export interface SearchParams {
  n?: number;
  nextToken?: string;
  verbosity?: 0 | 1 | 2;
}

export interface SearchContentInput extends SearchParams {
  id: number | string;
  query: string;
  relevance?: number;
  filter?: Metadata;
}

export interface SearchDocumentsInput extends SearchParams {
  documentIds: string[];
  query: string;
  relevance?: number;
  filter?: Metadata;
}

export interface SearchResponse {
  search: SearchResponseBody;
}

const searchParams = ({ n, nextToken, verbosity }: SearchParams) => ({
  ...(n !== undefined ? { n } : {}),
  ...(nextToken ? { nextToken } : {}),
  ...(verbosity !== undefined ? { verbosity } : {}),
});

export const searchGroundXContent = async (
  { id, query, relevance, filter, ...params }: SearchContentInput,
  options?: RequestOptions
): Promise<SearchResponse> => {
  const response = await axios.post<SearchResponse>(
    groundxUrl(`/v1/search/${encodeURIComponent(String(id))}`),
    { query, ...(relevance !== undefined ? { relevance } : {}), ...(filter ? { filter } : {}) },
    { ...groundxRequestConfig(options), params: searchParams(params) }
  );
  return response.data;
};

export const searchGroundXDocuments = async (
  { documentIds, query, relevance, filter, ...params }: SearchDocumentsInput,
  options?: RequestOptions
): Promise<SearchResponse> => {
  const response = await axios.post<SearchResponse>(
    groundxUrl("/v1/search/documents"),
    { documentIds, query, ...(relevance !== undefined ? { relevance } : {}), ...(filter ? { filter } : {}) },
    { ...groundxRequestConfig(options), params: searchParams(params) }
  );
  return response.data;
};

