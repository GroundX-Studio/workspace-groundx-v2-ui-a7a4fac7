import { createContext } from "react";

import { GroundXRequestOptions, PaginationParams, PartnerRequestOptions } from "@/api/common";
import { PartnerBucketInput } from "@/api/entities/partnerBucketsEntity";
import { Bucket } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface BucketsContextI {
  groundxBuckets: Bucket[];
  partnerBuckets: Bucket[];
  selectedBucket: Bucket | null;
  listGroundXBuckets: (params?: PaginationParams, options?: GroundXRequestOptions) => Promise<SdkActionResult<Bucket[]>>;
  getGroundXBucket: (bucketId: number, options?: GroundXRequestOptions) => Promise<SdkActionResult<Bucket>>;
  createGroundXBucket: (name: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<Bucket>>;
  updateGroundXBucket: (bucketId: number, name: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<Bucket>>;
  deleteGroundXBucket: (bucketId: number, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  listPartnerBuckets: (options?: PartnerRequestOptions) => Promise<SdkActionResult<Bucket[]>>;
  getPartnerBucket: (bucketId: number, options?: PartnerRequestOptions) => Promise<SdkActionResult<Bucket>>;
  createPartnerBucket: (bucket: PartnerBucketInput, options?: PartnerRequestOptions) => Promise<SdkActionResult<Bucket>>;
  updatePartnerBucket: (bucketId: number, bucket: PartnerBucketInput, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
  deletePartnerBucket: (bucketId: number, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
}

export const BucketsContext = createContext<BucketsContextI | undefined>(undefined);

