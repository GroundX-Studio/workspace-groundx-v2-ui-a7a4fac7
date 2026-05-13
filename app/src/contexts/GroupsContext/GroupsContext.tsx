import { createContext } from "react";

import { GroundXRequestOptions, PaginationParams, PartnerRequestOptions } from "@/api/common";
import { CreateGroundXGroupInput } from "@/api/entities/groundxGroupsEntity";
import { PartnerGroupInput } from "@/api/entities/partnerGroupsEntity";
import { Group } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface GroupsContextI {
  groundxGroups: Group[];
  partnerGroups: Group[];
  selectedGroup: Group | null;
  listGroundXGroups: (params?: PaginationParams, options?: GroundXRequestOptions) => Promise<SdkActionResult<Group[]>>;
  createGroundXGroup: (input: CreateGroundXGroupInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<Group>>;
  getGroundXGroup: (groupId: number, options?: GroundXRequestOptions) => Promise<SdkActionResult<Group>>;
  updateGroundXGroup: (groupId: number, name: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<Group>>;
  deleteGroundXGroup: (groupId: number, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  addBucketToGroundXGroup: (groupId: number, bucketId: number, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  removeBucketFromGroundXGroup: (groupId: number, bucketId: number, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  listPartnerGroups: (options?: PartnerRequestOptions) => Promise<SdkActionResult<Group[]>>;
  createPartnerGroup: (group: PartnerGroupInput, options?: PartnerRequestOptions) => Promise<SdkActionResult<Group>>;
  getPartnerGroup: (groupId: number, options?: PartnerRequestOptions) => Promise<SdkActionResult<Group>>;
  updatePartnerGroup: (groupId: number, group: PartnerGroupInput, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
  deletePartnerGroup: (groupId: number, options?: PartnerRequestOptions) => Promise<SdkActionResult<void>>;
}

export const GroupsContext = createContext<GroupsContextI | undefined>(undefined);

