import { createContext } from "react";

import { RequestOptions, PaginationParams } from "@/api/common";
import { CreateGroundXGroupInput } from "@/api/entities/groundxGroupsEntity";
import { PartnerGroupInput } from "@/api/entities/partnerGroupsEntity";
import { Group } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface GroupsContextI {
  groundxGroups: Group[];
  partnerGroups: Group[];
  selectedGroup: Group | null;
  listGroundXGroups: (params?: PaginationParams, options?: RequestOptions) => Promise<SdkActionResult<Group[]>>;
  createGroundXGroup: (input: CreateGroundXGroupInput, options?: RequestOptions) => Promise<SdkActionResult<Group>>;
  getGroundXGroup: (groupId: number, options?: RequestOptions) => Promise<SdkActionResult<Group>>;
  updateGroundXGroup: (groupId: number, name: string, options?: RequestOptions) => Promise<SdkActionResult<Group>>;
  deleteGroundXGroup: (groupId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  addBucketToGroundXGroup: (groupId: number, bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  removeBucketFromGroundXGroup: (groupId: number, bucketId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  listPartnerGroups: (options?: RequestOptions) => Promise<SdkActionResult<Group[]>>;
  createPartnerGroup: (group: PartnerGroupInput, options?: RequestOptions) => Promise<SdkActionResult<Group>>;
  getPartnerGroup: (groupId: number, options?: RequestOptions) => Promise<SdkActionResult<Group>>;
  updatePartnerGroup: (groupId: number, group: PartnerGroupInput, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  deletePartnerGroup: (groupId: number, options?: RequestOptions) => Promise<SdkActionResult<void>>;
}

export const GroupsContext = createContext<GroupsContextI | undefined>(undefined);

