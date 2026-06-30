import axios from "@/api/axios";
import {
  RequestOptions,
  MessageResponse,
  PaginationParams,
  groundxRequestConfig,
  groundxUrl,
  paramsWithPagination,
} from "@/api/common";

import { Bucket } from "./sdkTypes";

export interface BucketResponse {
  bucket: Bucket;
}

export interface BucketsResponse {
  buckets: Bucket[];
  count?: number;
  total?: number;
  remaining?: number;
  nextToken?: string;
}

export const listGroundXBuckets = async (
  params?: PaginationParams,
  options?: RequestOptions
): Promise<BucketsResponse> => {
  const response = await axios.get<BucketsResponse>(groundxUrl("/v1/bucket"), {
    ...groundxRequestConfig(options),
    params: paramsWithPagination(params),
  });
  return response.data;
};

export const createGroundXBucket = async (name: string, options?: RequestOptions): Promise<BucketResponse> => {
  const response = await axios.post<BucketResponse>(groundxUrl("/v1/bucket"), { name }, groundxRequestConfig(options));
  return response.data;
};

export const getGroundXBucket = async (
  bucketId: number,
  options?: RequestOptions
): Promise<BucketResponse> => {
  const response = await axios.get<BucketResponse>(groundxUrl(`/v1/bucket/${bucketId}`), groundxRequestConfig(options));
  return response.data;
};

export const updateGroundXBucket = async (
  bucketId: number,
  newName: string,
  options?: RequestOptions
): Promise<BucketResponse> => {
  const response = await axios.put<BucketResponse>(
    groundxUrl(`/v1/bucket/${bucketId}`),
    { newName },
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXBucket = async (
  bucketId: number,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(groundxUrl(`/v1/bucket/${bucketId}`), groundxRequestConfig(options));
  return response.data;
};

