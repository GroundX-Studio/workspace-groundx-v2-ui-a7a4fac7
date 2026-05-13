import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { GroundXRequestOptions, PaginationParams, PartnerRequestOptions } from "@/api/common";
import { PartnerBucketInput } from "@/api/entities/partnerBucketsEntity";
import { Bucket } from "@/api/entities/sdkTypes";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { BucketsContext } from "./BucketsContext";

export const BucketsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage, setSuccessMessage } = useMessageContext();
  const [groundxBuckets, setGroundXBuckets] = useState<Bucket[]>([]);
  const [partnerBuckets, setPartnerBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);

  const run = useCallback(
    async <T,>(work: () => Promise<T>, errorMessage = "Bucket operation failed.", successMessage?: string) => {
      const result = createSdkResult<T>();
      setIsLoading(true);
      try {
        result.response = await work();
        result.isSuccess = true;
        if (successMessage) setSuccessMessage(successMessage);
      } catch (error) {
        result.error = error;
        setErrorMessage(errorMessage);
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading, setSuccessMessage]
  );

  const listGroundXBuckets = useCallback(
    (params?: PaginationParams, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxBuckets.listGroundXBuckets(params, options);
        setGroundXBuckets(response.buckets);
        return response.buckets;
      }),
    [run]
  );

  const getGroundXBucket = useCallback(
    (bucketId: number, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxBuckets.getGroundXBucket(bucketId, options);
        setSelectedBucket(response.bucket);
        return response.bucket;
      }),
    [run]
  );

  const createGroundXBucket = useCallback(
    (name: string, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxBuckets.createGroundXBucket(name, options);
        setGroundXBuckets((buckets) => [response.bucket, ...buckets]);
        return response.bucket;
      }, "Bucket operation failed.", "Bucket created."),
    [run]
  );

  const updateGroundXBucket = useCallback(
    (bucketId: number, name: string, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxBuckets.updateGroundXBucket(bucketId, name, options);
        setGroundXBuckets((buckets) => buckets.map((bucket) => (bucket.bucketId === bucketId ? response.bucket : bucket)));
        setSelectedBucket(response.bucket);
        return response.bucket;
      }, "Bucket operation failed.", "Bucket updated."),
    [run]
  );

  const deleteGroundXBucket = useCallback(
    (bucketId: number, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxBuckets.deleteGroundXBucket(bucketId, options);
        setGroundXBuckets((buckets) => buckets.filter((bucket) => bucket.bucketId !== bucketId));
        setSelectedBucket((bucket) => (bucket?.bucketId === bucketId ? null : bucket));
      }, "Bucket operation failed.", "Bucket deleted."),
    [run]
  );

  const listPartnerBuckets = useCallback(
    (options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerBuckets.listPartnerBuckets(options);
        setPartnerBuckets(response.buckets);
        return response.buckets;
      }),
    [run]
  );

  const getPartnerBucket = useCallback(
    (bucketId: number, options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerBuckets.getPartnerBucket(bucketId, options);
        setSelectedBucket(response.bucket);
        return response.bucket;
      }),
    [run]
  );

  const createPartnerBucket = useCallback(
    (bucket: PartnerBucketInput, options?: PartnerRequestOptions) =>
      run(async () => {
        const response = await api.partnerBuckets.createPartnerBucket(bucket, options);
        setPartnerBuckets((buckets) => [response.bucket, ...buckets]);
        return response.bucket;
      }, "Bucket operation failed.", "Bucket created."),
    [run]
  );

  const updatePartnerBucket = useCallback(
    (bucketId: number, bucket: PartnerBucketInput, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerBuckets.updatePartnerBucket(bucketId, bucket, options);
        setPartnerBuckets((buckets) => buckets.map((item) => (item.bucketId === bucketId ? { ...item, ...bucket } : item)));
      }, "Bucket operation failed.", "Bucket updated."),
    [run]
  );

  const deletePartnerBucket = useCallback(
    (bucketId: number, options?: PartnerRequestOptions) =>
      run(async () => {
        await api.partnerBuckets.deletePartnerBucket(bucketId, options);
        setPartnerBuckets((buckets) => buckets.filter((bucket) => bucket.bucketId !== bucketId));
      }, "Bucket operation failed.", "Bucket deleted."),
    [run]
  );

  return (
    <BucketsContext.Provider
      value={{
        groundxBuckets,
        partnerBuckets,
        selectedBucket,
        listGroundXBuckets,
        getGroundXBucket,
        createGroundXBucket,
        updateGroundXBucket,
        deleteGroundXBucket,
        listPartnerBuckets,
        getPartnerBucket,
        createPartnerBucket,
        updatePartnerBucket,
        deletePartnerBucket,
      }}
    >
      {children}
    </BucketsContext.Provider>
  );
};

