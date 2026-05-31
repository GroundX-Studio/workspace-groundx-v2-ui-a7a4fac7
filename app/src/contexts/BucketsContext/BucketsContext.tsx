import { createContext } from "react";

import { RequestOptions, PaginationParams } from "@/api/common";
import { PartnerBucketInput } from "@/api/entities/partnerBucketsEntity";
import { Bucket } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface BucketsContextI {
  groundxBuckets: Bucket[];
  partnerBuckets: Bucket[];
  selectedBucket: Bucket | null;
  listGroundXBuckets: (params?: PaginationParams, options?: RequestOptions) => Promise<SdkActionResult<Bucket[]>>;
  getGroundXBucket: (bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<Bucket>>;
  createGroundXBucket: (name: string, options?: RequestOptions) => Promise<SdkActionResult<Bucket>>;
  updateGroundXBucket: (bucketId: number, name: string, options?: RequestOptions) => Promise<SdkActionResult<Bucket>>;
  deleteGroundXBucket: (bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  listPartnerBuckets: (options?: RequestOptions) => Promise<SdkActionResult<Bucket[]>>;
  getPartnerBucket: (bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<Bucket>>;
  createPartnerBucket: (bucket: PartnerBucketInput, options?: RequestOptions) => Promise<SdkActionResult<Bucket>>;
  updatePartnerBucket: (bucketId: number, bucket: PartnerBucketInput, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  deletePartnerBucket: (bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
}

export const BucketsContext = createContext<BucketsContextI | undefined>(undefined);

