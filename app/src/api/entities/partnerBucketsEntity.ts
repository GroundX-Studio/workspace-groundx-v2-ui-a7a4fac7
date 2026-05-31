import axios from "@/api/axios";
import { MessageResponse, RequestOptions, partnerRequestConfig, partnerUrl } from "@/api/common";

import { Bucket } from "./sdkTypes";

export interface PartnerBucketInput {
  name: string;
  preProcessors?: number[];
  postProcessors?: number[];
}

export interface PartnerBucketResponse {
  bucket: Bucket;
}

export interface PartnerBucketsResponse {
  buckets: Bucket[];
}

export const listPartnerBuckets = async (options?: RequestOptions): Promise<PartnerBucketsResponse> => {
  const response = await axios.get<PartnerBucketsResponse>(partnerUrl("/bucket"), partnerRequestConfig(options));
  return response.data;
};

export const createPartnerBucket = async (
  bucket: PartnerBucketInput,
  options?: RequestOptions
): Promise<PartnerBucketResponse> => {
  const response = await axios.post<PartnerBucketResponse>(partnerUrl("/bucket"), { bucket }, partnerRequestConfig(options));
  return response.data;
};

export const getPartnerBucket = async (bucketId: number, options?: RequestOptions): Promise<PartnerBucketResponse> => {
  const response = await axios.get<PartnerBucketResponse>(partnerUrl(`/bucket/${bucketId}`), partnerRequestConfig(options));
  return response.data;
};

export const updatePartnerBucket = async (
  bucketId: number,
  bucket: PartnerBucketInput,
  options?: RequestOptions
): Promise<MessageResponse> => {
  const response = await axios.put<MessageResponse>(
    partnerUrl(`/bucket/${bucketId}`),
    { bucket },
    partnerRequestConfig(options)
  );
  return response.data;
};

export const deletePartnerBucket = async (bucketId: number, options?: RequestOptions): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(partnerUrl(`/bucket/${bucketId}`), partnerRequestConfig(options));
  return response.data;
};

export const transferPartnerBucket = async (bucketId: number, options?: RequestOptions): Promise<MessageResponse> => {
  const response = await axios.post<MessageResponse>(
    partnerUrl(`/bucket/transfer/${bucketId}`),
    undefined,
    partnerRequestConfig(options)
  );
  return response.data;
};
